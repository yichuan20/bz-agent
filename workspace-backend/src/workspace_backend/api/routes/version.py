"""Version and home-config endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request

from workspace_backend import __version__
from workspace_backend.api.deps import get_settings_dep
from workspace_backend.api.schemas import VersionResponse
from workspace_backend.config import Settings

router = APIRouter(prefix="/api/v1", tags=["System"])


def _backend_version() -> str:
    # Read the in-tree constant, not importlib.metadata: the deployment ships source
    # under src/ and is never pip-installed, so package metadata is absent on the remote.
    return __version__


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Backend version",
    description="Return the running workspace-backend version.",
)
async def get_version(request: Request) -> VersionResponse:
    return VersionResponse(
        backend=_backend_version(),
        bzcode=getattr(request.app.state, "bzcode_version", None),
        bzcode_latest=getattr(request.app.state, "bzcode_latest", None),
    )


@router.get(
    "/home",
    include_in_schema=False,
    summary="Home config",
)
async def get_home(settings: Settings = Depends(get_settings_dep)) -> dict[str, str]:
    """Mirror of the old /api/home — returns defaultCwd for the frontend."""
    home = str(Path.home())
    cwd = str(settings.bzcode_cwd)
    return {"home": home, "defaultCwd": cwd if Path(cwd).is_dir() else home}  # noqa: ASYNC240
