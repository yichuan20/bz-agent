"""In-memory runtime state — replaces the original module globals.

The old server kept ``_active_sessions``, ``_running_sessions``, and ``_token_stats``
as module globals mutated from deep inside the read loop, which made everything a
singleton and untestable. Here they live in one injectable object owned by the app
context, so tests get a fresh instance and nothing reaches across modules.

This state is ephemeral (lost on restart) — token stats etc. move to Postgres in a
later milestone via the storage ports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TokenStats:
    """Cumulative token usage since process start."""

    input: int = 0
    output: int = 0

    @property
    def total(self) -> int:
        return self.input + self.output


@dataclass
class RuntimeState:
    """Ephemeral per-process state: which agents are active/running, and token totals."""

    active: set[str] = field(default_factory=set)
    running: set[str] = field(default_factory=set)
    tokens: TokenStats = field(default_factory=TokenStats)

    def mark_active(self, agent_id: str) -> None:
        self.active.add(agent_id)

    def mark_inactive(self, agent_id: str) -> None:
        self.active.discard(agent_id)

    def mark_running(self, agent_id: str) -> None:
        self.running.add(agent_id)

    def mark_idle(self, agent_id: str) -> None:
        self.running.discard(agent_id)

    def is_active(self, agent_id: str) -> bool:
        return agent_id in self.active

    def is_running(self, agent_id: str) -> bool:
        return agent_id in self.running

    def add_tokens(self, usage: dict[str, Any]) -> None:
        """Accumulate a bzcode ``usage`` object (inputTokens/outputTokens)."""
        self.tokens.input += int(usage.get("inputTokens", 0) or 0)
        self.tokens.output += int(usage.get("outputTokens", 0) or 0)
