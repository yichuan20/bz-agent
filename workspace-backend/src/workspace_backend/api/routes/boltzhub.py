"""BoltzHub integration routes.

Kept at the OLD path prefix ``/boltzhub/`` (not ``/api/v1/``) so the frontend's
agent.tsx BoltzHub modal calls work without any frontend changes.

    GET  /boltzhub/check?cwd=          local config + login status
    GET  /boltzhub/apps                list creator apps
    GET  /boltzhub/versions?appId=     list versions + suggest next
    GET  /boltzhub/token-usage?period= token usage history
    POST /boltzhub/create-app          create a BoltzHub app
    POST /boltzhub/publish             publish a version
    POST /boltzhub/push   (SSE)        build → zip → upload → deploy pipeline
    POST /boltzhub/sync   (SSE)        download → extract → install pipeline
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from workspace_backend.api.deps import get_boltzhub_service, get_credential_service
from workspace_backend.services.boltzhub_service import BoltzHubService
from workspace_backend.services.credential_service import CredentialService

router = APIRouter(prefix="/boltzhub", tags=["BoltzHub"])

_SSE_HEADERS = {"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}


async def _token(creds: CredentialService) -> str:
    """Resolve the BZ_API_KEY token; raise 401 if absent."""
    tok = await creds.get_api_key()
    if not tok:
        raise HTTPException(status_code=401, detail="Not logged in to BoltzHub (no BZ_API_KEY).")
    return tok


# ── Read-only ─────────────────────────────────────────────────────────────────


@router.get(
    "/check",
    summary="Check BoltzHub link",
    description="Return local app config and login status for a working directory.",
)
async def check(
    cwd: str = Query(""),
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> Any:
    token = await creds.get_api_key()
    return svc.check(cwd, token)


@router.get(
    "/apps",
    summary="List BoltzHub apps",
    description="Return all creator apps for the authenticated user.",
)
async def list_apps(
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> Any:
    token = await _token(creds)
    try:
        return await svc.list_apps(token)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/versions",
    summary="List app versions",
    description="List published versions for an app, newest first, with a suggested next version.",
)
async def list_versions(
    appId: str = Query(...),
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> Any:
    token = await _token(creds)
    try:
        return await svc.list_versions(token, appId)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/token-usage",
    summary="Token usage history",
    description="Return token consumption history from BoltzHub for the given period.",
)
async def token_usage(
    period: str = Query("30d"),
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> Any:
    token = await _token(creds)
    try:
        return await svc.token_usage(token, period)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Write ─────────────────────────────────────────────────────────────────────


class CreateAppBody(BaseModel):
    cwd: str = ""
    name: str
    description: str | None = None
    visibility: str = "private"
    buildCommand: str | None = None


@router.post(
    "/create-app",
    summary="Create a BoltzHub app",
    description="Create a new creator app on BoltzHub and write the config to `<cwd>/.bzhub/app_config.json`.",
)
async def create_app(
    body: CreateAppBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> Any:
    token = await _token(creds)
    try:
        return await svc.create_app(token, body.cwd, body.name, body.description, body.visibility, body.buildCommand)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class PublishBody(BaseModel):
    appId: str


@router.post(
    "/publish",
    summary="Publish a version",
    description="Mark the current deployment as a published version on BoltzHub.",
)
async def publish(
    body: PublishBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> Any:
    token = await _token(creds)
    try:
        return await svc.publish(token, body.appId)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── SSE pipelines ─────────────────────────────────────────────────────────────


class PushBody(BaseModel):
    cwd: str = ""
    releaseNotes: str | None = None
    versionNumber: str | None = None


@router.post(
    "/push",
    summary="Push to BoltzHub (SSE)",
    description=(
        "Build the project, zip it, upload to BoltzHub, and deploy. "
        "Streams step-by-step progress as Server-Sent Events. "
        "Steps: build → archive → upload → deploy → publish → done (or error)."
    ),
)
async def push(
    body: PushBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> StreamingResponse:
    token = await _token(creds)

    async def _stream():  # type: ignore[return]
        async for chunk in svc.push(token, body.cwd, body.releaseNotes, body.versionNumber):
            yield chunk

    return StreamingResponse(_stream(), media_type="text/event-stream", headers=_SSE_HEADERS)


class SyncBody(BaseModel):
    cwd: str = ""
    appId: str | None = None


@router.post(
    "/sync",
    summary="Sync from BoltzHub (SSE)",
    description=(
        "Download the latest app code from BoltzHub, extract it into ``cwd``, and "
        "install dependencies. Streams progress as Server-Sent Events. "
        "Steps: download → extract → install → done (or error)."
    ),
)
async def sync(
    body: SyncBody,
    svc: BoltzHubService = Depends(get_boltzhub_service),
    creds: CredentialService = Depends(get_credential_service),
) -> StreamingResponse:
    token = await _token(creds)

    async def _stream():  # type: ignore[return]
        async for chunk in svc.sync(token, body.cwd, body.appId):
            yield chunk

    return StreamingResponse(_stream(), media_type="text/event-stream", headers=_SSE_HEADERS)
