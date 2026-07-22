"""Canvas, widget registry, and widget DB routes.

GET/POST /api/v1/canvas                          canvas state for a session
GET/PUT/DELETE /api/v1/custom-widgets/{id}        per-session custom widget code
GET/POST /api/v1/widgets                          built-in widget registry
POST /api/v1/widgets/seed                         seed built-in widgets
DELETE /api/v1/widgets/{id}                       remove a widget
GET/POST/PUT/DELETE /api/v1/db/widget/{id}/rows   per-widget row store
GET/PUT /api/v1/db/widget/{id}/schema             row-store schema
POST /api/v1/db/widget/{id}/exec                  run Python against row store
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from workspace_backend.api.deps import get_canvas_service, get_widget_db_service, get_widget_service
from workspace_backend.api.schemas import OkResponse
from workspace_backend.services.canvas_service import CanvasService
from workspace_backend.services.widget_db_service import WidgetDbService
from workspace_backend.services.widget_service import WidgetService

router = APIRouter(prefix="/api/v1", tags=["Canvas & Widgets"])

# ── Canvas ────────────────────────────────────────────────────────────────────


@router.get(
    "/canvas",
    summary="Load canvas",
    description="Return the stored widget canvas state for a session.",
)
async def get_canvas(
    sessionId: str = Query(...),
    cwd: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    return await svc.get_canvas(sessionId, cwd)


@router.post(
    "/canvas",
    summary="Save canvas",
    description="Persist the full canvas state (widget layout and config) for a session.",
)
async def save_canvas(
    state: dict[str, Any],
    sessionId: str = Query(...),
    cwd: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> dict[str, Any]:
    file = await svc.save_canvas(sessionId, cwd, state)
    return {"ok": True, "file": file}


# ── Custom widgets ────────────────────────────────────────────────────────────


@router.get(
    "/custom-widgets/{canvas_id}",
    summary="Get custom widget code",
    description="Return the JS source code for a session-scoped custom widget, falling back to the global store.",
)
async def get_custom_widget(
    canvas_id: str,
    sessionId: str = Query(...),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    code = await svc.get_custom_widget(sessionId, canvas_id)
    if code is None:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return {"canvasId": canvas_id, "code": code}


@router.put(
    "/custom-widgets/{canvas_id}",
    summary="Save custom widget code",
    description="Write JS source code for a custom widget scoped to a session.",
)
async def save_custom_widget(
    canvas_id: str,
    body: dict[str, Any],
    sessionId: str = Query(...),
    svc: CanvasService = Depends(get_canvas_service),
) -> dict[str, Any]:
    await svc.save_custom_widget(sessionId, canvas_id, str(body.get("code", "")))
    return {"ok": True, "canvasId": canvas_id}


@router.delete(
    "/custom-widgets/{canvas_id}",
    summary="Delete custom widget",
    description="Remove a custom widget's JS from the session-scoped store and the global fallback.",
)
async def delete_custom_widget(
    canvas_id: str,
    sessionId: str = Query(...),
    svc: CanvasService = Depends(get_canvas_service),
) -> OkResponse:
    await svc.delete_custom_widget(sessionId, canvas_id)
    return OkResponse()


# ── Widget registry ───────────────────────────────────────────────────────────


@router.get(
    "/widgets",
    summary="List widgets",
    description="Return all non-archived widgets from the built-in registry, including their JS source.",
)
async def list_widgets(svc: WidgetService = Depends(get_widget_service)) -> Any:
    return {"widgets": await svc.list_widgets()}


@router.post(
    "/widgets",
    summary="Create / upsert a widget",
    description="Insert or update a widget entry in the registry. Pass `code` to also write the JS file.",
)
async def create_widget(
    body: dict[str, Any],
    svc: WidgetService = Depends(get_widget_service),
) -> Any:
    widget = await svc.create_widget(body)
    return {"ok": True, "widget": widget}


@router.post(
    "/widgets/seed",
    summary="Seed built-in widgets",
    description="Bulk-upsert entries flagged `isBuiltin: true`. User-created widgets are not overwritten.",
)
async def seed_widgets(
    body: Any,
    svc: WidgetService = Depends(get_widget_service),
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = body if isinstance(body, list) else (body or {}).get("widgets", [])
    seeded = await svc.seed_widgets(entries)
    return {"seeded": seeded}


@router.delete(
    "/widgets/{widget_id}",
    summary="Delete a widget",
    description="Remove a widget from the registry and delete its JS file.",
)
async def delete_widget(
    widget_id: str,
    svc: WidgetService = Depends(get_widget_service),
) -> OkResponse:
    await svc.delete_widget(widget_id)
    return OkResponse()


# ── Widget DB ─────────────────────────────────────────────────────────────────


@router.get(
    "/db/widget/{canvas_id}/schema",
    summary="Widget DB schema",
    description="Return the column list and row count for a widget's JSON row-store.",
)
async def get_schema(
    canvas_id: str,
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    return await svc.get_schema(canvas_id)


@router.post(
    "/db/widget/{canvas_id}/schema",
    summary="Set widget DB schema",
    description="Replace the column list for a widget's JSON row-store.",
)
async def set_schema(
    canvas_id: str,
    body: dict[str, Any],
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    return await svc.set_schema(canvas_id, body.get("columns", []))


@router.get(
    "/db/widget/{canvas_id}/rows",
    summary="List widget DB rows",
    description="Return a paginated, sortable view of rows in a widget's JSON row-store.",
)
async def list_rows(
    canvas_id: str,
    order: str = Query("id"),
    dir: str = Query("asc"),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    return await svc.list_rows(canvas_id, order=order, direction=dir, limit=limit, offset=offset)


@router.post(
    "/db/widget/{canvas_id}/rows",
    summary="Insert widget DB rows",
    description="Append one or more rows to a widget's JSON row-store. Each row gets an auto-incremented integer `id`.",
)
async def insert_rows(
    canvas_id: str,
    body: dict[str, Any],
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    rows = body.get("rows") or ([body.get("row")] if body.get("row") else [])
    inserted = await svc.insert_rows(canvas_id, [r for r in rows if r])
    return {"inserted": inserted}


@router.put(
    "/db/widget/{canvas_id}/rows/{row_id}",
    summary="Update a widget DB row",
    description="Merge `data` fields into the row identified by `row_id`. Returns 404 if the row does not exist.",
)
async def update_row(
    canvas_id: str,
    row_id: int,
    body: dict[str, Any],
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    updated = await svc.update_row(canvas_id, row_id, body.get("data", {}))
    if updated is None:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return {"updated": updated}


@router.delete(
    "/db/widget/{canvas_id}/rows/{row_id}",
    summary="Delete a widget DB row",
    description="Remove the row identified by `row_id` from a widget's JSON row-store.",
)
async def delete_row(
    canvas_id: str,
    row_id: int,
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    deleted = await svc.delete_row(canvas_id, row_id)
    return {"deleted": row_id if deleted else None}


@router.post(
    "/db/widget/{canvas_id}/exec",
    summary="Execute code against widget DB",
    description="Run Python with the widget's `records` list in scope. Returns `result` from the execution namespace.",
)
async def exec_code(
    canvas_id: str,
    body: dict[str, Any],
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    result = await svc.exec_code(canvas_id, str(body.get("code", "")))
    return {"result": result}
