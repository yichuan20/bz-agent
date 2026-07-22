"""Version and home-config endpoints."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as pkg_version
from pathlib import Path

from fastapi import APIRouter, Depends

from workspace_backend.api.deps import get_settings_dep
from workspace_backend.api.schemas import VersionResponse
from workspace_backend.config import Settings

router = APIRouter(prefix="/api/v1", tags=["System"])


def _backend_version() -> str:
    try:
        return pkg_version("workspace-backend")
    except PackageNotFoundError:
        return "0.0.0+unknown"


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Backend version",
    description="Return the running workspace-backend version.",
)
async def get_version() -> VersionResponse:
    return VersionResponse(backend=_backend_version())


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
