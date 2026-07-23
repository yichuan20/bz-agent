"""bzcode subprocess adapter: spawn + environment building.

Isolates the OS-level concern of starting a ``bzcode --stdio`` process. The spawn
function is injectable (a :class:`ProcessSpawner` protocol) so tests can substitute a
fake process without a real binary, while production uses :func:`asyncio_spawn`.

The 16 MB stdout buffer limit matches the original server: bzcode can emit large tool
results, and the reader ( :mod:`workspace_backend.infra.reader` ) drains oversized
lines rather than crashing.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Protocol

# bzcode may emit very large single lines (e.g. big tool outputs). Raise the
# StreamReader limit; the reader handles anything still larger by draining it.
_STDOUT_LIMIT = 16 * 1024 * 1024


def build_env(api_key: str, bz_home: Path | None) -> dict[str, str]:
    """Build the environment for a bzcode subprocess.

    Mirrors the original server: inherit the parent environment, then overlay only
    ``BZ_API_KEY`` (the sole key passed through), ``BZ_PYTHON`` (so agent helper
    scripts run with our interpreter), and ``BZ_HOME`` when set.
    """
    env = dict(os.environ)
    if api_key:
        env["BZ_API_KEY"] = api_key
    env["BZ_PYTHON"] = sys.executable
    if bz_home is not None:
        env["BZ_HOME"] = str(bz_home)
    return env


class ProcessSpawner(Protocol):
    """Callable that starts a subprocess and returns it.

    Kept as a Protocol so the pool can be handed a fake in unit tests. The return
    type is :class:`asyncio.subprocess.Process`; a fake need only provide the members
    the runtime uses (``stdin``, ``stdout``, ``stderr``, ``pid``, ``returncode``,
    ``wait()``, ``kill()``).
    """

    async def __call__(self, cmd: list[str], *, cwd: str, env: dict[str, str]) -> asyncio.subprocess.Process: ...


async def asyncio_spawn(cmd: list[str], *, cwd: str, env: dict[str, str]) -> asyncio.subprocess.Process:
    """Production spawner: launch a real process with piped stdio."""
    return await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
        limit=_STDOUT_LIMIT,
    )
