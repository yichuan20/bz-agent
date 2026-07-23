"""Document workbench routes — parse, cursor, save, download .docx/.pdf.

POST /api/v1/doc/parse           parse a document (path or file upload)
PUT  /api/v1/doc/cursor          persist cursor position (in-memory)
PUT  /api/v1/doc/save            save blocks back to .docx
GET  /api/v1/doc/download?path=  download .docx as attachment
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from workspace_backend.api.deps import get_doc_service
from workspace_backend.api.schemas import OkResponse
from workspace_backend.services.doc_service import DocService

router = APIRouter(prefix="/api/v1/doc", tags=["Documents"])


@router.post(
    "/parse",
    summary="Parse a document",
    description=(
        "Parse a .docx, .pdf, .md, or .html file. Accepts two formats:\n\n"
        "- **JSON body** ``{path, force?}`` — parse a server-side file by path.\n"
        "- **multipart/form-data** with a ``file`` field — parse an uploaded file.\n\n"
        "Docx results are cached in a sidecar for instant re-opens."
    ),
)
async def parse_doc(
    request: Request,
    svc: DocService = Depends(get_doc_service),
) -> Any:
    content_type = request.headers.get("content-type", "")
    if "multipart" in content_type or "form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if file is None:
            raise HTTPException(status_code=422, detail="Multipart upload requires a 'file' field.")
        data = await file.read()  # type: ignore[union-attr]
        filename: str = getattr(file, "filename", None) or "upload"
        return await svc.parse_upload(data, filename)
    # JSON body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Expected JSON body {path} or multipart file upload.") from None
    path = str(body.get("path", ""))
    force = bool(body.get("force", False))
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    try:
        return await svc.parse(path, force=force)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}") from None


@router.put(
    "/cursor",
    response_model=OkResponse,
    summary="Set cursor position",
    description="Persist the editor cursor / selection for a document (in-memory; resets on server restart).",
)
async def set_cursor(
    body: dict[str, Any],
    svc: DocService = Depends(get_doc_service),
) -> OkResponse:
    svc.set_cursor(str(body.get("path", "")), int(body.get("selStart", 0)), int(body.get("selEnd", 0)))
    return OkResponse()


@router.put(
    "/save",
    summary="Save document blocks",
    description="Persist a block list to the sidecar and regenerate the .docx binary. Returns word count.",
)
async def save_doc(
    body: dict[str, Any],
    svc: DocService = Depends(get_doc_service),
) -> Any:
    path = str(body.get("path", ""))
    blocks = body.get("blocks") or []
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    return await svc.save(path, blocks)


@router.get(
    "/download",
    summary="Download a document",
    description="Build a .docx binary from the stored block sidecar and return it as an attachment.",
)
async def download_doc(
    path: str = Query(...),
    svc: DocService = Depends(get_doc_service),
) -> Response:
    """Convert sidecar → DOCX and stream back as a file download. (Old: /api/doc/download)"""
    try:
        data = await svc.download(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="sidecar not found — open the file first") from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"could not generate DOCX: {exc}") from exc
    p = __import__("pathlib").Path(path)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{p.name}"'},
    )
