"""SSE encoder — turn a runtime subscriber queue into an event stream.

The AgentPool speaks only ``asyncio.Queue[str | None]``; this module is the single
place that knows the Server-Sent-Events wire format. It wraps a subscriber queue as an
``AsyncIterator[str]`` of ``data: …\\n\\n`` frames, emitting periodic ``: ping``
comments to keep proxies from closing an idle connection, and a terminal ``system``
event when the agent process exits (the ``None`` sentinel).

Keeping this out of the pool means the pool has no web-framework dependency; the route
just hands a queue here and returns a ``StreamingResponse``.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from workspace_backend.services.agent_pool.runtime import AgentRuntime

# Seconds between keepalive pings when the agent is quiet.
_PING_INTERVAL = 15.0

_EXIT_EVENT = json.dumps({"type": "system", "message": "Agent process exited"})

# Sent as the very first frame on every subscription so the client can distinguish
# "the stream is alive" from "bzcode has started talking". Lets the frontend mark the
# connection confirmed-open immediately — even on a warm reconnect where no `session`
# frame will be replayed — without waiting on bzcode's first output.
_STREAM_OPEN_EVENT = json.dumps({"type": "stream_open"})


async def sse_stream(runtime: AgentRuntime) -> AsyncIterator[str]:
    """Yield SSE frames for a runtime, replaying the current turn then streaming live.

    Emits a ``stream_open`` marker first so the client knows the stream is alive
    regardless of whether bzcode has produced output yet. Subscribes with replay so a
    reconnecting client catches up on the in-flight turn. Ends when the process dies
    (``None`` sentinel) — the caller's StreamingResponse closes after this generator
    returns. Unsubscribes on any exit path.
    """
    yield f"data: {_STREAM_OPEN_EVENT}\n\n"
    queue = runtime.subscribe(replay=True)
    try:
        while True:
            try:
                raw = await asyncio.wait_for(queue.get(), timeout=_PING_INTERVAL)
            except TimeoutError:
                yield ": ping\n\n"
                continue
            if raw is None:
                yield f"data: {_EXIT_EVENT}\n\n"
                return
            # Only forward well-formed JSON lines (defensive; the pool only enqueues these).
            if raw and raw[0] == "{":
                yield f"data: {raw}\n\n"
    finally:
        runtime.unsubscribe(queue)
