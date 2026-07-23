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
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

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
            print(f"[{label}] {line}", file=sys.stderr)
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

        # Return existing running server
        if cwd in _dev_servers:
            entry = _dev_servers[cwd]
            if entry["proc"].returncode is None:
                return {"port": entry["port"]}

        port = await _find_free_port()

        pkg_dir = Path(cwd)
        if (pkg_dir / "pnpm-lock.yaml").exists():  # noqa: ASYNC240
            cmd = ["pnpm", "dev", "--port", str(port), "--host", "0.0.0.0"]
        elif (pkg_dir / "yarn.lock").exists():  # noqa: ASYNC240
            cmd = ["yarn", "dev", "--port", str(port), "--host", "0.0.0.0"]
        else:
            cmd = ["npm", "run", "dev", "--", "--port", str(port), "--host", "0.0.0.0"]

        env = os.environ.copy()

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

        print(f"[dev-server] starting {' '.join(cmd)} in {cwd}", file=sys.stderr)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
        except FileNotFoundError as exc:
            print(f"[dev-server] command not found: {exc}", file=sys.stderr)
            raise FileNotFoundError(f"command not found: {exc}") from exc

        asyncio.create_task(_pipe_output(proc, f"dev-server:{Path(cwd).name}"))
        _dev_servers[cwd] = {"proc": proc, "port": port}

        # Short crash guard — if the process dies right away (broken package.json), surface
        # it as an error instead of returning a port that will never come up. We do NOT wait
        # for the port to bind here; the frontend polls status() until it is listening.
        await asyncio.sleep(_CRASH_GUARD)
        if proc.returncode is not None:
            print(f"[dev-server] exited immediately (rc={proc.returncode})", file=sys.stderr)
            _dev_servers.pop(cwd, None)
            raise RuntimeError("dev server exited immediately — check package.json")

        print(f"[dev-server] started pid={proc.pid} port={port}", file=sys.stderr)
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
        """Stop the dev server for ``cwd``. Copied verbatim from old app.py dev_server_stop."""
        entry = _dev_servers.pop(cwd, None)
        if entry:
            print(f"[dev-server] stopping pid={entry['proc'].pid} cwd={cwd}", file=sys.stderr)
            try:
                entry["proc"].terminate()
            except Exception:
                pass
