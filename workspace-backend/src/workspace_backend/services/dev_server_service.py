"""Dev server service — spawn and stop per-cwd preview dev servers.

Spawns ``pnpm/yarn/npm run dev`` on a free port and returns that port. The
browser-facing preview URL is built by the frontend from ``window.location`` +
the port, since behind the workspace reverse proxy the backend cannot see the
public hostname (the ``Host`` header is rewritten to the internal target).
"""

from __future__ import annotations

import asyncio
import os
import shutil
import signal
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from workspace_backend.logging import get_logger

log = get_logger(__name__)

# Resolves a tool name (e.g. ``pnpm``, ``node``) to its configured absolute path,
# or ``None`` to fall back to PATH-based auto-detection.
ToolPathResolver = Callable[[str], Awaitable[str | None]]

# ── Module-level state (from server.py) ───────────────────────────────────────

_dev_servers: dict[str, dict[str, Any]] = {}  # cwd → {proc, port}


# ── Helpers (copied verbatim from server.py) ──────────────────────────────────


async def _find_free_port() -> int:
    import socket as _socket

    with _socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


async def _pipe_output(proc: asyncio.subprocess.Process, label: str) -> None:
    if proc.stdout is None:
        return
    try:
        async for raw in proc.stdout:
            line = raw.decode(errors="replace").rstrip()
            log.info("[%s] %s", label, line)
    except Exception:
        pass


# Seconds to wait after spawning before returning, just long enough to catch a dev
# server that crashes on startup (bad package.json) and surface it as an error rather
# than a silently-dead preview. Binding the port takes longer than this — the frontend
# polls the status endpoint until the port is listening, so start() need not block on it.
_CRASH_GUARD = 1.5


async def _is_listening(port: int) -> bool:
    """Return True if ``127.0.0.1:port`` currently accepts a TCP connection."""
    try:
        _reader, writer = await asyncio.open_connection("127.0.0.1", port)
    except OSError:
        return False
    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return True


# Seconds to wait for a graceful process-group SIGTERM before escalating to SIGKILL.
_TERM_GRACE = 3.0


async def _kill_process_tree(proc: asyncio.subprocess.Process, label: str) -> None:
    """Terminate ``proc`` and every child it spawned, then reap it.

    Dev servers spawn a tree (``pnpm`` → ``node`` → ``vite`` → ``esbuild`` …). Calling
    ``proc.terminate()`` only signals the direct child, orphaning the rest — which keep
    holding memory (fatal on a small box). We spawn with ``start_new_session=True`` so the
    whole tree shares a process group, then signal the group. Falls back to signalling just
    the process if the group send fails (e.g. it already exited).
    """
    if proc.returncode is not None:
        return

    def _signal_group(sig: int) -> None:
        try:
            os.killpg(os.getpgid(proc.pid), sig)
        except (ProcessLookupError, PermissionError):
            try:
                proc.send_signal(sig)
            except ProcessLookupError:
                pass

    _signal_group(signal.SIGTERM)
    try:
        await asyncio.wait_for(proc.wait(), timeout=_TERM_GRACE)
    except TimeoutError:
        log.warning("[dev-server] %s did not exit on SIGTERM — sending SIGKILL", label)
        _signal_group(signal.SIGKILL)
        try:
            await proc.wait()
        except Exception:
            pass


class DevServerService:
    """Spawn, poll, and stop per-cwd preview dev servers."""

    def __init__(self, tool_path_resolver: ToolPathResolver | None = None) -> None:
        # Optional resolver for user-configured absolute tool paths. When ``None``
        # (or it returns ``None`` for a tool), we fall back to PATH auto-detection.
        self._tool_path_resolver = tool_path_resolver

    async def _resolve(self, tool: str) -> str | None:
        """Return the configured absolute path for ``tool``, or ``None``."""
        if self._tool_path_resolver is None:
            return None
        return await self._tool_path_resolver(tool)

    async def start(self, cwd: str, default_cwd: str) -> dict[str, Any]:
        """Spawn a dev server in ``cwd`` and return its port immediately.

        Returns as soon as the process is spawned (after a short crash guard) — it does
        NOT wait for the port to bind, which can take many seconds. The caller polls
        :meth:`status` until ``listening`` is true before loading the preview, so the
        request is never held open long enough to trip a proxy/ingress read timeout.

        The browser-facing URL is built by the frontend from ``window.location`` + this
        port, because behind flowinfra's reverse proxy the backend cannot see the public
        hostname (the ``Host`` header is rewritten to the internal target).
        """
        cwd = cwd or default_cwd
        if not cwd or not Path(cwd).is_dir():  # noqa: ASYNC240
            raise ValueError("invalid cwd")

        # Reap any tracked servers that have already exited so the registry reflects
        # reality (crashed dev servers otherwise linger forever) and drop this cwd's
        # entry if it is dead.
        await self._reap_dead()

        # Return existing running server
        if cwd in _dev_servers:
            entry = _dev_servers[cwd]
            if entry["proc"].returncode is None:
                return {"port": entry["port"]}

        # One dev server at a time. On a constrained box (1 vCPU / 2 GB) each Vite
        # server can hold hundreds of MB, so stacking them exhausts memory and starves
        # the event loop. Stop every other running server before spawning a new one.
        for other_cwd in list(_dev_servers):
            if other_cwd != cwd:
                await self.stop(other_cwd)

        port = await _find_free_port()

        # NOTE: Behind the workspace reverse proxy, Vite's HMR (hot-module-reload)
        # WebSocket fails to connect and prints a console error in the *preview iframe*:
        #   "WebSocket connection to 'wss://<host>/?token=…' failed … [vite] failed to
        #    connect to websocket."
        # This is EXPECTED and harmless — the preview itself loads and works over HTTP;
        # only live-reload-on-edit is lost (reload the iframe to see changes). The proxy
        # forwards HTTP but not the WS upgrade for the per-port preview subdomains, and
        # Vite then falls back to wss://localhost:<port> which the browser can't reach.
        # We do NOT try to silence it: the error originates in the previewed app's own
        # Vite client (a different origin/iframe), so the parent frontend can't intercept
        # it, and Vite has no CLI flag to disable HMR (it needs server.hmr:false in the
        # user's own vite.config, which we don't own). HMR is intentionally not supported.
        pkg_dir = Path(cwd)
        if (pkg_dir / "pnpm-lock.yaml").exists():  # noqa: ASYNC240
            cmd = ["pnpm", "dev", "--port", str(port), "--host", "0.0.0.0"]
        elif (pkg_dir / "yarn.lock").exists():  # noqa: ASYNC240
            cmd = ["yarn", "dev", "--port", str(port), "--host", "0.0.0.0"]
        else:
            cmd = ["npm", "run", "dev", "--", "--port", str(port), "--host", "0.0.0.0"]

        env = os.environ.copy()

        # Cap the child's resource use for small hosts (1 vCPU / 2 GB): bound Node's
        # heap and stop Rust-based toolchain bits (esbuild/lightningcss/swc via rayon)
        # from spawning a worker thread per core — thread creation fails with EAGAIN
        # under memory pressure, crashing the build. Only set when unset so a project
        # can override. See the ThreadPoolBuildError seen on the 2 GB workspace box.
        env.setdefault("NODE_OPTIONS", "--max-old-space-size=512")
        env.setdefault("RAYON_NUM_THREADS", "2")
        env.setdefault("UV_THREADPOOL_SIZE", "2")

        # If the user configured an absolute path for node, prepend its dir so the
        # package manager (and anything it spawns) resolves that node first.
        node_path = await self._resolve("node")
        if node_path:
            env["PATH"] = str(Path(node_path).parent) + ":" + env.get("PATH", "")

        # Prefer a user-configured absolute path for the package manager; otherwise
        # fall back to PATH-based auto-detection over the (possibly node-extended) PATH.
        configured_pm = await self._resolve(cmd[0])
        if configured_pm:
            cmd = [configured_pm] + cmd[1:]
        else:
            resolved = shutil.which(cmd[0], path=env["PATH"])
            if resolved:
                cmd = [resolved] + cmd[1:]

        log.info("[dev-server] starting %s in %s", " ".join(cmd), cwd)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
                # New session → the whole tree (pnpm → node → vite → esbuild) shares a
                # process group, so stop() can signal the group and reap every child
                # instead of orphaning them.
                start_new_session=True,
            )
        except FileNotFoundError as exc:
            log.error("[dev-server] command not found: %s", exc)
            raise FileNotFoundError(f"command not found: {exc}") from exc

        asyncio.create_task(_pipe_output(proc, f"dev-server:{Path(cwd).name}"))
        _dev_servers[cwd] = {"proc": proc, "port": port}

        # Short crash guard — if the process dies right away (broken package.json), surface
        # it as an error instead of returning a port that will never come up. We do NOT wait
        # for the port to bind here; the frontend polls status() until it is listening.
        await asyncio.sleep(_CRASH_GUARD)
        if proc.returncode is not None:
            log.error("[dev-server] exited immediately (rc=%s)", proc.returncode)
            _dev_servers.pop(cwd, None)
            raise RuntimeError("dev server exited immediately — check package.json")

        log.info("[dev-server] started pid=%s port=%s", proc.pid, port)
        return {"port": port, "pid": proc.pid}

    async def status(self, cwd: str, default_cwd: str) -> dict[str, Any]:
        """Report whether the dev server for ``cwd`` is running and its port listening.

        The frontend polls this after :meth:`start` and only loads the preview once
        ``listening`` is true, so the iframe's first request always hits a bound port.
        """
        cwd = cwd or default_cwd
        entry = _dev_servers.get(cwd)
        if not entry or entry["proc"].returncode is not None:
            return {"running": False, "listening": False, "port": None}
        port = entry["port"]
        return {"running": True, "listening": await _is_listening(port), "port": port}

    async def stop(self, cwd: str) -> None:
        """Stop the dev server for ``cwd`` and kill its whole process tree."""
        entry = _dev_servers.pop(cwd, None)
        if entry:
            proc = entry["proc"]
            log.info("[dev-server] stopping pid=%s cwd=%s", proc.pid, cwd)
            await _kill_process_tree(proc, f"dev-server:{Path(cwd).name}")

    async def _reap_dead(self) -> None:
        """Drop registry entries whose process has already exited.

        Keeps ``_dev_servers`` in sync with reality — crashed/exited dev servers would
        otherwise linger as stale entries. Their process is already dead so there is
        nothing to kill; we just forget them.
        """
        for dead_cwd in [c for c, e in _dev_servers.items() if e["proc"].returncode is not None]:
            _dev_servers.pop(dead_cwd, None)
