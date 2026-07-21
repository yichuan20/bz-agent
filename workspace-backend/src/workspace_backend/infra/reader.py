"""bzcode stdout/stderr readers.

Two long-lived coroutines that drain a bzcode process's pipes:

- :func:`read_stdout` — forwards each JSON line to a queue and toggles a ready event
  on turn boundaries (running clears it, idle/result sets it). Oversized lines
  (> the StreamReader limit) are drained rather than fatal.
- :func:`drain_stderr` — logs stderr and forwards an ``auth-error`` system message
  when a known auth-failure keyword appears, so the client can prompt re-login.

Both are free of global state and framework imports: they take the process, an output
queue, and (for stdout) a ready event. Token accounting is surfaced via an optional
callback so the runtime — not this module — owns the counters.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

from workspace_backend.domain.protocol import ServerMsg, Status
from workspace_backend.logging import get_logger

log = get_logger(__name__)

# Substrings in bzcode stderr that indicate the session's auth has failed.
_AUTH_KEYWORDS = (
    "token is expired",
    "token refresh failed",
    "invalid authentication token",
    "invalid_token",
    "unauthorized",
    "401",
)

_AUTH_ERROR_MESSAGE = json.dumps(
    {
        "type": ServerMsg.SYSTEM.value,
        "event": "auth-error",
        "message": "Your authentication token has expired. Please sign in again.",
    }
)


async def read_stdout(
    proc: asyncio.subprocess.Process,
    out_queue: asyncio.Queue[str | None],
    ready_event: asyncio.Event,
    *,
    session_id: str = "",
    on_usage: Callable[[dict[str, Any]], None] | None = None,
) -> None:
    """Read bzcode stdout line-by-line, forwarding to ``out_queue``.

    Maintains ``ready_event``: cleared while a turn runs, set when the agent goes
    idle or a result arrives (i.e. it's safe to send the next input). On EOF, pushes
    a ``None`` sentinel so the dispatcher knows the process ended, and sets the event
    so nothing blocks on a dead process.
    """
    assert proc.stdout is not None
    try:
        while True:
            try:
                line = await proc.stdout.readline()
            except ValueError:
                # A single line exceeded the StreamReader limit. Drain to the next
                # newline so the stream stays usable, then continue.
                log.warning("[%s] bzcode emitted an oversized line (>limit) — skipping", session_id)
                while True:
                    chunk = await proc.stdout.read(1 << 20)
                    if not chunk or b"\n" in chunk:
                        break
                continue
            if not line:
                break  # EOF
            raw = line.decode(errors="replace").rstrip("\n")
            if not raw:
                continue
            await out_queue.put(raw)
            _track_ready(raw, ready_event, on_usage)
    finally:
        await out_queue.put(None)
        ready_event.set()


def _track_ready(
    raw: str,
    ready_event: asyncio.Event,
    on_usage: Callable[[dict[str, Any]], None] | None,
) -> None:
    """Update the ready event (and usage) from a stdout line. Tolerant of junk."""
    if not raw or raw[0] != "{":
        return
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return
    mtype = msg.get("type")
    if mtype == ServerMsg.STATUS.value:
        if msg.get("status") == Status.RUNNING.value:
            ready_event.clear()
        elif msg.get("status") == Status.IDLE.value:
            ready_event.set()
    elif mtype == ServerMsg.RESULT.value:
        ready_event.set()
        usage = msg.get("usage")
        if usage and on_usage is not None:
            on_usage(usage)


async def drain_stderr(
    proc: asyncio.subprocess.Process,
    out_queue: asyncio.Queue[str | None],
    *,
    session_id: str = "",
) -> None:
    """Read bzcode stderr, log each line, and forward auth errors to the client."""
    assert proc.stderr is not None
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        text = line.decode(errors="replace").rstrip()
        log.info("[bzcode %s] %s", session_id, text)
        lowered = text.lower()
        if any(k in lowered for k in _AUTH_KEYWORDS):
            try:
                out_queue.put_nowait(_AUTH_ERROR_MESSAGE)
            except asyncio.QueueFull:
                pass
