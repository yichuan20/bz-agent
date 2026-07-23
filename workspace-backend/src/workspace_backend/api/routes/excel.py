"""Excel workbench routes.

GET  /api/v1/excel/load?path=         load workbook grid
PUT  /api/v1/excel/patch              patch cells and recalculate
PUT  /api/v1/excel/grid               update column/row sizes
PUT  /api/v1/excel/merge              set merged cell ranges
PUT  /api/v1/excel/renamesheet        rename a sheet tab
POST /api/v1/excel/addsheet           add a new empty sheet
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from workspace_backend.api.deps import get_excel_service
from workspace_backend.api.schemas import OkResponse
from workspace_backend.services.excel_service import ExcelService

router = APIRouter(prefix="/api/v1/excel", tags=["Excel"])


@router.get(
    "/load",
    summary="Load a workbook",
    description="Parse an .xlsx file and return its grid data. Results are cached in a sidecar file.",
)
async def load(
    path: str = Query(...),
    svc: ExcelService = Depends(get_excel_service),
) -> Any:
    return await svc.load(path)


@router.put(
    "/patch",
    summary="Patch cells",
    description="Merge cell updates into the workbook, recalculate formulas, and regenerate the .xlsx.",
)
async def patch(
    body: dict[str, Any],
    svc: ExcelService = Depends(get_excel_service),
) -> Any:
    path = str(body.get("path", ""))
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    return await svc.patch(path, body.get("sheet"), body.get("cells") or {})


@router.put(
    "/grid",
    response_model=OkResponse,
    summary="Update column/row sizes",
    description="Persist column widths and row heights to the sidecar (no xlsx rewrite).",
)
async def grid(
    body: dict[str, Any],
    svc: ExcelService = Depends(get_excel_service),
) -> OkResponse:
    path = str(body.get("path", ""))
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    await svc.set_grid(
        path, body.get("sheet"), body.get("columnIndexToWidth") or {}, body.get("rowIndexToHeight") or {}
    )
    return OkResponse()


@router.put(
    "/merge",
    summary="Set merged cell ranges",
    description="Replace merged-cell ranges for a sheet and regenerate the .xlsx.",
)
async def merge(
    body: dict[str, Any],
    svc: ExcelService = Depends(get_excel_service),
) -> Any:
    path = str(body.get("path", ""))
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    return await svc.merge_cells(path, body.get("sheet"), body.get("mergedCells") or [])


@router.put(
    "/renamesheet",
    summary="Rename a sheet",
    description="Rename a sheet tab in the sidecar. Returns 409 if the new name already exists.",
)
async def renamesheet(
    body: dict[str, Any],
    svc: ExcelService = Depends(get_excel_service),
) -> dict[str, Any]:
    path = str(body.get("path", ""))
    old = str(body.get("oldName", ""))
    new = str(body.get("newName", ""))
    if not path or not old or not new:
        raise HTTPException(status_code=422, detail="'path', 'oldName', and 'newName' are required.")
    try:
        name = await svc.rename_sheet(path, old, new)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "name": name}


@router.post(
    "/addsheet",
    summary="Add a sheet",
    description="Append an empty sheet to the workbook sidecar. Auto-names if `sheetName` is omitted.",
)
async def addsheet(
    body: dict[str, Any],
    svc: ExcelService = Depends(get_excel_service),
) -> dict[str, Any]:
    path = str(body.get("path", ""))
    if not path:
        raise HTTPException(status_code=422, detail="'path' is required.")
    name = await svc.add_sheet(path, body.get("sheetName"))
    return {"ok": True, "sheetName": name}
