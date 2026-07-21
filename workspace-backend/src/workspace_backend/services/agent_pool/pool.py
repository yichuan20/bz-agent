"""AgentPool — registry of live bzcode runtimes keyed by agent id.

The pool decouples process lifetime from client-connection lifetime: a runtime
outlives any single SSE connection, so a client can disconnect and reconnect to the
same ``agent_id`` and find its process still there with full context. Idle runtimes
(no clients, gone quiet) are reaped by a background sweeper.

Construction is injectable — the pool is handed a ``spawn`` callable and a
``build_command``/``build_env`` pair — so tests can drive it against a fake bzcode
stub (or a fully fake process) without a real binary and without module globals. This
is the object the API layer depends on (built once in the app lifespan).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from workspace_backend.domain.models import RuntimeStatus, SessionMode
from workspace_backend.errors import ProbeSessionRejected
from workspace_backend.infra.process import ProcessSpawner
from workspace_backend.logging import get_logger
from workspace_backend.services.agent_pool.runtime import AgentRuntime

log = get_logger(__name__)

# Probe sessions are health-check throwaways and must never be pooled.
_PROBE_PREFIX = "bz-probe-"

# How often the idle sweeper runs.
_SWEEP_INTERVAL = 30.0

# Builders the pool calls per spawn: given (agent_id, cwd, mode) produce the argv and
# the environment. Injected so the pool stays free of credential/path concerns.
CommandBuilder = Callable[[str], list[str]]
EnvBuilder = Callable[[], Awaitable[dict[str, str]]]


class AgentPool:
    """Manages a pool of :class:`AgentRuntime` processes keyed by agent id."""

    def __init__(
        self,
        *,
        spawn: ProcessSpawner,
        build_command: CommandBuilder,
        build_env: EnvBuilder,
        idle_timeout: float = 300.0,
        session_mode_for: Callable[[str], SessionMode] | None = None,
        on_usage: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._runtimes: dict[str, AgentRuntime] = {}
        self._lock = asyncio.Lock()
        self._idle_timeout = idle_timeout
        self._spawn = spawn
        self._build_command = build_command
        self._build_env = build_env
        self._session_mode_for = session_mode_for or (lambda _mode: SessionMode.DEFAULT)
        self._on_usage = on_usage
        self._sweeper_task: asyncio.Task[None] | None = None

    # ── lifecycle ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start the idle sweeper. Call from the app lifespan startup."""
        self._sweeper_task = asyncio.create_task(self._idle_sweeper())
        log.info("[pool] started idle_timeout=%ss", self._idle_timeout)

    async def stop(self) -> None:
        """Shut down all runtimes and the sweeper. Call from lifespan shutdown."""
        if self._sweeper_task is not None:
            self._sweeper_task.cancel()
            try:
                await self._sweeper_task
            except asyncio.CancelledError, Exception:  # noqa: BLE001
                pass
        async with self._lock:
            runtimes = list(self._runtimes.values())
            self._runtimes.clear()
        for rt in runtimes:
            await rt.shutdown(reason="server_shutdown")
        log.info("[pool] stopped — all runtimes shut down")

    # ── registry ─────────────────────────────────────────────────────────────

    def get(self, agent_id: str) -> AgentRuntime | None:
        """Return the live runtime for ``agent_id``, or ``None`` if not pooled."""
        return self._runtimes.get(agent_id)

    async def get_or_create(self, agent_id: str, cwd: str, mode: str) -> AgentRuntime:
        """Return the existing runtime for ``agent_id`` or spawn a new one.

        Dead or shutting-down entries are replaced. Probe sessions are rejected so
        they never enter the pool.
        """
        if agent_id.startswith(_PROBE_PREFIX):
            raise ProbeSessionRejected(f"probe session {agent_id!r} must not enter the pool")

        async with self._lock:
            existing = self._runtimes.get(agent_id)
            if existing is not None and not existing.is_dead:
                log.info("[pool] reusing %s pid=%s", agent_id, existing.pid)
                return existing
            if existing is not None:  # dead — drop and respawn
                log.info("[pool] removing dead runtime %s", agent_id)
                del self._runtimes[agent_id]

            runtime = AgentRuntime(
                agent_id,
                cwd,
                mode,
                session_mode=self._session_mode_for(mode),
                on_usage=self._on_usage,
            )
            cmd = self._build_command(agent_id)
            env = await self._build_env()
            await runtime.start(cmd, env, self._spawn)
            self._runtimes[agent_id] = runtime
            return runtime

    async def remove(self, agent_id: str) -> bool:
        """Shut down and drop a runtime. Return ``True`` if one existed."""
        async with self._lock:
            runtime = self._runtimes.pop(agent_id, None)
        if runtime is None:
            return False
        await runtime.shutdown(reason="explicit_remove")
        return True

    async def flush_all(self, reason: str = "api_key_reset") -> int:
        """Shut down every runtime (e.g. after an API-key change). Return the count."""
        async with self._lock:
            items = list(self._runtimes.items())
            self._runtimes.clear()
        for agent_id, runtime in items:
            await runtime.shutdown(reason=reason)
            log.info("[pool] flushed %s (%s)", agent_id, reason)
        return len(items)

    # ── monitoring ───────────────────────────────────────────────────────────

    def status(self) -> list[dict[str, Any]]:
        """A snapshot of all live runtimes for the ops/status endpoint."""
        now = asyncio.get_event_loop().time()
        return [
            {
                "agentId": agent_id,
                "cwd": rt.cwd,
                "mode": rt.mode,
                "pid": rt.pid,
                "alive": not rt.is_dead,
                "runtimeStatus": rt.state.status.value,
                "sessionMode": rt.state.session_mode.value,
                "model": rt.state.model.display_name or rt.state.model.name,
                "subscribers": rt.subscriber_count,
                "idleSeconds": rt.idle_seconds(now),
            }
            for agent_id, rt in self._runtimes.items()
        ]

    # ── idle reaping ─────────────────────────────────────────────────────────

    async def _idle_sweeper(self) -> None:
        """Periodically reap runtimes with no clients that have gone idle."""
        while True:
            await asyncio.sleep(_SWEEP_INTERVAL)
            await self._sweep_once()

    async def _sweep_once(self) -> None:
        """One reaping pass. Separated out so tests can trigger it directly."""
        now = asyncio.get_event_loop().time()
        to_remove: list[str] = []
        async with self._lock:
            for agent_id, rt in list(self._runtimes.items()):
                if rt.is_dead:
                    to_remove.append(agent_id)
                    continue
                idle = rt.idle_seconds(now)
                if (
                    not rt.has_clients
                    and idle is not None
                    and idle > self._idle_timeout
                    and rt.state.status == RuntimeStatus.IDLE
                ):
                    to_remove.append(agent_id)
            reaped = [self._runtimes.pop(a) for a in to_remove if a in self._runtimes]
        for rt in reaped:
            await rt.shutdown(reason="idle_timeout")
