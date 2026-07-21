"""The stdout state machine — pure decision logic for one bzcode message.

The original code welded this into ``AgentPoolEntry._dispatch_stdout``, tangled with a
live subprocess, subscriber queues, and module globals — untestable. Here it is a pure
function: given the current runtime state and one raw stdout line, it returns a
:class:`Decision` describing how the runtime should react. The runtime
(:mod:`workspace_backend.services.agent_pool.runtime`) applies that decision (mutates
state, writes stdin, fans out), so all the tricky rules — yolo auto-approve, turn
boundaries, capability capture — are unit-testable with plain strings.

Rules ported from ``server.py``:

* ``session`` → capture ``modes`` / ``commands``.
* ``status`` running/idle → update status; capture ``mode`` / ``model`` when present.
* ``result`` → status returns to idle.
* ``prompt``/permission in **yolo** → auto-approve: emit an ``always`` reply to stdin
  and *do not* forward the prompt to clients. Otherwise → ``waiting_permission``.
* ``prompt``/input → ``waiting_input``.
* Everything else is forwarded unchanged.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from workspace_backend.domain.models import ModelInfo, RuntimeStatus, SessionMode
from workspace_backend.domain.protocol import (
    PermissionBehavior,
    PromptSubtype,
    ServerMsg,
    Status,
)


@dataclass(slots=True)
class RuntimeState:
    """Mutable state a dispatcher decision reads and updates.

    Held by the runtime; passed in so the dispatcher stays pure (it returns a
    Decision rather than mutating anything itself — the runtime applies changes).
    """

    status: RuntimeStatus = RuntimeStatus.STARTING
    session_mode: SessionMode = SessionMode.DEFAULT
    model: ModelInfo = field(default_factory=ModelInfo)
    available_modes: list[str] = field(default_factory=list)
    available_commands: list[dict[str, Any]] = field(default_factory=list)
    pending_request_id: str | None = None


@dataclass(slots=True)
class Decision:
    """What the runtime should do with one stdout line.

    * ``new_state`` — the state after applying this message (a fresh object; the
      runtime copies it over).
    * ``forward`` — whether to fan the raw line out to subscribers / the buffer.
    * ``stdin_reply`` — a JSON line to write back to bzcode (yolo auto-approve), or
      ``None``.
    * ``turn_completed`` — True on a running → idle transition (buffer should clear).
    """

    new_state: RuntimeState
    forward: bool = True
    stdin_reply: str | None = None
    turn_completed: bool = False


def dispatch(raw: str, state: RuntimeState) -> Decision:
    """Compute the reaction to one raw stdout line. Pure; never mutates ``state``."""
    new = RuntimeState(
        status=state.status,
        session_mode=state.session_mode,
        model=state.model,
        available_modes=list(state.available_modes),
        available_commands=list(state.available_commands),
        pending_request_id=state.pending_request_id,
    )
    was_running = state.status == RuntimeStatus.RUNNING

    if not raw or raw[0] != "{":
        return Decision(new_state=new)
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return Decision(new_state=new)

    mtype = msg.get("type")

    if mtype == ServerMsg.SESSION.value:
        if isinstance(msg.get("modes"), list):
            new.available_modes = msg["modes"]
        if isinstance(msg.get("commands"), list):
            new.available_commands = msg["commands"]
        return Decision(new_state=new)

    if mtype == ServerMsg.STATUS.value:
        status = msg.get("status")
        if status == Status.RUNNING.value:
            new.status = RuntimeStatus.RUNNING
        elif status == Status.IDLE.value:
            new.status = RuntimeStatus.IDLE
        if msg.get("mode"):
            new.session_mode = _coerce_mode(msg["mode"])
        if isinstance(msg.get("model"), dict):
            new.model = ModelInfo(
                name=msg["model"].get("name", ""),
                display_name=msg["model"].get("displayName", ""),
            )
        turn_completed = was_running and new.status == RuntimeStatus.IDLE
        return Decision(new_state=new, turn_completed=turn_completed)

    if mtype == ServerMsg.RESULT.value:
        new.status = RuntimeStatus.IDLE
        turn_completed = was_running
        return Decision(new_state=new, turn_completed=turn_completed)

    if mtype == ServerMsg.PROMPT.value:
        subtype = msg.get("subtype")
        request_id = msg.get("requestId", "")
        new.pending_request_id = request_id
        if subtype == PromptSubtype.PERMISSION.value:
            if state.session_mode == SessionMode.YOLO:
                # Auto-approve: keep running, reply on stdin, don't forward the prompt.
                new.status = RuntimeStatus.RUNNING
                reply = json.dumps(
                    {
                        "type": "user",
                        "subtype": PromptSubtype.PERMISSION.value,
                        "requestId": request_id,
                        "behavior": PermissionBehavior.ALWAYS.value,
                    }
                )
                return Decision(new_state=new, forward=False, stdin_reply=reply)
            new.status = RuntimeStatus.WAITING_PERMISSION
            return Decision(new_state=new)
        if subtype == PromptSubtype.INPUT.value:
            new.status = RuntimeStatus.WAITING_INPUT
            return Decision(new_state=new)

    return Decision(new_state=new)


def _coerce_mode(value: object) -> SessionMode:
    """Map a bzcode mode string to :class:`SessionMode`, defaulting safely."""
    try:
        return SessionMode(str(value))
    except ValueError:
        return SessionMode.DEFAULT
