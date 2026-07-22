"""AgentRuntime — one live bzcode process, decoupled from client connections.

This is the runtime half of the pool. It owns exactly one bzcode subprocess and:

* runs the process-facing tasks (stdout reader, stderr drainer, dispatch loop);
* tracks state via the pure :func:`dispatch` state machine;
* holds the per-turn :class:`TurnBuffer` for reconnect replay;
* fans messages out to a set of subscriber queues (one per SSE client);
* auto-approves permission prompts in yolo mode (the dispatcher decides; we write
  the reply to stdin here);
* sends the initial ``setMode`` once bzcode signals ready;
* exposes ``subscribe``/``unsubscribe``/``seed_user_turn``/``send``/``shutdown``.

A "connection" is just holding a queue returned by :meth:`subscribe`; the SSE wire
format lives in the API layer, not here — this class never imports FastAPI.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

from workspace_backend.domain.models import RuntimeStatus, SessionMode
from workspace_backend.domain.protocol import ClientMsg
from workspace_backend.infra import reader
from workspace_backend.infra.process import ProcessSpawner
from workspace_backend.logging import get_logger
from workspace_backend.services.agent_pool.buffer import TurnBuffer
from workspace_backend.services.agent_pool.dispatcher import RuntimeState, dispatch

log = get_logger(__name__)

# How long to wait for bzcode to emit its first ready signal before sending setMode.
_READY_TIMEOUT = 30.0
# Graceful shutdown grace period before killing the process.
_SHUTDOWN_TIMEOUT = 8.0
# Per-subscriber queue depth; full queues drop (a slow client can't stall others).
_SUBSCRIBER_QUEUE_SIZE = 1000


class AgentRuntime:
    """A pooled bzcode process that outlives individual client connections."""

    def __init__(
        self,
        agent_id: str,
        cwd: str,
        mode: str,
        *,
        session_mode: SessionMode = SessionMode.DEFAULT,
        on_usage: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.agent_id = agent_id
        self.cwd = cwd
        self.mode = mode  # agent mode name (general/widget/worker/coder/...)
        self._initial_session_mode = session_mode  # yolo/plan/default to apply at start

        self.state = RuntimeState()
        self._buffer = TurnBuffer()

        self._proc: asyncio.subprocess.Process | None = None
        self._out_queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._ready_event = asyncio.Event()
        self._subscribers: set[asyncio.Queue[str | None]] = set()

        self._tasks: list[asyncio.Task[None]] = []
        self._on_usage = on_usage

        self._shutting_down = False
        self._loop = asyncio.get_event_loop()
        self._created_at = self._loop.time()
        self._last_detach_at: float | None = None

    # ── lifecycle ────────────────────────────────────────────────────────────

    async def start(self, cmd: list[str], env: dict[str, str], spawn: ProcessSpawner) -> None:
        """Spawn the process and launch process-facing tasks."""
        self._proc = await spawn(cmd, cwd=self.cwd, env=env)
        self._tasks = [
            asyncio.create_task(
                reader.read_stdout(
                    self._proc,
                    self._out_queue,
                    self._ready_event,
                    session_id=self.agent_id,
                    on_usage=self._on_usage,
                )
            ),
            asyncio.create_task(reader.drain_stderr(self._proc, self._out_queue, session_id=self.agent_id)),
            asyncio.create_task(self._dispatch_loop()),
        ]
        if self._initial_session_mode != SessionMode.DEFAULT:
            asyncio.create_task(self._send_mode_when_ready(self._initial_session_mode))
        log.info("[pool] spawned %s pid=%s", self.agent_id, self.pid)

    async def _send_mode_when_ready(self, session_mode: SessionMode) -> None:
        """Send the initial setMode once bzcode is ready (or after a timeout)."""
        try:
            await asyncio.wait_for(self._ready_event.wait(), timeout=_READY_TIMEOUT)
        except TimeoutError:
            pass
        if self._proc is not None and self._proc.returncode is None:
            await self.send({"type": ClientMsg.SET_MODE.value, "mode": session_mode.value})
            log.info("[pool] sent setMode=%s to %s", session_mode.value, self.agent_id)

    async def _dispatch_loop(self) -> None:
        """Consume stdout lines, apply the pure state machine, fan out to subscribers."""
        while True:
            raw = await self._out_queue.get()
            if raw is None:
                self.state.status = RuntimeStatus.DEAD
                log.info("[%s] stdout closed", self.agent_id)
                self._broadcast(None)  # signal EOF to subscribers
                return

            decision = dispatch(raw, self.state)
            self.state = decision.new_state

            if decision.stdin_reply is not None:
                await self._write_stdin(decision.stdin_reply)

            if decision.forward:
                self._buffer.append(raw)
                self._broadcast(raw)

            if decision.turn_completed:
                self._buffer.clear()

    async def shutdown(self, reason: str = "idle") -> None:
        """Gracefully stop the process and cancel process-facing tasks. Idempotent."""
        if self._shutting_down:
            return
        self._shutting_down = True
        log.info("[pool] shutting down %s reason=%s pid=%s", self.agent_id, reason, self.pid)
        if self._proc is not None and self._proc.stdin is not None:
            try:
                self._proc.stdin.close()  # signals bzcode to save and exit
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
        if self._proc is not None:
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=_SHUTDOWN_TIMEOUT)
            except TimeoutError:
                try:
                    self._proc.kill()
                except ProcessLookupError:
                    pass
            except ProcessLookupError:
                pass
        for task in self._tasks:
            if not task.done():
                task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._broadcast(None)

    # ── subscribers (connection fan-out) ─────────────────────────────────────

    def subscribe(self, *, replay: bool = True) -> asyncio.Queue[str | None]:
        """Register a subscriber queue, optionally primed with the current turn.

        On replay, prompts already answered are skipped (unless the agent is still
        waiting on the user), so a resolved dialog doesn't reappear on reconnect.
        """
        q: asyncio.Queue[str | None] = asyncio.Queue(maxsize=_SUBSCRIBER_QUEUE_SIZE)
        if replay:
            still_waiting = self.state.status in (
                RuntimeStatus.WAITING_INPUT,
                RuntimeStatus.WAITING_PERMISSION,
            )
            for msg in self._buffer.replay(skip_answered_prompts=not still_waiting):
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    break
        self._subscribers.add(q)
        self._last_detach_at = None
        return q

    def unsubscribe(self, q: asyncio.Queue[str | None]) -> None:
        """Remove a subscriber; start the idle clock when the last one leaves."""
        self._subscribers.discard(q)
        if not self._subscribers:
            self._last_detach_at = self._loop.time()

    def seed_user_turn(self, raw: str) -> None:
        """Begin a turn: seed the prompt into the buffer and fan it to subscribers.

        The prompt isn't echoed on stdout, so we publish it ourselves — both into the
        replay buffer (for later reconnects) and to any live subscribers.
        """
        self._buffer.seed(raw)
        self._broadcast(raw)

    def _broadcast(self, item: str | None) -> None:
        """Put ``item`` on every subscriber queue, dropping on a full queue."""
        for q in list(self._subscribers):
            try:
                q.put_nowait(item)
            except asyncio.QueueFull:
                pass

    # ── I/O to the process ───────────────────────────────────────────────────

    async def send(self, msg: dict[str, Any]) -> None:
        """Write a client message to bzcode stdin (newline-framed JSON)."""
        await self._write_stdin(json.dumps(msg))

    async def _write_stdin(self, line: str) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError(f"agent {self.agent_id} has no stdin")
        self._proc.stdin.write(line.encode() + b"\n")
        await self._proc.stdin.drain()

    # ── properties ───────────────────────────────────────────────────────────

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self._proc is not None else None

    @property
    def is_dead(self) -> bool:
        return self._proc is not None and self._proc.returncode is not None

    @property
    def has_clients(self) -> bool:
        return len(self._subscribers) > 0

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def idle_seconds(self, now: float) -> float | None:
        """Seconds since the last subscriber detached, or ``None`` if clients remain."""
        if self._last_detach_at is None:
            return None
        return now - self._last_detach_at
