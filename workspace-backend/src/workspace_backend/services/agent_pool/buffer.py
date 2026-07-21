"""TurnBuffer — the per-turn replay buffer.

When a client connects (or reconnects/refreshes) mid-turn, it must catch up on the
messages already emitted during the current turn — bzcode won't re-emit them, and
they aren't in the ``.jsonl`` transcript until the turn completes. The buffer holds
exactly the current turn's messages so a late subscriber can be primed.

The subtle rules (ported from the original ``_dispatch_stdout`` / ``seed_user_turn``):

* **Seed on send.** When the user's prompt is written to stdin, it is seeded as the
  first buffer entry — the prompt is never echoed on stdout, so without this a
  reconnect would miss the start of the turn.
* **Span the whole turn.** The buffer is *not* cleared when a ``running`` status
  arrives; it must include the prompt plus all intra-turn output (tool calls,
  permission replies). Clearing on ``running`` would drop the turn's start on a
  mid-turn reconnect.
* **Clear only on a real turn boundary.** It clears exactly once, on the
  ``running → idle`` transition. Spurious ``idle`` events between turns (e.g. bzcode
  acking ``setMode``) must not wipe a freshly-seeded prompt.
* **Replay skips answered prompts.** On replay, an already-answered ``prompt`` event
  is skipped so a resolved permission/input dialog doesn't reappear.

This module is pure: no I/O, no asyncio. It's driven by the dispatcher and unit-tested
in isolation.
"""

from __future__ import annotations

import json

from workspace_backend.domain.protocol import ServerMsg


class TurnBuffer:
    """Accumulates the current turn's raw JSON lines for replay to late subscribers."""

    def __init__(self) -> None:
        self._messages: list[str] = []

    def __len__(self) -> int:
        return len(self._messages)

    @property
    def messages(self) -> list[str]:
        """A shallow copy of the buffered raw lines (turn order)."""
        return list(self._messages)

    def seed(self, raw: str) -> None:
        """Start a new turn with ``raw`` (the user prompt) as its first entry.

        Replaces any prior contents — a new user turn resets the buffer.
        """
        self._messages = [raw]

    def append(self, raw: str) -> None:
        """Add an intra-turn message emitted by bzcode."""
        self._messages.append(raw)

    def clear(self) -> None:
        """Drop all buffered messages (called on the running → idle boundary)."""
        self._messages.clear()

    def replay(self, *, skip_answered_prompts: bool) -> list[str]:
        """Return the messages to replay to a newly-attached subscriber.

        When ``skip_answered_prompts`` is true (the agent is not currently waiting on
        the user), ``prompt`` events are omitted so a resolved dialog doesn't
        reappear. When false (the agent is still waiting), prompts are kept so the
        reconnecting client can answer.
        """
        if not skip_answered_prompts:
            return list(self._messages)
        return [m for m in self._messages if not _is_prompt(m)]


def _is_prompt(raw: str) -> bool:
    """Whether a raw line is a ``prompt`` message. Tolerant of malformed lines."""
    if not raw or raw[0] != "{":
        return False
    try:
        return bool(json.loads(raw).get("type") == ServerMsg.PROMPT.value)
    except json.JSONDecodeError:
        return False
