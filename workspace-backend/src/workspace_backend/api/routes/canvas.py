"""Canvas, widget, and widget-DB routes.

Routes copied verbatim from old app.py canvas_router + db_router.
Kept at old path prefixes (/canvas, /widgets, /custom-widgets, /db/widget)
so the frontend works without changes. Mounted without /api/v1 prefix.

    GET  /canvas?cwd=&sessionId=            load canvas
    POST /canvas?cwd=&sessionId=            save canvas
    POST /canvas/deploy-widget              deploy a new custom widget to the canvas
    GET  /widgets                           list all non-archived widgets
    GET  /widgets/template?name=            fetch a .js template by name
    GET  /widgets/{widget_id}               get one widget + code
    POST /widgets                           upsert a widget
    POST /widgets/seed                      seed built-in widgets
    DELETE /widgets/{widget_id}             archive a widget
    GET  /custom-widgets/{id}?sessionId=    get custom widget code
    PUT  /custom-widgets/{id}?sessionId=    set custom widget code
    DELETE /custom-widgets/{id}?sessionId=  delete custom widget code
    GET  /api/v1/db/widget/{id}/schema      widget DB schema
    POST /api/v1/db/widget/{id}/schema      ensure columns
    GET  /api/v1/db/widget/{id}/rows        query rows
    POST /api/v1/db/widget/{id}/rows        insert rows
    PUT  /api/v1/db/widget/{id}/rows/{row}  update a row
    DELETE /api/v1/db/widget/{id}/rows/{row} delete a row
    POST /api/v1/db/widget/{id}/exec        exec Python code against records
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi import Path as FPath
from fastapi.responses import Response
from pydantic import BaseModel

from workspace_backend.api.deps import (
    get_canvas_service,
    get_widget_db_service,
    get_widget_service,
)
from workspace_backend.services.canvas_service import CanvasService
from workspace_backend.services.widget_db_service import WidgetDbService
from workspace_backend.services.widget_service import WidgetService

# All canvas/widget routes under /api/v1 (consistent with every other new backend route)
router = APIRouter(prefix="/api/v1", tags=["Canvas & Widgets"])

# Widget DB routes also under /api/v1 (same prefix — mounted as one router in app.py)
db_router = APIRouter(prefix="/api/v1", tags=["Canvas & Widgets"])


# ── Canvas ─────────────────────────────────────────────────────────────────────


@router.get("/canvas", description="Load the widget canvas for a session or cwd.")
async def get_canvas(
    cwd: str = Query(""),
    sessionId: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    return svc.get_canvas(sessionId, cwd)


@router.post("/canvas", description="Save the widget canvas for a session or cwd.")
async def post_canvas(
    request: Request,
    cwd: str = Query(""),
    sessionId: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    body = await request.json()
    return svc.save_canvas(sessionId, cwd, body)


# ── Deploy widget ──────────────────────────────────────────────────────────────


class DeployWidgetBody(BaseModel):
    sessionId: str = ""
    cwd: str = ""
    title: str = "Widget"
    code: str = ""
    w: int = 380
    h: int = 280
    x: int | None = None
    y: int | None = None
    initialData: list[dict[str, Any]] = []


@router.post(
    "/canvas/deploy-widget",
    description="Deploy a new custom widget to the canvas, writing its JS code and optional initial data.",
)
async def deploy_widget(
    body: DeployWidgetBody,
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    if not body.sessionId and (not body.cwd or not __import__("os").path.isdir(body.cwd)):
        raise HTTPException(status_code=400, detail="sessionId or valid cwd required")
    if not body.code:
        raise HTTPException(status_code=400, detail="code is required")
    return svc.deploy_widget(
        body.sessionId,
        body.cwd,
        body.title,
        body.code,
        body.w,
        body.h,
        body.x,
        body.y,
        body.initialData,
    )


# ── Widgets ────────────────────────────────────────────────────────────────────


@router.get("/widgets", description="List all non-archived built-in widgets with their code.")
async def get_widgets(svc: WidgetService = Depends(get_widget_service)) -> Any:
    return {"widgets": await svc.list_widgets()}


@router.get(
    "/widgets/template",
    description="Fetch the raw JS template for a built-in widget by name.",
)
async def get_widget_template(
    name: str = Query(...),
    svc: WidgetService = Depends(get_widget_service),
) -> Response:
    try:
        code = await svc.get_widget_template(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"template not found: {name}") from None
    return Response(content=code, media_type="application/javascript")


@router.get("/widgets/{widget_id}", description="Get a single widget entry and its code.")
async def get_widget(
    widget_id: str = FPath(...),
    svc: WidgetService = Depends(get_widget_service),
) -> Any:
    entry = await svc.get_widget(widget_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="widget not found")
    return entry


@router.post("/widgets", description="Create or update a widget entry (upsert by id).")
async def post_widget(
    request: Request,
    svc: WidgetService = Depends(get_widget_service),
) -> Any:
    body = await request.json()
    if not body.get("id", "").strip():
        raise HTTPException(status_code=400, detail="'id' is required")
    return await svc.create_widget(body)


@router.post(
    "/widgets/seed",
    description="Seed built-in widgets from a list; only updates entries flagged isBuiltin.",
)
async def seed_widgets(
    request: Request,
    svc: WidgetService = Depends(get_widget_service),
) -> Any:
    body = await request.json()
    incoming = body if isinstance(body, list) else (body.get("widgets") or [])
    seeded = await svc.seed_widgets(incoming)
    return {"seeded": seeded}


@router.delete("/widgets/{widget_id}", description="Archive (soft-delete) a widget by id.")
async def delete_widget(
    widget_id: str = FPath(...),
    svc: WidgetService = Depends(get_widget_service),
) -> Any:
    found = await svc.delete_widget(widget_id)
    if not found:
        raise HTTPException(status_code=404, detail="widget not found")
    return {"ok": True, "archived": widget_id}


# ── Custom widgets ─────────────────────────────────────────────────────────────


class CustomWidgetCodeBody(BaseModel):
    code: str = ""


@router.get(
    "/custom-widgets/{canvas_id}",
    description="Get the JS code for a canvas-deployed custom widget.",
)
async def get_custom_widget(
    canvas_id: str = FPath(...),
    sessionId: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    try:
        return svc.get_custom_widget(canvas_id, sessionId)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="not found") from None


@router.put(
    "/custom-widgets/{canvas_id}",
    description="Write or replace the JS code for a custom widget.",
)
async def put_custom_widget(
    canvas_id: str = FPath(...),
    body: CustomWidgetCodeBody = CustomWidgetCodeBody(),
    sessionId: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    if not canvas_id:
        raise HTTPException(status_code=400, detail="canvasId required")
    return svc.set_custom_widget(canvas_id, sessionId, body.code)


@router.delete(
    "/custom-widgets/{canvas_id}",
    description="Delete the JS file for a custom widget (both session-scoped and global).",
)
async def delete_custom_widget(
    canvas_id: str = FPath(...),
    sessionId: str = Query(""),
    svc: CanvasService = Depends(get_canvas_service),
) -> Any:
    return svc.delete_custom_widget(canvas_id, sessionId)


# ── Widget DB (/api/v1/db/widget/…) ───────────────────────────────────────────


class WidgetSchemaBody(BaseModel):
    columns: list[dict[str, Any]] = []


class WidgetRowBody(BaseModel):
    row: dict[str, Any] | None = None
    rows: list[dict[str, Any]] | None = None


class WidgetUpdateBody(BaseModel):
    data: dict[str, Any]


class WidgetExecBody(BaseModel):
    code: str


@db_router.get(
    "/db/widget/{canvas_id}/schema",
    description="Return the column schema and row count for a widget's data store.",
)
async def widget_schema_get(
    canvas_id: str = FPath(...),
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.get_schema(canvas_id, sessionId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@db_router.post(
    "/db/widget/{canvas_id}/schema",
    description="Ensure columns exist in the widget's schema (adds missing, keeps existing).",
)
async def widget_schema_ensure(
    canvas_id: str,
    body: WidgetSchemaBody,
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.ensure_schema(canvas_id, body.columns, sessionId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@db_router.get(
    "/db/widget/{canvas_id}/rows",
    description="Query rows from a widget's data store with sorting and pagination.",
)
async def widget_query(
    canvas_id: str = FPath(...),
    order: str = Query("id"),
    dir: str = Query("asc"),
    limit: int = Query(1000),
    offset: int = Query(0),
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.query_rows(canvas_id, order, dir, limit, offset, sessionId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@db_router.post(
    "/db/widget/{canvas_id}/rows",
    description="Insert one or more rows into a widget's data store.",
)
async def widget_insert(
    canvas_id: str,
    body: WidgetRowBody,
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.insert_rows(canvas_id, body.row, body.rows, sessionId)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@db_router.put(
    "/db/widget/{canvas_id}/rows/{row_id}",
    description="Update a single row in a widget's data store by id.",
)
async def widget_update(
    canvas_id: str,
    row_id: int,
    body: WidgetUpdateBody,
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.update_row(canvas_id, row_id, body.data, sessionId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@db_router.delete(
    "/db/widget/{canvas_id}/rows/{row_id}",
    description="Delete a single row from a widget's data store by id.",
)
async def widget_delete(
    canvas_id: str,
    row_id: int,
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.delete_row(canvas_id, row_id, sessionId)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@db_router.post(
    "/db/widget/{canvas_id}/exec",
    description="Execute arbitrary Python code with ``records`` in scope against a widget's data store.",
)
async def widget_exec(
    canvas_id: str,
    body: WidgetExecBody,
    sessionId: str = Query(""),
    svc: WidgetDbService = Depends(get_widget_db_service),
) -> Any:
    try:
        return svc.exec_code(canvas_id, body.code, sessionId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
