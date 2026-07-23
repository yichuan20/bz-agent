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
from pathlib import Path
from typing import Any

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


class DevServerService:
    """Wraps the old dev_server_start / dev_server_stop handler logic."""

    async def start(self, cwd: str, default_cwd: str) -> dict[str, Any]:
        """Start a dev server in ``cwd`` and return its port.

        The browser-facing URL is built by the frontend from ``window.location`` +
        this port, because behind flowinfra's reverse proxy the backend cannot see
        the public hostname (the ``Host`` header is rewritten to the internal target).
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

        # Extend PATH so pnpm/node installed in non-system locations are found
        env = os.environ.copy()
        extra_paths = [
            "/usr/local/bin",
            "/usr/bin",
            str(Path.home() / ".local/node/bin"),
            str(Path.home() / ".local/share/pnpm"),
            str(Path.home() / ".nvm/versions/node/current/bin"),
            "/root/.local/share/pnpm",
            "/root/.local/node/bin",
        ]
        env["PATH"] = ":".join(extra_paths) + ":" + env.get("PATH", "")

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

        # Brief wait — if the process exits immediately the command/package.json is broken
        await asyncio.sleep(2)
        if proc.returncode is not None:
            print(f"[dev-server] exited immediately (rc={proc.returncode})", file=sys.stderr)
            _dev_servers.pop(cwd, None)
            raise RuntimeError("dev server exited immediately — check package.json")

        print(f"[dev-server] started pid={proc.pid} port={port}", file=sys.stderr)
        return {"port": port, "pid": proc.pid}

    async def stop(self, cwd: str) -> None:
        """Stop the dev server for ``cwd``. Copied verbatim from old app.py dev_server_stop."""
        entry = _dev_servers.pop(cwd, None)
        if entry:
            print(f"[dev-server] stopping pid={entry['proc'].pid} cwd={cwd}", file=sys.stderr)
            try:
                entry["proc"].terminate()
            except Exception:
                pass
