"""Domain models.

Plain, framework-free data structures shared across services and adapters. API DTOs
(pydantic request/response schemas) live separately in ``api/schemas.py``; these are
the internal vocabulary. Phase 1 defines the core enums and records; the agent-pool
runtime types arrive in Phase 2.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class RuntimeStatus(StrEnum):
    """Lifecycle state of an agent's live bzcode process.

    ``not_running`` means the durable agent record exists but no process is live
    (never connected, or reaped by the idle sweeper).
    """

    NOT_RUNNING = "not_running"
    STARTING = "starting"
    IDLE = "idle"
    RUNNING = "running"
    WAITING_PERMISSION = "waiting_permission"
    WAITING_INPUT = "waiting_input"
    DEAD = "dead"


class SessionMode(StrEnum):
    """bzcode runtime permission mode reported over the stdio protocol."""

    DEFAULT = "default"
    PLAN = "plan"
    YOLO = "yolo"


@dataclass(frozen=True, slots=True)
class ModelInfo:
    """The model backing a session, as reported by bzcode."""

    name: str = ""
    display_name: str = ""


@dataclass(slots=True)
class Agent:
    """A durable agent record: id, working dir, mode, and transcript metadata.

    This is the persistent side of the agent. The live process (if any) is an
    ``AgentRuntime`` in the pool, keyed by the same ``id``.
    """

    id: str
    working_dir: str
    mode: str
    title: str = ""
    model: str = ""
    created_at: str = ""
    last_modified: str = ""


@dataclass(frozen=True, slots=True)
class Mode:
    """An agent mode / persona definition from ``agent_modes.json``."""

    id: str
    label: str
    icon: str = ""
    description: str = ""
    base_mode: str = ""
    settings: dict[str, Any] = field(default_factory=dict)
