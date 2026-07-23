"""Dev server routes — start and stop preview dev servers (coder mode).

Logic copied verbatim from old app.py dev_server_start / dev_server_stop.

    POST /api/v1/dev-server/start   spawn pnpm/yarn/npm run dev in a cwd
    POST /api/v1/dev-server/stop    stop the dev server for a cwd
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from workspace_backend.api.deps import get_dev_server_service, get_settings_dep
from workspace_backend.api.schemas import OkResponse
from workspace_backend.config import Settings
from workspace_backend.services.dev_server_service import DevServerService

router = APIRouter(prefix="/api/v1/dev-server", tags=["Dev Server"])


class DevServerBody(BaseModel):
    cwd: str = ""


@router.post(
    "/start",
    summary="Start dev server",
    description=(
        "Spawn a preview dev server (pnpm/yarn/npm run dev) on a free port in ``cwd``. "
        "Idempotent — returns the existing port if already running. "
        "Detects the package manager from the lockfile. Returns the ``port`` the dev "
        "server is listening on; the frontend builds the browser-facing preview URL "
        "from ``window.location`` + this port (the backend cannot see the public "
        "hostname behind the reverse proxy)."
    ),
)
async def start(
    body: DevServerBody,
    svc: DevServerService = Depends(get_dev_server_service),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, object]:
    default_cwd = str(settings.bzcode_cwd)
    try:
        return await svc.start(body.cwd, default_cwd)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post(
    "/stop",
    response_model=OkResponse,
    summary="Stop dev server",
    description="Terminate the preview dev server running in ``cwd``. No-op if none is running.",
)
async def stop(
    body: DevServerBody,
    svc: DevServerService = Depends(get_dev_server_service),
) -> OkResponse:
    await svc.stop(body.cwd)
    return OkResponse()
