"""Version endpoint."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as pkg_version

from fastapi import APIRouter

from workspace_backend.api.schemas import VersionResponse

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
