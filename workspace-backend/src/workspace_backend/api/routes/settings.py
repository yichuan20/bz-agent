"""Settings routes — disk usage, session pruning, and server log.

GET    /api/v1/settings/resources               disk + session storage stats
DELETE /api/v1/settings/sessions/clear          prune old session directories
GET    /api/v1/settings/log?lines=              tail the server log
GET    /api/v1/settings/tool-paths              configured toolchain paths
PUT    /api/v1/settings/tool-paths              set toolchain paths
"""

from __future__ import annotations

import asyncio
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Query

from workspace_backend.api.deps import get_settings_dep, get_tool_config_service
from workspace_backend.api.schemas import (
    ClearSessionsResponse,
    DiskStats,
    OkResponse,
    ResourcesResponse,
    ServerLogResponse,
    SetToolPathsRequest,
    StorageStats,
    ToolPathsResponse,
)
from workspace_backend.config import Settings
from workspace_backend.services.tool_config_service import KNOWN_TOOLS, ToolConfigService

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


def _dir_bytes(path: Path) -> int:
    """Total bytes of all files under ``path`` (non-recursive fast scan)."""
    total = 0
    try:
        for entry in path.rglob("*"):
            try:
                if entry.is_file():
                    total += entry.stat().st_size
            except OSError:
                pass
    except OSError:
        pass
    return total


@router.get(
    "/resources",
    response_model=ResourcesResponse,
    summary="Storage usage",
    description="Disk usage for sessions, server data, and the underlying filesystem.",
)
async def get_resources(settings: Settings = Depends(get_settings_dep)) -> ResourcesResponse:
    sessions_dir = settings.sessions_dir
    server_data = settings.data_root / "server_data"

    def _compute() -> ResourcesResponse:
        # Session count + bytes
        sess_count = 0
        sess_bytes = 0
        if sessions_dir.exists():
            for entry in sessions_dir.iterdir():
                if entry.is_dir():
                    sess_count += 1
                    sess_bytes += _dir_bytes(entry)
                elif entry.is_file():
                    try:
                        sess_bytes += entry.stat().st_size
                    except OSError:
                        pass

        sd_bytes = _dir_bytes(server_data) if server_data.exists() else 0

        usage = shutil.disk_usage(str(settings.bz_home))
        return ResourcesResponse(
            sessions=StorageStats(count=sess_count, bytes=sess_bytes),
            server_data=StorageStats(bytes=sd_bytes),
            disk=DiskStats(total=usage.total, used=usage.used, free=usage.free),
        )

    return await asyncio.to_thread(_compute)


@router.delete(
    "/sessions/clear",
    response_model=ClearSessionsResponse,
    summary="Prune old sessions",
    description="Delete session directories whose last-modified time is older than `olderThanDays` days.",
)
async def clear_sessions(
    olderThanDays: int = Query(30, ge=1, description="Delete sessions older than this many days."),
    settings: Settings = Depends(get_settings_dep),
) -> ClearSessionsResponse:
    sessions_dir = settings.sessions_dir
    cutoff = time.time() - olderThanDays * 86400

    def _delete() -> int:
        deleted = 0
        if not sessions_dir.exists():
            return 0
        for entry in sessions_dir.iterdir():
            try:
                mtime = entry.stat().st_mtime
            except OSError:
                continue
            if mtime < cutoff:
                try:
                    if entry.is_dir():
                        shutil.rmtree(entry)
                    else:
                        entry.unlink()
                    deleted += 1
                except OSError:
                    pass
        return deleted

    deleted = await asyncio.to_thread(_delete)
    return ClearSessionsResponse(deleted=deleted)


@router.get(
    "/log",
    response_model=ServerLogResponse,
    summary="Server log",
    description="Return the last `lines` lines from the server log file.",
)
async def get_log(
    lines: int = Query(200, ge=1, le=5000, description="Number of lines to return."),
    settings: Settings = Depends(get_settings_dep),
) -> ServerLogResponse:
    log_file = settings.bz_home / "server.log"

    def _read() -> list[str]:
        if not log_file.exists():
            return []
        text = log_file.read_text(encoding="utf-8", errors="replace")
        return text.splitlines()[-lines:]

    log_lines = await asyncio.to_thread(_read)
    return ServerLogResponse(
        bz_home=str(settings.bz_home),
        log_file=str(log_file),
        lines=log_lines,
    )


@router.get(
    "/tool-paths",
    response_model=ToolPathsResponse,
    summary="Toolchain paths",
    description=(
        "Configured absolute paths to the npm/pnpm/node executables, plus a "
        "per-tool `valid` flag (path is set and points at an existing file). Used by "
        "the dev server to locate the package manager and node."
    ),
)
async def get_tool_paths(
    svc: ToolConfigService = Depends(get_tool_config_service),
) -> ToolPathsResponse:
    paths = await svc.get_paths()
    valid = {tool: (await svc.resolve(tool)) is not None for tool in KNOWN_TOOLS}
    return ToolPathsResponse(paths=paths, valid=valid)


@router.put(
    "/tool-paths",
    response_model=OkResponse,
    summary="Set toolchain paths",
    description=(
        "Store absolute paths for the npm/pnpm/node executables. Unknown keys are "
        "ignored and blank values clear the corresponding tool."
    ),
)
async def set_tool_paths(
    body: SetToolPathsRequest,
    svc: ToolConfigService = Depends(get_tool_config_service),
) -> OkResponse:
    await svc.set_paths(body.paths)
    return OkResponse()
