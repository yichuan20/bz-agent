"""Dev server routes — start and stop preview dev servers (coder mode).

POST /api/v1/dev-server/start   spawn pnpm/yarn/npm run dev in a cwd
POST /api/v1/dev-server/stop    stop the dev server for a cwd
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from workspace_backend.api.deps import get_dev_server_service
from workspace_backend.api.schemas import OkResponse
from workspace_backend.services.dev_server_service import DevServerService

router = APIRouter(prefix="/api/v1/dev-server", tags=["Dev Server"])


class DevServerBody(BaseModel):
    cwd: str = ""


@router.post(
    "/start",
    summary="Start dev server",
    description=(
        "Spawn a preview dev server (pnpm/yarn/npm run dev) on a free port in ``cwd``. "
        "Idempotent: returns the existing URL if one is already running. Returns the "
        "server URL and process PID."
    ),
)
async def start(
    body: DevServerBody,
    svc: DevServerService = Depends(get_dev_server_service),
) -> dict[str, object]:
    if not body.cwd:
        raise HTTPException(status_code=422, detail="'cwd' is required.")
    url, pid = await svc.start(body.cwd)
    return {"url": url, "pid": pid}


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
