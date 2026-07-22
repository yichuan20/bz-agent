"""BoltzHub integration routes.

Routes copied verbatim from old app.py boltzhub_router; only the async HTTP
client (aiohttp → httpx via AppContext) and the auth-token lookup (app.state →
CredentialService) differ from the original.

Kept at the old ``/boltzhub/`` prefix (not ``/api/v1/``) so agent.tsx
BoltzHub modal calls work without frontend changes.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from workspace_backend.api.deps import get_boltzhub_service, get_settings_dep
from workspace_backend.config import Settings
from workspace_backend.services.boltzhub_service import BoltzHubService

router = APIRouter(prefix="/boltzhub", tags=["BoltzHub"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _default_cwd(settings: Settings) -> str:
    return str(settings.bzcode_cwd)


def _require_token(svc: BoltzHubService, msg: str = "Not logged in to BoltzHub") -> str:
    tok = svc.token()
    if not tok:
        raise HTTPException(status_code=401, detail=msg)
    return tok


# ── check ─────────────────────────────────────────────────────────────────────


@router.get(
    "/check", description="Check if a working directory is linked to a BoltzHub app and whether the user is logged in."
)
async def boltzhub_check(
    cwd: str = Query(""),
    svc: BoltzHubService = Depends(get_boltzhub_service),
    settings: Settings = Depends(get_settings_dep),
) -> Any:
    return svc.check(cwd, _default_cwd(settings))


# ── create-app ────────────────────────────────────────────────────────────────


class CreateAppBody(BaseModel):
    cwd: str = ""
    name: str
    description: str | None = None
    visibility: str = "private"
    priceMonthly: float | None = None
    buildCommand: str | None = None


@router.post(
    "/create-app", description="Create a new BoltzHub app and write its config to `<cwd>/.bzhub/app_config.json`."
)
async def boltzhub_create_app(
    body: CreateAppBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    settings: Settings = Depends(get_settings_dep),
) -> Any:
    try:
        return await svc.create_app(
            body.cwd,
            _default_cwd(settings),
            body.name,
            body.description,
            body.visibility,
            body.priceMonthly,
            body.buildCommand,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── apps ──────────────────────────────────────────────────────────────────────


@router.get("/apps", description="List all BoltzHub creator apps for the authenticated user.")
async def boltzhub_apps(svc: BoltzHubService = Depends(get_boltzhub_service)) -> Any:
    _require_token(svc, "Not logged in")
    try:
        return await svc.list_apps()
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── versions ──────────────────────────────────────────────────────────────────


@router.get(
    "/versions", description="List published versions for an app, newest first, with a suggested next version string."
)
async def boltzhub_versions(
    appId: str = Query(...),
    svc: BoltzHubService = Depends(get_boltzhub_service),
) -> Any:
    _require_token(svc, "Not logged in")
    try:
        return await svc.list_versions(appId)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── token-usage ───────────────────────────────────────────────────────────────


@router.get("/token-usage", description="Return BoltzHub token usage history for the given time period.")
async def boltzhub_token_usage(
    period: str = Query("30d"),
    svc: BoltzHubService = Depends(get_boltzhub_service),
) -> Any:
    _require_token(svc, "Not logged in")
    try:
        return await svc.token_usage(period)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── publish ───────────────────────────────────────────────────────────────────


class BzHubPublishBody(BaseModel):
    appId: str


@router.post("/publish", description="Mark the current deployed version of an app as published on BoltzHub.")
async def boltzhub_publish(
    body: BzHubPublishBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
) -> Any:
    _require_token(svc, "Not logged in")
    try:
        return await svc.publish(body.appId)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── create-version ────────────────────────────────────────────────────────────


class BzHubVersionBody(BaseModel):
    appId: str
    releaseNotes: str | None = None
    versionNumber: str | None = None


@router.post("/create-version", description="Create a named release version for a BoltzHub app.")
async def boltzhub_create_version(
    body: BzHubVersionBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
) -> Any:
    _require_token(svc, "Not logged in")
    try:
        return await svc.create_version(body.appId, body.releaseNotes, body.versionNumber)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── push (SSE) ────────────────────────────────────────────────────────────────


class PushBody(BaseModel):
    cwd: str = ""
    releaseNotes: str | None = None
    versionNumber: str | None = None


@router.post("/push", description="Build, archive, upload, and deploy a project to BoltzHub. Streams progress as SSE.")
async def boltzhub_push(
    body: PushBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    settings: Settings = Depends(get_settings_dep),
) -> StreamingResponse:
    async def _stream():  # type: ignore[return]
        async for chunk in svc.push_stream(body.cwd, _default_cwd(settings), body.releaseNotes, body.versionNumber):
            yield chunk

    return StreamingResponse(_stream(), media_type="text/event-stream", headers=_SSE_HEADERS)


# ── sync (SSE) ────────────────────────────────────────────────────────────────


class BzHubSyncBody(BaseModel):
    cwd: str = ""
    appId: str | None = None


@router.post(
    "/sync", description="Download the latest app code from BoltzHub and install dependencies. Streams progress as SSE."
)
async def boltzhub_sync(
    body: BzHubSyncBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    settings: Settings = Depends(get_settings_dep),
) -> StreamingResponse:
    async def _stream():  # type: ignore[return]
        async for chunk in svc.sync_stream(body.cwd, _default_cwd(settings), body.appId):
            yield chunk

    return StreamingResponse(_stream(), media_type="text/event-stream", headers=_SSE_HEADERS)
