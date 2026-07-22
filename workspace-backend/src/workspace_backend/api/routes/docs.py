"""Document workbench routes — parse, cursor, save, download .docx/.pdf.

POST /api/v1/doc/parse           parse a document (path or file upload)
PUT  /api/v1/doc/cursor          persist cursor position (in-memory)
PUT  /api/v1/doc/save            save blocks back to .docx
GET  /api/v1/doc/download?path=  download .docx as attachment
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from workspace_backend.api.deps import get_doc_service
from workspace_backend.api.schemas import OkResponse
from workspace_backend.services.doc_service import DocService

router = APIRouter(prefix="/api/v1/doc", tags=["Documents"])


@router.post(
    "/parse",
    summary="Parse a document",
    description=(
        "Parse a .docx, .pdf, .md, or .html file and return its content as a block list "
        "(docx) or plain text (pdf). Supply either a ``path`` in the JSON body or upload "
        "a ``file`` via multipart. Results are cached in a sidecar for instant re-opens."
    ),
)
async def parse_doc(
    path: str | None = None,
    force: bool = False,
    file: UploadFile | None = File(default=None),
    svc: DocService = Depends(get_doc_service),
) -> Any:
    if file is not None:
        data = await file.read()
        return await svc.parse_upload(data, file.filename or "upload")
    if path:
        try:
            return await svc.parse(path, force=force)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"File not found: {path}") from None
    raise HTTPException(status_code=422, detail="Provide either 'path' or a file upload.")


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
    try:
        data = await svc.download(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document not found or never parsed.") from None
    filename = path.rsplit("/", 1)[-1]
    if not filename.endswith(".docx"):
        filename += ".docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
