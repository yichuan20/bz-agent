"""Tests for RuntimeState (active/running sets + token stats)."""

from __future__ import annotations

from workspace_backend.runtime_state import RuntimeState


def test_active_and_running_tracking() -> None:
    state = RuntimeState()
    state.mark_active("bz-1")
    state.mark_running("bz-1")
    assert state.is_active("bz-1")
    assert state.is_running("bz-1")
    state.mark_idle("bz-1")
    assert not state.is_running("bz-1")
    state.mark_inactive("bz-1")
    assert not state.is_active("bz-1")


def test_token_accumulation() -> None:
    state = RuntimeState()
    state.add_tokens({"inputTokens": 10, "outputTokens": 5})
    state.add_tokens({"inputTokens": 3, "outputTokens": 2})
    assert state.tokens.input == 13
    assert state.tokens.output == 7
    assert state.tokens.total == 20


def test_token_accumulation_tolerates_missing_fields() -> None:
    state = RuntimeState()
    state.add_tokens({})
    state.add_tokens({"inputTokens": None})
    assert state.tokens.total == 0


def test_instances_are_isolated() -> None:
    a, b = RuntimeState(), RuntimeState()
    a.mark_active("bz-1")
    assert not b.is_active("bz-1")
