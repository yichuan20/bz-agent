"""Dev server routes — start, poll, and stop preview dev servers (coder mode).

POST /api/v1/dev-server/start    spawn pnpm/yarn/npm run dev in a cwd
GET  /api/v1/dev-server/status   report whether the dev server's port is listening
POST /api/v1/dev-server/stop     stop the dev server for a cwd
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
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
        "Idempotent — returns the existing port if already running. Detects the package "
        "manager from the lockfile. Returns immediately after spawning (does not wait for "
        "the port to bind — poll ``/status`` for that). Returns the ``port``; the frontend "
        "builds the browser-facing preview URL from ``window.location`` + this port (the "
        "backend cannot see the public hostname behind the reverse proxy)."
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


@router.get(
    "/status",
    summary="Dev server status",
    description=(
        "Report whether the dev server for ``cwd`` is running and its port is accepting "
        "connections. The frontend polls this after ``/start`` and loads the preview only "
        "once ``listening`` is true, so the iframe's first request always hits a bound port."
    ),
)
async def status(
    cwd: str = Query("", description="Working directory of the dev server."),
    svc: DevServerService = Depends(get_dev_server_service),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, object]:
    return await svc.status(cwd, str(settings.bzcode_cwd))


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
