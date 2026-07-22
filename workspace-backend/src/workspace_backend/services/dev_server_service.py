"""Dev server service — spawn and stop per-cwd preview dev servers.

Detects the package manager from the lockfile (``pnpm-lock.yaml`` → pnpm,
``yarn.lock`` → yarn, else npm) and starts ``pnpm|yarn|npm run dev`` on a free
port in the agent's working directory.
"""

from __future__ import annotations

import asyncio
import socket
from dataclasses import dataclass
from pathlib import Path


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]  # type: ignore[no-any-return]


def _detect_pkg_manager(cwd: Path) -> str:
    if (cwd / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (cwd / "yarn.lock").exists():
        return "yarn"
    return "npm"


@dataclass
class DevServer:
    process: asyncio.subprocess.Process
    port: int
    url: str


_servers: dict[str, DevServer] = {}


class DevServerService:
    async def start(self, cwd: str) -> tuple[str, int]:
        """Start a dev server in ``cwd``. Returns (url, pid). Idempotent."""
        existing = _servers.get(cwd)
        if existing and existing.process.returncode is None:
            return existing.url, existing.process.pid or 0

        port = _free_port()
        cwd_path = Path(cwd)
        pkg = _detect_pkg_manager(cwd_path)
        cmd = f"{pkg} run dev -- --port {port}"

        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=str(cwd_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        url = f"http://localhost:{port}"
        _servers[cwd] = DevServer(process=proc, port=port, url=url)
        return url, proc.pid or 0

    async def stop(self, cwd: str) -> None:
        """Stop the dev server for ``cwd`` (if running)."""
        server = _servers.pop(cwd, None)
        if server and server.process.returncode is None:
            server.process.terminate()
            try:
                await asyncio.wait_for(server.process.wait(), timeout=5.0)
            except TimeoutError:
                server.process.kill()
