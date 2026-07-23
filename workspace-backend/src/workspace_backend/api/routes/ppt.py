"""PPT workbench routes.

GET /api/v1/ppt/load?path=     parse a .pptx into slide JSON
PUT /api/v1/ppt/save           save slide JSON and regenerate .pptx
GET /api/v1/ppt/status?path=   check whether the sidecar is ready
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from workspace_backend.api.deps import get_ppt_service
from workspace_backend.services.ppt_service import PptService

router = APIRouter(prefix="/api/v1/ppt", tags=["PowerPoint"])


@router.get(
    "/load",
    summary="Load a presentation",
    description="Parse a .pptx file into a list of slide dicts. Cached in a sidecar for fast re-opens.",
)
async def load(
    path: str = Query(...),
    svc: PptService = Depends(get_ppt_service),
) -> Any:
    try:
        slides = await svc.load(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}") from None
    return {"slides": slides}


@router.put(
    "/save",
    summary="Save a presentation",
    description="Persist slide data to the sidecar and regenerate the .pptx binary.",
)
async def save(
    body: dict[str, Any],
    svc: PptService = Depends(get_ppt_service),
) -> dict[str, Any]:
    path = str(body.get("path", ""))
    slides = body.get("slides") or []
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    await svc.save(path, slides)
    return {"ok": True, "path": path}


@router.get(
    "/status",
    summary="Presentation sidecar status",
    description="Return whether the parsed sidecar exists (ready for instant open).",
)
async def status(
    path: str = Query(...),
    svc: PptService = Depends(get_ppt_service),
) -> dict[str, bool]:
    ready = svc.has_sidecar(path)
    return {"ready": ready, "hasSidecar": ready}
