"""Unit tests for the pure dispatcher state machine."""

from __future__ import annotations

import json

from workspace_backend.domain.models import RuntimeStatus, SessionMode
from workspace_backend.services.agent_pool.dispatcher import RuntimeState, dispatch


def test_session_captures_capabilities() -> None:
    raw = json.dumps({"type": "session", "modes": ["default", "yolo"], "commands": [{"name": "clear"}]})
    d = dispatch(raw, RuntimeState())
    assert d.new_state.available_modes == ["default", "yolo"]
    assert d.new_state.available_commands == [{"name": "clear"}]
    assert d.forward is True


def test_status_running_then_idle_marks_turn_complete() -> None:
    running = dispatch(json.dumps({"type": "status", "status": "running"}), RuntimeState())
    assert running.new_state.status == RuntimeStatus.RUNNING
    assert running.turn_completed is False

    idle = dispatch(json.dumps({"type": "status", "status": "idle"}), running.new_state)
    assert idle.new_state.status == RuntimeStatus.IDLE
    assert idle.turn_completed is True


def test_spurious_idle_does_not_complete_turn() -> None:
    """An idle when we were not running (e.g. setMode ack) is not a turn boundary."""
    d = dispatch(json.dumps({"type": "status", "status": "idle"}), RuntimeState(status=RuntimeStatus.IDLE))
    assert d.turn_completed is False


def test_status_captures_mode_and_model() -> None:
    raw = json.dumps(
        {"type": "status", "status": "running", "mode": "yolo", "model": {"name": "m", "displayName": "M"}}
    )
    d = dispatch(raw, RuntimeState())
    assert d.new_state.session_mode == SessionMode.YOLO
    assert d.new_state.model.name == "m"
    assert d.new_state.model.display_name == "M"


def test_result_returns_to_idle() -> None:
    state = RuntimeState(status=RuntimeStatus.RUNNING)
    d = dispatch(json.dumps({"type": "result", "status": "success"}), state)
    assert d.new_state.status == RuntimeStatus.IDLE
    assert d.turn_completed is True


def test_permission_prompt_waits_in_default_mode() -> None:
    state = RuntimeState(session_mode=SessionMode.DEFAULT)
    raw = json.dumps({"type": "prompt", "requestId": "r1", "subtype": "permission", "tool": "Bash"})
    d = dispatch(raw, state)
    assert d.new_state.status == RuntimeStatus.WAITING_PERMISSION
    assert d.forward is True
    assert d.stdin_reply is None
    assert d.new_state.pending_request_id == "r1"


def test_permission_prompt_auto_approves_in_yolo() -> None:
    state = RuntimeState(session_mode=SessionMode.YOLO)
    raw = json.dumps({"type": "prompt", "requestId": "r7", "subtype": "permission", "tool": "Bash"})
    d = dispatch(raw, state)
    # Auto-approved: don't forward the prompt; reply on stdin; stay running.
    assert d.forward is False
    assert d.new_state.status == RuntimeStatus.RUNNING
    assert d.stdin_reply is not None
    reply = json.loads(d.stdin_reply)
    assert reply == {"type": "user", "subtype": "permission", "requestId": "r7", "behavior": "always"}


def test_input_prompt_waits() -> None:
    raw = json.dumps({"type": "prompt", "requestId": "q1", "subtype": "input", "message": "which db?"})
    d = dispatch(raw, RuntimeState())
    assert d.new_state.status == RuntimeStatus.WAITING_INPUT
    assert d.forward is True


def test_unknown_and_malformed_pass_through() -> None:
    for raw in ('{"type":"delta","content":"x"}', "not json", "", "plain text"):
        d = dispatch(raw, RuntimeState())
        assert d.forward is True
        assert d.stdin_reply is None


def test_dispatch_does_not_mutate_input_state() -> None:
    state = RuntimeState(status=RuntimeStatus.RUNNING)
    dispatch(json.dumps({"type": "status", "status": "idle"}), state)
    assert state.status == RuntimeStatus.RUNNING  # original untouched
