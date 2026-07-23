"""Unit tests for the SSE encoder (``sse_stream``).

Verifies the wire-format contract the frontend relies on: a ``stream_open`` marker is
always the first frame (so a client can confirm the stream is alive without waiting on
bzcode), buffered/live frames follow, and the process-exit sentinel closes the stream.
"""

from __future__ import annotations

import asyncio
import json

from workspace_backend.api.sse import sse_stream


class _FakeRuntime:
    """Minimal stand-in exposing the subscribe/unsubscribe surface sse_stream uses."""

    def __init__(self, replay: list[str] | None = None, *, terminate: bool = True) -> None:
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._replay = replay or []
        self._terminate = terminate
        self.unsubscribed = False

    def subscribe(self, *, replay: bool = True) -> asyncio.Queue[str | None]:
        if replay:
            for msg in self._replay:
                self._queue.put_nowait(msg)
        # Enqueue the exit sentinel after replay so the stream drains then closes —
        # mirrors the real runtime where the None sentinel arrives via _broadcast.
        if self._terminate:
            self._queue.put_nowait(None)
        return self._queue

    def unsubscribe(self, q: asyncio.Queue[str | None]) -> None:
        self.unsubscribed = True

    def push(self, item: str | None) -> None:
        self._queue.put_nowait(item)


async def test_stream_open_is_first_frame() -> None:
    """The very first yielded frame is the stream_open marker, before any replay."""
    rt = _FakeRuntime(replay=['{"type":"session","modes":["default"]}'])

    frames = [f async for f in sse_stream(rt)]  # type: ignore[arg-type]

    assert frames[0] == 'data: {"type": "stream_open"}\n\n'
    assert json.loads(frames[0][len("data: ") :]) == {"type": "stream_open"}


async def test_replay_then_exit_ordering() -> None:
    """After stream_open, buffered frames replay, then the exit sentinel closes it."""
    rt = _FakeRuntime(replay=['{"type":"session"}', '{"type":"status","status":"idle"}'])

    frames = [f async for f in sse_stream(rt)]  # type: ignore[arg-type]

    assert frames[0] == 'data: {"type": "stream_open"}\n\n'
    assert frames[1] == 'data: {"type":"session"}\n\n'
    assert frames[2] == 'data: {"type":"status","status":"idle"}\n\n'
    assert frames[-1] == 'data: {"type": "system", "message": "Agent process exited"}\n\n'
    assert rt.unsubscribed is True


async def test_stream_open_sent_even_with_empty_buffer() -> None:
    """A warm reconnect with nothing to replay still gets stream_open immediately."""
    rt = _FakeRuntime(replay=[])

    frames = [f async for f in sse_stream(rt)]  # type: ignore[arg-type]

    assert frames[0] == 'data: {"type": "stream_open"}\n\n'
