"""Unit tests for the pure TurnBuffer."""

from __future__ import annotations

import json

from workspace_backend.services.agent_pool.buffer import TurnBuffer


def _prompt() -> str:
    return json.dumps({"type": "prompt", "requestId": "r1", "subtype": "permission"})


def _text(t: str) -> str:
    return json.dumps({"type": "assistant", "content": [{"type": "text", "text": t}]})


def test_seed_replaces_and_starts_turn() -> None:
    buf = TurnBuffer()
    buf.append(_text("stale"))
    buf.seed('{"type":"user","content":"hi"}')
    assert len(buf) == 1
    assert buf.messages == ['{"type":"user","content":"hi"}']


def test_append_accumulates_turn() -> None:
    buf = TurnBuffer()
    buf.seed('{"type":"user","content":"hi"}')
    buf.append(_text("a"))
    buf.append(_text("b"))
    assert len(buf) == 3


def test_clear_empties() -> None:
    buf = TurnBuffer()
    buf.seed("x")
    buf.append("y")
    buf.clear()
    assert len(buf) == 0
    assert buf.replay(skip_answered_prompts=True) == []


def test_replay_skips_answered_prompts() -> None:
    """When not waiting, an already-answered prompt is omitted on replay."""
    buf = TurnBuffer()
    buf.seed('{"type":"user","content":"hi"}')
    buf.append(_prompt())
    buf.append(_text("done"))
    replayed = buf.replay(skip_answered_prompts=True)
    assert _prompt() not in replayed
    assert _text("done") in replayed
    assert len(replayed) == 2


def test_replay_keeps_prompt_when_still_waiting() -> None:
    """When the agent is still waiting, the prompt must be replayed so the client answers."""
    buf = TurnBuffer()
    buf.seed('{"type":"user","content":"hi"}')
    buf.append(_prompt())
    replayed = buf.replay(skip_answered_prompts=False)
    assert _prompt() in replayed
    assert len(replayed) == 2


def test_replay_tolerates_malformed_lines() -> None:
    buf = TurnBuffer()
    buf.seed("not json")
    buf.append("{also not valid")
    # Should not raise; malformed lines are treated as non-prompts and kept.
    assert len(buf.replay(skip_answered_prompts=True)) == 2
