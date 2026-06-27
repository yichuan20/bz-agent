#!/usr/bin/env python3
"""
BoltzAgent — FastAPI server.

Run (dev):
    uvicorn app:app --host localhost --port 18789 --reload

Run (production with built frontend):
    python app.py --bzcode ./bzcode --dist ./dist

All business logic is imported from server.py.  This file only defines the
FastAPI routes, Pydantic request models, and the WebSocket endpoint.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import (
    APIRouter,
    BackgroundTasks,
    FastAPI,
    HTTPException,
    Path as FPath,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Import all business logic from server.py ──────────────────────────────────
# We deliberately import the module-level globals and helpers; only the
# aiohttp HTTP/WebSocket layer is replaced here.
from server import (
    BACKEND_VERSION,
    BOLTZHUB_API,
    BOLTZHUB_AUTH,
    SESSIONS_DIR,
    SERVER_DATA_DIR,
    _active_cwds,
    _batch_store,
    _boltzhub_token,
    _load_defaults,
    _load_index,
    _load_mode_config,
    _load_titles,
    _now,
    _read_app_config,
    _read_session_file,
    _running_cwds,
    _save_code,
    _save_default,
    _save_index,
    _save_title,
    _clear_default,
    _token_stats,
    _add_tokens,
    _widget_load,
    _widget_save,
    _widget_lock,
    _widget_path,
    _wj,
    _write_session_config,
    _CANVAS_ID_RE,
    _wj,
    _BatchItem,
    _WASess,
    _whatsapp_sessions,
    _whatsapp_lock,
    _bz_headers,
    _write_app_config,
    _load_code,
    _code_path,
    DB_CONFIG,
    # WebSocket helpers
    read_bzcode_stdout,
    send_to_client,
    drain_bzcode_stderr,
    relay_client_messages,
    handle_ws_client,
    _write_bzcode_credentials,
    # Canvas / widget helpers
    WIDGETS_DIR,
    CUSTOM_WIDGETS_DIR,
    _custom_widgets_dir,
    _canvas_file,
    # Document parsing
    _detect_and_parse,
    _blocks_to_docx,
    # Dev-server & cursor
    _cursor_store,
    _dev_servers,
    _find_free_port,
    # _add_frontend kept separate — called after app is built
)

try:
    import asyncpg
except ImportError:
    asyncpg = None  # type: ignore


# ── Pydantic request models ───────────────────────────────────────────────────

class AuthBody(BaseModel):
    accessToken: str
    refreshToken: Optional[str] = None
    expiresAt: Optional[int] = None
    authUrl: str = "https://boltzhub.com"

class ProxyBody(BaseModel):
    url: str
    method: str = "GET"
    headers: Dict[str, str] = {}
    body: Optional[str] = None

class CredentialBody(BaseModel):
    key: str
    value: str

class CanvasBody(BaseModel):
    widgets: Optional[List[Any]] = None

class WidgetBody(BaseModel):
    id: str
    code: Optional[str] = None
    class Config:
        extra = "allow"

class SeedWidgetsBody(BaseModel):
    widgets: Optional[List[Dict[str, Any]]] = None

class SessionTitleBody(BaseModel):
    title: str

class SetDefaultBody(BaseModel):
    cwd: str
    sessionId: str = ""

class SearchBody(BaseModel):
    pass

class MkdirBody(BaseModel):
    parent: str
    name: str

class CreateAppBody(BaseModel):
    cwd: str = ""
    name: str
    description: Optional[str] = None
    visibility: str = "private"
    priceMonthly: Optional[float] = None
    buildCommand: Optional[str] = None

class PushBody(BaseModel):
    cwd: str = ""
    releaseNotes: Optional[str] = None
    versionNumber: str = "1.0.0"

class SyncBody(BaseModel):
    cwd: str = ""
    appId: Optional[str] = None

class CreateVersionBody(BaseModel):
    appId: str
    releaseNotes: str = ""
    versionNumber: str = "1.0.0"

class PublishBody(BaseModel):
    appId: str

class BatchRunBody(BaseModel):
    cwds: List[str]
    message: str
    sessions: Dict[str, str] = {}

class WidgetRowBody(BaseModel):
    row: Optional[Dict[str, Any]] = None
    rows: Optional[List[Dict[str, Any]]] = None

class WidgetUpdateBody(BaseModel):
    data: Dict[str, Any]

class WidgetExecBody(BaseModel):
    code: str

class WriteFileBody(BaseModel):
    path: str
    content: str

class WhatsAppStatus(BaseModel):
    pass

class FileRenameBody(BaseModel):
    path: str
    newName: str

class FileDuplicateBody(BaseModel):
    path: str

class WriteFileBody2(BaseModel):
    path: str
    content: str = ""

class CursorBody(BaseModel):
    path: str
    selStart: int = 0
    selEnd: int = 0

class DocPathBody(BaseModel):
    path: str

class DocSaveBody(BaseModel):
    path: str
    blocks: list

class ExcelSaveBody(BaseModel):
    path: str
    sheets: list = []

class PptSaveBody(BaseModel):
    path: str
    slides: list = []

class DeployWidgetBody(BaseModel):
    sessionId: str = ""
    cwd: str = ""
    title: str = "Widget"
    code: str = ""
    w: int = 380
    h: int = 280
    x: Optional[int] = None
    y: Optional[int] = None
    initialData: list = []

class CustomWidgetCodeBody(BaseModel):
    code: str = ""

class LogoutBody(BaseModel):
    authUrl: str = "https://boltzhub.com"

class DevServerBody(BaseModel):
    cwd: str = ""

class BzHubSyncBody(BaseModel):
    cwd: str = ""
    appId: str = ""

class BzHubVersionBody(BaseModel):
    appId: str
    releaseNotes: str = ""
    versionNumber: str = "1.0.0"

class BzHubPublishBody(BaseModel):
    appId: str

# ── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    if asyncpg is not None:
        try:
            pool = await asyncpg.create_pool(**DB_CONFIG, min_size=2, max_size=10)
            app.state.db = pool
            print(
                f"[db] connected  host={DB_CONFIG['host']}:{DB_CONFIG['port']}"
                f"  db={DB_CONFIG['database']}",
                file=sys.stderr,
            )
        except Exception as exc:
            app.state.db = None
            print(f"[db] connection failed (server continues without DB): {exc}",
                  file=sys.stderr)
    else:
        app.state.db = None
        print("[db] asyncpg not installed — Postgres disabled", file=sys.stderr)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    if getattr(app.state, "db", None) is not None:
        await app.state.db.close()
        print("[db] pool closed", file=sys.stderr)


# ── App factory ───────────────────────────────────────────────────────────────

def create_app(bzcode_path: str = "", default_cwd: str = "",
               port: int = 18789) -> FastAPI:

    app = FastAPI(
        title="BoltzAgent API",
        version="1.0.0",
        description="bzcode bridge + widget canvas + session management",
        lifespan=lifespan,
    )

    # Store config accessible to route handlers
    app.state.bzcode_path = bzcode_path
    app.state.default_cwd = default_cwd
    app.state.port        = port

    # CORS — allow all origins (local-first tool)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers (one per domain — tags drive OpenAPI grouping) ────────────────
    ws_router        = APIRouter(tags=["WebSocket"])
    auth_router      = APIRouter(tags=["Auth"])
    files_router     = APIRouter(tags=["Files"])
    sessions_router  = APIRouter(tags=["Sessions"])
    canvas_router    = APIRouter(tags=["Canvas & Widgets"])
    db_router        = APIRouter(prefix="/db",        tags=["Database"])
    boltzhub_router  = APIRouter(prefix="/boltzhub",  tags=["BoltzHub"])
    batch_router     = APIRouter(tags=["Batch"])
    whatsapp_router  = APIRouter(prefix="/whatsapp",  tags=["WhatsApp"])
    misc_router      = APIRouter(tags=["Misc"])

    # ── § 1 · WebSocket bridge ────────────────────────────────────────────────

    @ws_router.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket,
                          cwd: str = Query(""),
                          sessionId: str = Query(""),
                          mode: str = Query("")):
        """bzcode stdio bridge — one WebSocket per agent session."""
        # Build a fake aiohttp-style request shim so handle_ws_client can reuse
        # the existing query-param parsing (it now reads from request.rel_url.query).
        class _QueryShim:
            def get(self, key, default=""):
                m = {"cwd": cwd, "sessionId": sessionId, "mode": mode}
                return m.get(key, default)

        class _RequestShim:
            rel_url = type("u", (), {"query": _QueryShim()})()

        # FastAPI already accepted the WebSocket — we need a wrapper that presents
        # the same interface as aiohttp's WebSocketResponse.
        class _WsShim:
            """Thin shim: FastAPI WebSocket → aiohttp WebSocketResponse-like API."""
            async def send_str(self, text: str):
                await websocket.send_text(text)

            def __aiter__(self):
                return self

            async def __anext__(self):
                import aiohttp
                try:
                    text = await websocket.receive_text()
                    # Return a mock aiohttp WSMessage
                    return type("M", (), {
                        "type": aiohttp.WSMsgType.TEXT,
                        "data": text,
                    })()
                except WebSocketDisconnect:
                    return type("M", (), {
                        "type": aiohttp.WSMsgType.CLOSE,
                        "data": "",
                    })()

        await websocket.accept()

        _bzcode = app.state.bzcode_path
        _cwd    = app.state.default_cwd

        # Resolve cwd / sessionId / mode from query params
        effective_cwd = cwd if (cwd and os.path.isdir(cwd)) else _cwd
        req_mode = mode or _load_mode_config().get("default", "general")

        # Validate / generate session ID
        req_session_id = sessionId or None
        if req_session_id:
            if not (SESSIONS_DIR / f"{req_session_id}.jsonl").exists():
                print(f"[ws] session file not found for {req_session_id!r} — starting fresh",
                      file=sys.stderr)
                req_session_id = None

        if not req_session_id:
            import secrets as _sec
            req_session_id = f"bz-{_sec.token_hex(6)}"
            print(f"[ws] generated new sessionId={req_session_id}", file=sys.stderr)

        _write_session_config(req_session_id, req_mode, working_dir=effective_cwd)
        cmd = [_bzcode, "--stdio", "--resume", req_session_id]

        # ── Pre-flight checks before spawning ────────────────────────────────
        if not os.path.isfile(_bzcode):
            await websocket.send_text(json.dumps({
                "type": "result", "status": "error",
                "error": f"bzcode binary not found at: {_bzcode}",
            }))
            print(f"[ws] bzcode not found: {_bzcode}", file=sys.stderr)
            return

        if not os.access(_bzcode, os.X_OK):
            # Auto-fix: mark the binary executable so the next spawn works
            try:
                os.chmod(_bzcode, 0o755)
                print(f"[ws] chmod +x {_bzcode} (was not executable)", file=sys.stderr)
            except OSError as e:
                await websocket.send_text(json.dumps({
                    "type": "result", "status": "error",
                    "error": f"bzcode is not executable: {_bzcode} — run: chmod +x {_bzcode}",
                }))
                print(f"[ws] cannot chmod bzcode: {e}", file=sys.stderr)
                return

        print(f"[ws] connect  cwd={effective_cwd}  sessionId={req_session_id}  mode={req_mode}",
              file=sys.stderr)
        _active_cwds.add(effective_cwd)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=effective_cwd,
                env={**os.environ, "BZ_PYTHON": sys.executable},
            )
        except (FileNotFoundError, PermissionError) as exc:
            _active_cwds.discard(effective_cwd)
            await websocket.send_text(json.dumps({
                "type": "result", "status": "error",
                "error": f"Failed to start bzcode ({type(exc).__name__}): {exc}",
            }))
            return

        ws_shim     = _WsShim()
        out_queue   = asyncio.Queue()
        ready_event = asyncio.Event()

        try:
            await asyncio.gather(
                read_bzcode_stdout(proc, out_queue, ready_event,
                                   cwd=effective_cwd, mode=req_mode),
                send_to_client(out_queue, ws_shim),
                drain_bzcode_stderr(proc),
                relay_client_messages(proc, ws_shim, ready_event),
            )
        except (BrokenPipeError, ConnectionResetError, asyncio.CancelledError, WebSocketDisconnect):
            pass
        finally:
            _active_cwds.discard(effective_cwd)
            print(f"[ws] disconnect  pid={proc.pid}", file=sys.stderr)
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except (ProcessLookupError, asyncio.TimeoutError):
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass

    # ── § 2 · Auth & Credentials ─────────────────────────────────────────────

    @auth_router.post("/auth")
    async def auth(body: AuthBody):
        _write_bzcode_credentials(
            access_token=body.accessToken,
            refresh_token=body.refreshToken or "",
            expires_at=body.expiresAt,
            auth_url=body.authUrl,
        )
        return {"ok": True}

    # ── § 10 · Misc (version + home live here; rest follows below) ───────────

    @misc_router.get("/api/version")
    async def api_version():
        return {"backend": BACKEND_VERSION}

    @misc_router.get("/api/home")
    async def api_home():
        home = str(Path.home())
        default_cwd = os.getcwd()
        return {
            "home": home,
            "defaultCwd": default_cwd if os.path.isdir(default_cwd) else home,
        }

    # ── Proxy (misc) ──────────────────────────────────────────────────────────

    @misc_router.post("/proxy")
    async def proxy(body: ProxyBody):
        import aiohttp, re as _re
        creds_file = SERVER_DATA_DIR / "credentials.json"
        creds: dict = {}
        if creds_file.exists():
            try:
                creds = json.loads(creds_file.read_text())
            except Exception:
                pass
        _ph = re.compile(r'\{\{(\w+)\}\}')
        def _resolve(text):
            return _ph.sub(lambda m: creds.get(m.group(1), m.group(0)), text)
        resolved_headers = {k: _resolve(str(v)) for k, v in body.headers.items()}
        resolved_body    = _resolve(body.body) if isinstance(body.body, str) else body.body
        if not body.url.startswith("http"):
            raise HTTPException(400, "url must start with http")
        try:
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.request(
                    body.method, body.url,
                    headers=resolved_headers, data=resolved_body,
                    allow_redirects=True,
                ) as resp:
                    content = await resp.read()
                    return JSONResponse(
                        content=json.loads(content) if resp.content_type == "application/json" else content.decode(errors="replace"),
                        status_code=resp.status,
                    )
        except Exception as exc:
            raise HTTPException(502, str(exc))

    # ── Credentials ───────────────────────────────────────────────────────────

    @auth_router.get("/credentials")
    async def get_credential_keys():
        f = SERVER_DATA_DIR / "credentials.json"
        if not f.exists():
            return {"keys": []}
        try:
            return {"keys": list(json.loads(f.read_text()).keys())}
        except Exception:
            return {"keys": []}

    @auth_router.post("/credentials")
    async def post_credential(body: CredentialBody):
        SERVER_DATA_DIR.mkdir(parents=True, exist_ok=True)
        f = SERVER_DATA_DIR / "credentials.json"
        data = json.loads(f.read_text()) if f.exists() else {}
        data[body.key] = body.value
        f.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        return {"ok": True, "key": body.key}

    @auth_router.delete("/credentials/{key}")
    async def delete_credential(key: str):
        f = SERVER_DATA_DIR / "credentials.json"
        if not f.exists():
            raise HTTPException(404, "not found")
        data = json.loads(f.read_text())
        if key not in data:
            raise HTTPException(404, "not found")
        del data[key]
        f.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        return {"ok": True, "deleted": key}

    @auth_router.post("/auth/logout")
    async def logout(body: LogoutBody):
        creds_file = Path.home() / ".boltzbit" / "credentials.json"
        try:
            if creds_file.exists():
                existing = json.loads(creds_file.read_text())
                existing.pop(body.authUrl, None)
                creds_file.write_text(json.dumps(existing, indent=2))
        except Exception as exc:
            print(f"[auth] logout error: {exc}", file=sys.stderr)
        return {"ok": True}

    # ── § 3 · File System ─────────────────────────────────────────────────────

    @files_router.get("/shell")
    async def shell(cmd: str = Query(""), cwd: str = Query("")):
        if not cmd:
            raise HTTPException(400, "cmd is required")
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=cwd if os.path.isdir(cwd) else os.getcwd(),
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            return {"output": stdout.decode(errors="replace"), "returncode": proc.returncode}
        except asyncio.TimeoutError:
            raise HTTPException(408, "Command timed out (30 s)")
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @files_router.get("/files")
    async def list_files(path: str = Query("")):
        if not path:
            path = os.getcwd()
        p = Path(path)
        if not p.exists() or not p.is_dir():
            raise HTTPException(404, "path not found or not a directory")
        entries = []
        for entry in sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            try:
                stat = entry.stat()
                entries.append({"name": entry.name, "path": str(entry),
                                 "isDir": entry.is_dir(), "size": stat.st_size,
                                 "modified": stat.st_mtime})
            except (PermissionError, OSError):
                pass
        return {"path": str(p), "entries": entries}

    @files_router.post("/files/mkdir")
    async def mkdir(body: MkdirBody):
        name = body.name.strip()
        if not body.parent or not name:
            raise HTTPException(400, "parent and name required")
        if "/" in name or "\\" in name or name in (".", ".."):
            raise HTTPException(400, "invalid folder name")
        new_dir = Path(body.parent) / name
        parent_path = Path(body.parent)
        if not parent_path.exists() or not parent_path.is_dir():
            raise HTTPException(400, f"parent directory not found: {body.parent}")
        if not os.access(parent_path, os.W_OK):
            raise HTTPException(403, f"no write permission on {body.parent}")
        try:
            new_dir.mkdir(parents=False, exist_ok=False)
            return {"path": str(new_dir)}
        except FileExistsError:
            raise HTTPException(409, "folder already exists")
        except PermissionError as exc:
            raise HTTPException(403, str(exc))
        except OSError as exc:
            raise HTTPException(500, str(exc))

    # ── § 5 · Canvas & Widgets ───────────────────────────────────────────────

    @canvas_router.get("/canvas")
    async def get_canvas(cwd: str = Query(""), sessionId: str = Query("")):
        f = _canvas_file(sessionId, cwd)
        if not f.exists():
            return {"widgets": []}
        return json.loads(f.read_text())

    @canvas_router.post("/canvas")
    async def post_canvas(request: Request, cwd: str = Query(""), sessionId: str = Query("")):
        body = await request.json()
        f = _canvas_file(sessionId, cwd)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(body, indent=2, ensure_ascii=False))
        return {"ok": True, "file": str(f)}

    # ── Widgets ───────────────────────────────────────────────────────────────

    @canvas_router.get("/widgets")
    async def get_widgets():
        data = _load_index()
        return {"widgets": [
            {**e, "code": _load_code(e["id"])}
            for e in data.get("widgets", []) if not e.get("archived", False)
        ]}

    @canvas_router.get("/widgets/template")
    async def get_widget_template(name: str = Query(...)):
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
        p = WIDGETS_DIR / f"{safe}.js"
        if not p.exists():
            raise HTTPException(404, f"template not found: {name}")
        from fastapi.responses import Response as _Resp
        return _Resp(content=p.read_text(encoding="utf-8"), media_type="application/javascript")

    @canvas_router.get("/widgets/{widget_id}")
    async def get_widget(widget_id: str = FPath(...)):
        data = _load_index()
        entry = next((w for w in data.get("widgets", []) if w.get("id") == widget_id), None)
        if entry is None:
            raise HTTPException(404, "widget not found")
        return {**entry, "code": _load_code(widget_id)}

    @canvas_router.post("/widgets")
    async def post_widget(request: Request):
        body = await request.json()
        widget_id = body.get("id", "").strip()
        if not widget_id:
            raise HTTPException(400, "'id' is required")
        code = body.pop("code", None)
        data = _load_index()
        widgets = data.get("widgets", [])
        now = _now()
        idx = next((i for i, w in enumerate(widgets) if w.get("id") == widget_id), None)
        if idx is not None:
            entry = {**widgets[idx], **body, "updatedAt": now}
            entry.setdefault("createdAt", now)
            widgets[idx] = entry
        else:
            entry = {**body, "archived": False, "createdAt": now, "updatedAt": now}
            widgets.append(entry)
        data["widgets"] = widgets
        _save_index(data)
        if code is not None:
            _save_code(widget_id, code)
        return {**entry, "code": _load_code(widget_id)}

    @canvas_router.post("/widgets/seed")
    async def seed_widgets(request: Request):
        body = await request.json()
        incoming = body if isinstance(body, list) else (body.get("widgets") or [])
        data = _load_index()
        widgets = data.get("widgets", [])
        existing_ids = {w["id"] for w in widgets}
        now = _now()
        seeded = 0
        for w in incoming:
            wid = w.get("id", "")
            if not wid:
                continue
            code = w.pop("code", "")
            if wid in existing_ids:
                idx = next(i for i, x in enumerate(widgets) if x["id"] == wid)
                if not widgets[idx].get("isBuiltin", False):
                    continue
                widgets[idx] = {**widgets[idx], **w, "updatedAt": now}
                _save_code(wid, code)
                seeded += 1
            else:
                entry = {**w, "id": wid, "isBuiltin": True, "archived": False,
                         "createdAt": now, "updatedAt": now}
                widgets.append(entry)
                existing_ids.add(wid)
                _save_code(wid, code)
                seeded += 1
        data["widgets"] = widgets
        _save_index(data)
        print(f"[widgets] seeded {seeded} built-in widget(s)", file=sys.stderr)
        return {"seeded": seeded}

    @canvas_router.delete("/widgets/{widget_id}")
    async def delete_widget(widget_id: str = FPath(...)):
        data = _load_index()
        widgets = data.get("widgets", [])
        found = False
        for w in widgets:
            if w.get("id") == widget_id:
                w["archived"] = True
                w["updatedAt"] = _now()
                found = True
                break
        if not found:
            raise HTTPException(404, "widget not found")
        data["widgets"] = widgets
        _save_index(data)
        return {"ok": True, "archived": widget_id}

    @canvas_router.post("/canvas/deploy-widget")
    async def deploy_widget(body: DeployWidgetBody):
        import secrets as _sec, datetime as _dt
        if not body.sessionId and (not body.cwd or not os.path.isdir(body.cwd)):
            raise HTTPException(400, "sessionId or valid cwd required")
        if not body.code:
            raise HTTPException(400, "code is required")
        canvas_id = _sec.token_hex(5)
        widget_code_dir = _custom_widgets_dir(body.sessionId)
        widget_code_dir.mkdir(parents=True, exist_ok=True)
        (widget_code_dir / f"{canvas_id}.js").write_text(body.code, encoding="utf-8")
        if body.initialData:
            widget_data_dir = (SESSIONS_DIR / body.sessionId / "widget_data") if body.sessionId else (SERVER_DATA_DIR / "widget_data")
            widget_data_dir.mkdir(parents=True, exist_ok=True)
            records, next_id = [], 1
            for row in body.initialData:
                row = {k: v for k, v in row.items() if k not in ("id", "created_at")}
                row["id"] = next_id
                row["created_at"] = _dt.datetime.utcnow().isoformat() + "Z"
                records.append(row)
                next_id += 1
            (widget_data_dir / f"{canvas_id}.json").write_text(
                json.dumps({"_next_id": next_id, "records": records}, indent=2), encoding="utf-8")
        canvas_file = _canvas_file(body.sessionId, body.cwd)
        canvas_data: dict = {"version": 1, "widgets": []}
        if canvas_file.exists():
            try:
                canvas_data = json.loads(canvas_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        existing = canvas_data.get("widgets", [])
        pad = 24
        x = body.x if body.x is not None else (pad if not existing else pad)
        y = body.y if body.y is not None else (pad if not existing else max((e.get("y", 0) + e.get("h", 0)) for e in existing) + pad)
        new_entry = {"canvasId": canvas_id, "widgetId": canvas_id, "kind": "custom",
                     "title": body.title, "x": x, "y": y, "w": body.w, "h": body.h}
        existing.append(new_entry)
        canvas_data["widgets"] = existing
        canvas_file.write_text(json.dumps(canvas_data, indent=2, ensure_ascii=False), encoding="utf-8")
        return {"ok": True, "canvasId": canvas_id, "widgetId": canvas_id,
                "title": body.title, "x": x, "y": y, "w": body.w, "h": body.h,
                "canvasFile": str(canvas_file)}

    @canvas_router.get("/custom-widgets/{canvas_id}")
    async def get_custom_widget(canvas_id: str = FPath(...), sessionId: str = Query("")):
        cwd_dir = _custom_widgets_dir(sessionId)
        p = cwd_dir / f"{canvas_id}.js"
        if not p.exists() and sessionId:
            p = CUSTOM_WIDGETS_DIR / f"{canvas_id}.js"
        if not p.exists():
            raise HTTPException(404, "not found")
        return {"canvasId": canvas_id, "code": p.read_text(encoding="utf-8")}

    @canvas_router.put("/custom-widgets/{canvas_id}")
    async def put_custom_widget(canvas_id: str = FPath(...), body: CustomWidgetCodeBody = CustomWidgetCodeBody(), sessionId: str = Query("")):
        if not canvas_id:
            raise HTTPException(400, "canvasId required")
        dest = _custom_widgets_dir(sessionId)
        dest.mkdir(parents=True, exist_ok=True)
        (dest / f"{canvas_id}.js").write_text(body.code, encoding="utf-8")
        return {"ok": True, "canvasId": canvas_id}

    @canvas_router.delete("/custom-widgets/{canvas_id}")
    async def delete_custom_widget(canvas_id: str = FPath(...), sessionId: str = Query("")):
        for d in [_custom_widgets_dir(sessionId), CUSTOM_WIDGETS_DIR]:
            p = d / f"{canvas_id}.js"
            if p.exists():
                p.unlink()
        return {"ok": True}

    # ── § 4 · Sessions ────────────────────────────────────────────────────────

    @sessions_router.get("/sessions")
    async def get_sessions(cwd: str = Query("")):
        if not SESSIONS_DIR.exists():
            return {"sessions": []}
        if cwd:
            sessions = [m for p in SESSIONS_DIR.glob("*.jsonl")
                        if (m := _read_session_file(p)) and m["workingDir"] == cwd]
            sessions.sort(key=lambda s: s["lastModified"], reverse=True)
        else:
            by_dir: dict = {}
            for p in SESSIONS_DIR.glob("*.jsonl"):
                m = _read_session_file(p)
                if m is None:
                    continue
                wd = m["workingDir"]
                if wd not in by_dir or m["lastModified"] > by_dir[wd]["lastModified"]:
                    by_dir[wd] = m
            sessions = sorted(by_dir.values(), key=lambda s: s["lastModified"], reverse=True)
        defaults = _load_defaults()
        for s in sessions:
            wd = s["workingDir"]
            s["isActive"]         = wd in _active_cwds
            s["isRunning"]        = wd in _running_cwds
            s["isDefault"]        = defaults.get(wd) == s["sessionId"]
            s["defaultSessionId"] = defaults.get(wd)
        return {"sessions": sessions}

    @sessions_router.post("/session-default")
    async def set_default_session(body: SetDefaultBody):
        if not body.cwd:
            raise HTTPException(400, "cwd required")
        if body.sessionId:
            _save_default(body.cwd, body.sessionId)
        else:
            _clear_default(body.cwd)
        return {"ok": True}

    @sessions_router.delete("/sessions/{session_id}")
    async def delete_session(session_id: str = FPath(...)):
        if "/" in session_id or ".." in session_id:
            raise HTTPException(400, "invalid sessionId")
        p = SESSIONS_DIR / f"{session_id}.jsonl"
        if not p.exists():
            raise HTTPException(404, "not found")
        p.unlink()
        return {"ok": True}

    @sessions_router.post("/sessions/{session_id}/title")
    async def update_session_title(session_id: str, body: SessionTitleBody):
        if "/" in session_id or ".." in session_id:
            raise HTTPException(400, "invalid sessionId")
        _save_title(session_id, body.title[:100])
        return {"ok": True}

    # ── Search / token-stats / agent-modes / settings (misc) ─────────────────

    @misc_router.get("/search")
    async def search(q: str = Query(""), key: str = Query(""), num: int = Query(10)):
        if not q:
            raise HTTPException(400, "q is required")
        if not key:
            raise HTTPException(400, "key is required")
        import aiohttp as _aio
        params = {"engine": "google", "q": q, "api_key": key, "num": num, "hl": "en", "gl": "us"}
        try:
            async with _aio.ClientSession() as session:
                async with session.get("https://serpapi.com/search.json", params=params) as resp:
                    body = await resp.json(content_type=None)
                    if not resp.ok:
                        raise HTTPException(resp.status, body.get("error", "SerpAPI error"))
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(502, str(exc))
        organic = body.get("organic_results", [])
        results = [{"title": r.get("title",""), "link": r.get("link",""),
                    "displayLink": r.get("displayed_link", r.get("link","")),
                    "snippet": r.get("snippet",""), "favicon": r.get("favicon",""),
                    "position": r.get("position", i+1)} for i, r in enumerate(organic)]
        return {"results": results, "meta": body.get("search_information", {})}

    # ── Token stats / agent modes ─────────────────────────────────────────────

    @misc_router.get("/token-stats")
    async def token_stats():
        return _token_stats

    @misc_router.get("/agent-modes")
    async def agent_modes():
        return _load_mode_config()

    # ── File read / write ─────────────────────────────────────────────────────

    @files_router.get("/api/file")
    async def read_file(path: str = Query("")):
        if not path:
            raise HTTPException(400, "path required")
        p = Path(path)
        if not p.exists() or not p.is_file():
            raise HTTPException(404, "file not found")
        return {"path": str(p), "content": p.read_text(errors="replace")}

    @files_router.put("/api/file")
    async def write_file(body: WriteFileBody):
        p = Path(body.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.content, encoding="utf-8")
        return {"ok": True, "path": str(p)}

    @files_router.post("/api/file/rename")
    async def file_rename(body: FileRenameBody):
        p = Path(body.path)
        if not p.exists():
            raise HTTPException(404, "path not found")
        dest = p.parent / body.newName
        if dest.exists():
            raise HTTPException(409, "destination already exists")
        try:
            p.rename(dest)
            return {"ok": True, "path": str(dest)}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @files_router.post("/api/file/duplicate")
    async def file_duplicate(body: FileDuplicateBody):
        import shutil as _sh
        p = Path(body.path)
        if not p.exists():
            raise HTTPException(404, "path not found")
        if p.is_dir():
            raise HTTPException(400, "directory duplication not supported")
        stem, suffix = p.stem, p.suffix
        dest = p.parent / f"{stem} copy{suffix}"
        n = 2
        while dest.exists():
            dest = p.parent / f"{stem} copy {n}{suffix}"
            n += 1
        try:
            _sh.copy2(str(p), str(dest))
            return {"ok": True, "path": str(dest)}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @files_router.get("/api/file/download")
    async def file_download(path: str = Query(...)):
        import mimetypes as _mt
        p = Path(path)
        if not p.exists() or p.is_dir():
            raise HTTPException(404, "file not found")
        mime, _ = _mt.guess_type(str(p))
        mime = mime or "application/octet-stream"
        from fastapi.responses import Response as _Resp
        return _Resp(
            content=p.read_bytes(),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{p.name}"'},
        )

    @files_router.get("/api/doc/cursor")
    async def get_cursor(path: str = Query(...)):
        if not path:
            raise HTTPException(400, "path required")
        return _cursor_store.get(path, {"selStart": 0, "selEnd": 0})

    @files_router.put("/api/doc/cursor")
    async def put_cursor(body: CursorBody):
        _cursor_store[body.path] = {"selStart": body.selStart, "selEnd": body.selEnd}
        return {"ok": True}

    # ── Settings ──────────────────────────────────────────────────────────────

    @misc_router.get("/settings/resources")
    async def settings_resources():
        import shutil as _sh
        session_count = session_bytes = 0
        if SESSIONS_DIR.exists():
            for f in SESSIONS_DIR.glob("*.jsonl"):
                try:
                    session_bytes += f.stat().st_size
                    session_count += 1
                except Exception:
                    pass
        server_data_bytes = 0
        if SERVER_DATA_DIR.exists():
            for f in SERVER_DATA_DIR.rglob("*"):
                try:
                    if f.is_file():
                        server_data_bytes += f.stat().st_size
                except Exception:
                    pass
        try:
            disk = _sh.disk_usage(Path.home())
            disk_info = {"total": disk.total, "used": disk.used, "free": disk.free}
        except Exception:
            disk_info = {"total": 0, "used": 0, "free": 0}
        return {"sessions": {"count": session_count, "bytes": session_bytes},
                "serverData": {"bytes": server_data_bytes}, "disk": disk_info}

    @misc_router.delete("/settings/sessions/clear")
    async def clear_sessions(olderThanDays: int = Query(30)):
        import time as _t
        cutoff = _t.time() - max(1, olderThanDays) * 86_400
        deleted = 0
        if SESSIONS_DIR.exists():
            for f in SESSIONS_DIR.glob("*.jsonl"):
                try:
                    if f.stat().st_mtime < cutoff:
                        f.unlink()
                        deleted += 1
                except Exception:
                    pass
        return {"deleted": deleted}

    # ── Document / Office ─────────────────────────────────────────────────────

    @misc_router.post("/api/doc/parse")
    async def doc_parse(request: Request):
        from fastapi import UploadFile
        ct = request.headers.get("content-type", "")
        _MAX_DOC_BYTES = 50 * 1024 * 1024
        try:
            if "multipart" in ct:
                form = await request.form()
                upload = form.get("file")
                if upload is None:
                    raise HTTPException(400, "expected field 'file'")
                filename = getattr(upload, "filename", None) or "upload"
                data = await upload.read()
            else:
                body = await request.json()
                path_str = str(body.get("path", "")).strip()
                if not path_str:
                    raise HTTPException(400, "path required")
                p = Path(path_str)
                if not p.exists():
                    raise HTTPException(404, "file not found")
                if p.stat().st_size > _MAX_DOC_BYTES:
                    raise HTTPException(413, "file too large (max 50 MB)")
                data = p.read_bytes()
                filename = p.name
            return _detect_and_parse(filename, data)
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception as exc:
            raise HTTPException(422, f"could not parse: {exc}")

    @misc_router.put("/api/doc/save")
    async def doc_save(body: DocSaveBody):
        p = Path(body.path)
        if p.suffix.lower() not in (".docx", ".doc"):
            raise HTTPException(400, "only DOCX files can be saved")
        try:
            docx_bytes = _blocks_to_docx(body.blocks)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(docx_bytes)
            word_count = sum(len(b.get("text", "").split()) for b in body.blocks)
            return {"ok": True, "path": str(p), "wordCount": word_count}
        except Exception as exc:
            raise HTTPException(500, f"could not save: {exc}")

    @misc_router.get("/api/excel/load")
    async def excel_load(path: str = Query(...)):
        p = Path(path)
        if not p.exists():
            raise HTTPException(404, "file not found")
        try:
            import openpyxl
            from server import _eval_excel_formula
            wb_vals  = openpyxl.load_workbook(p, data_only=True)
            wb_forms = openpyxl.load_workbook(p, data_only=False)
            formula_map: dict = {}
            for ws_f in wb_forms.worksheets:
                for row in ws_f.iter_rows():
                    for cell in row:
                        if isinstance(cell.value, str) and cell.value.startswith("="):
                            formula_map[(ws_f.title, cell.coordinate)] = cell.value
            sheets = []
            for ws in wb_vals.worksheets:
                cells: dict = {}
                col_widths: dict = {}
                row_heights: dict = {}
                for row in ws.iter_rows():
                    for cell in row:
                        if cell.value is None and (ws_f := wb_forms[ws.title]) and wb_forms[ws.title][cell.coordinate].value is None:
                            continue
                        cell_id = cell.coordinate
                        formula = formula_map.get((ws.title, cell_id))
                        raw_val = cell.value
                        if formula:
                            ev = _eval_excel_formula(formula, cells)
                            display_val = ev if ev is not None else raw_val
                        else:
                            display_val = raw_val
                        cd: dict = {}
                        if display_val is not None:
                            cd["value"] = str(display_val) if not isinstance(display_val, (int, float, bool)) else display_val
                        if formula:
                            cd["formula"] = formula
                        try:
                            f = cell.font
                            if f.bold:   cd["fontBold"] = True
                            if f.italic: cd["fontItalic"] = True
                            if f.name:   cd["fontFamily"] = f.name
                            if f.size:   cd["fontSize"] = int(f.size * 20)
                            if f.color and f.color.type == "rgb" and f.color.rgb:
                                rgb = f.color.rgb
                                if rgb not in ("FF000000", "00000000"):
                                    cd["color"] = f"#{rgb[2:]}"
                        except Exception:
                            pass
                        try:
                            fill = cell.fill
                            if fill and fill.fill_type == "solid" and fill.fgColor and fill.fgColor.type == "rgb":
                                rgb = fill.fgColor.rgb
                                if rgb not in ("FF000000", "00000000", "FFFFFFFF"):
                                    cd["bgColor"] = f"#{rgb[2:]}"
                        except Exception:
                            pass
                        if cd:
                            cells[cell_id] = cd
                for col_letter, dim in (ws.column_dimensions or {}).items():
                    if dim.width:
                        idx = openpyxl.utils.column_index_from_string(col_letter) - 1
                        col_widths[str(idx)] = max(30, int(dim.width * 7.5))
                for row_idx, dim in (ws.row_dimensions or {}).items():
                    if dim.height:
                        row_heights[str(row_idx - 1)] = max(16, int(dim.height * 1.2))
                sheets.append({"sheetName": ws.title, "cells": cells, "images": [],
                               "columnIndexToWidth": col_widths, "rowIndexToHeight": row_heights,
                               "hiddenColIndices": [], "hiddenRowIndices": [], "mergedCellIndices": []})
            return {"id": p.stem, "name": p.stem, "sheets": sheets, "sources": []}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @misc_router.put("/api/excel/save")
    async def excel_save(body: ExcelSaveBody):
        if not body.path:
            raise HTTPException(400, "path required")
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill
            wb = openpyxl.Workbook()
            wb.remove(wb.active)
            for sheet in body.sheets:
                ws = wb.create_sheet(title=sheet.get("sheetName", "Sheet"))
                for cell_id, cd in sheet.get("cells", {}).items():
                    try:
                        cell = ws[cell_id]
                        formula = cd.get("formula")
                        v = cd.get("value")
                        if formula and isinstance(formula, str) and formula.startswith("="):
                            cell.value = formula
                        elif v is not None:
                            try:
                                cell.value = float(v) if isinstance(v, str) and v.replace(".", "", 1).lstrip("-").isdigit() else v
                            except Exception:
                                cell.value = v
                        font_kw = {}
                        if cd.get("fontBold"):   font_kw["bold"] = True
                        if cd.get("fontItalic"): font_kw["italic"] = True
                        if cd.get("fontFamily"): font_kw["name"] = cd["fontFamily"]
                        if cd.get("fontSize"):   font_kw["size"] = cd["fontSize"] / 20
                        if font_kw: cell.font = Font(**font_kw)
                    except Exception:
                        pass
            p = Path(body.path)
            p.parent.mkdir(parents=True, exist_ok=True)
            wb.save(p)
            return {"ok": True, "path": str(p)}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @misc_router.get("/api/ppt/load")
    async def ppt_load(path: str = Query(...)):
        p = Path(path)
        if not p.exists():
            raise HTTPException(404, "file not found")
        try:
            from pptx import Presentation
            from pptx.util import Pt
            import base64, io
            prs = Presentation(str(p))
            sw = prs.slide_width
            sh = prs.slide_height
            CW, CH = 896, 504
            sx = CW / sw if sw else 1
            sy = CH / sh if sh else 1
            slides_out = []
            for slide in prs.slides:
                bg_color = "#ffffff"
                try:
                    bg = slide.background.fill
                    if bg.type is not None:
                        c = bg.fore_color.rgb
                        bg_color = f"#{c.r:02x}{c.g:02x}{c.b:02x}"
                except Exception:
                    pass
                boxes = []
                for shape in slide.shapes:
                    try:
                        if not shape.has_text_frame:
                            continue
                        import secrets as _sec2
                        box_id = _sec2.token_hex(4)
                        x = int(shape.left * sx) if shape.left else 0
                        y = int(shape.top * sy) if shape.top else 0
                        w = int(shape.width * sx) if shape.width else 100
                        h = int(shape.height * sy) if shape.height else 50
                        full_text = shape.text_frame.text
                        styles = []
                        box_style: dict = {}
                        try:
                            first_run = shape.text_frame.paragraphs[0].runs[0] if shape.text_frame.paragraphs[0].runs else None
                            if first_run:
                                if first_run.font.size: box_style["fontSize"] = int(first_run.font.size / 12700)
                                if first_run.font.bold: box_style["fontWeight"] = "bold"
                                try:
                                    c = first_run.font.color.rgb
                                    box_style["color"] = f"#{c.r:02x}{c.g:02x}{c.b:02x}"
                                except Exception:
                                    pass
                        except Exception:
                            pass
                        boxes.append({"id": box_id, "x": x, "y": y, "w": w, "h": h,
                                      "text": full_text, "styles": styles, "boxStyle": box_style})
                    except Exception:
                        pass
                slides_out.append({"bgColor": bg_color, "boxes": boxes})
            return {"slides": slides_out}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @misc_router.put("/api/ppt/save")
    async def ppt_save(body: PptSaveBody):
        if not body.path:
            raise HTTPException(400, "path required")
        try:
            from pptx import Presentation
            from pptx.util import Emu, Pt
            from pptx.dml.color import RGBColor
            import re as _re

            CW, CH = 896, 504
            p = Path(body.path)

            def hex_to_rgb(hex_str: str):
                h = hex_str.lstrip("#")
                if len(h) == 6:
                    try:
                        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
                    except Exception:
                        pass
                return None

            if p.exists():
                prs = Presentation(str(p))
                sw, sh = prs.slide_width, prs.slide_height
            else:
                prs = Presentation()
                sw = prs.slide_width or Emu(9144000)
                sh = prs.slide_height or Emu(5143500)
            sx = sw / CW if CW else 1
            sy = sh / CH if CH else 1
            for slide_obj in list(prs.slides._sldIdLst):
                prs.slides._sldIdLst.remove(slide_obj)
            blank_layout = prs.slide_layouts[6]
            for slide_data in body.slides:
                slide = prs.slides.add_slide(blank_layout)
                bg_hex = slide_data.get("bgColor", "#ffffff")
                try:
                    bg = slide.background.fill
                    bg.solid()
                    rgb = hex_to_rgb(bg_hex)
                    if rgb:
                        bg.fore_color.rgb = rgb
                except Exception:
                    pass
                for box in slide_data.get("boxes", []):
                    try:
                        x = Emu(int(box.get("x", 0) * sx))
                        y = Emu(int(box.get("y", 0) * sy))
                        w = Emu(max(1, int(box.get("w", 100) * sx)))
                        h = Emu(max(1, int(box.get("h", 50) * sy)))
                        text_val = box.get("text", "")
                        txBox = slide.shapes.add_textbox(x, y, w, h)
                        tf = txBox.text_frame
                        tf.word_wrap = True
                        box_style = box.get("boxStyle", {})
                        for li, line in enumerate(text_val.split("\n")):
                            para = tf.paragraphs[0] if li == 0 else tf.add_paragraph()
                            if not line:
                                continue
                            run = para.add_run()
                            run.text = line
                            fs = box_style.get("fontSize", 16)
                            run.font.size = Pt(fs)
                            if box_style.get("fontWeight") == "bold":  run.font.bold = True
                            if box_style.get("fontStyle") == "italic": run.font.italic = True
                            color_hex = box_style.get("color", "#000000")
                            rgb = hex_to_rgb(color_hex)
                            if rgb:
                                run.font.color.rgb = rgb
                        bg_hex2 = box_style.get("bgColor")
                        if bg_hex2 and bg_hex2 != "transparent":
                            rgb2 = hex_to_rgb(bg_hex2)
                            if rgb2:
                                txBox.fill.solid()
                                txBox.fill.fore_color.rgb = rgb2
                    except Exception:
                        pass
            p.parent.mkdir(parents=True, exist_ok=True)
            prs.save(str(p))
            return {"ok": True, "path": str(p)}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @misc_router.post("/api/dev-server/start")
    async def dev_server_start(body: DevServerBody, request: Request):
        cwd = body.cwd or app.state.default_cwd
        if not cwd or not Path(cwd).is_dir():
            raise HTTPException(400, "invalid cwd")
        if cwd in _dev_servers:
            entry = _dev_servers[cwd]
            if entry["proc"].returncode is None:
                return {"url": entry["url"]}
        port = await _find_free_port()
        host_header = request.headers.get("host", "")
        if ".workspaces.boltzhub.com" in host_header:
            workspace_id = host_header.split(".")[0]
            url = f"https://{workspace_id}-{port}.workspaces.boltzhub.com"
        else:
            url = f"http://localhost:{port}"
        pkg_dir = Path(cwd)
        if (pkg_dir / "pnpm-lock.yaml").exists():
            cmd = ["pnpm", "dev", "--port", str(port), "--host", "0.0.0.0"]
        elif (pkg_dir / "yarn.lock").exists():
            cmd = ["yarn", "dev", "--port", str(port), "--host", "0.0.0.0"]
        else:
            cmd = ["npm", "run", "dev", "--", "--port", str(port), "--host", "0.0.0.0"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, cwd=cwd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except FileNotFoundError as exc:
            raise HTTPException(500, f"command not found: {exc}")
        _dev_servers[cwd] = {"proc": proc, "url": url}
        await asyncio.sleep(2)
        if proc.returncode is not None:
            raise HTTPException(500, "dev server exited immediately — check package.json")
        return {"url": url, "pid": proc.pid}

    @misc_router.post("/api/dev-server/stop")
    async def dev_server_stop(body: DevServerBody):
        cwd = body.cwd
        entry = _dev_servers.pop(cwd, None)
        if entry:
            try:
                entry["proc"].terminate()
            except Exception:
                pass
        return {"ok": True}

    # ── § 6 · Database ────────────────────────────────────────────────────────

    @db_router.get("/health")
    async def db_health(request: Request):
        pool = getattr(request.app.state, "db", None)
        if pool is None:
            return JSONResponse({"ok": False, "error": "Database not connected"}, status_code=503)
        try:
            async with pool.acquire() as conn:
                version = await conn.fetchval("SELECT version()")
            return {"ok": True, "version": version}
        except Exception as exc:
            return JSONResponse({"ok": False, "error": str(exc)}, status_code=503)

    @db_router.get("/widget/{canvas_id}/rows")
    async def widget_query(canvas_id: str = FPath(...),
                           order: str = Query("id"), dir: str = Query("asc"),
                           limit: int = Query(1000), offset: int = Query(0)):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, f"Invalid canvasId: {canvas_id!r}")
        data = _widget_load(canvas_id)
        records = data["records"]
        desc = dir.upper() == "DESC"
        records = sorted(records, key=lambda r: r.get(order, 0), reverse=desc)
        page = records[offset: offset + min(limit, 10000)]
        return {"rows": page, "total": len(records), "limit": limit, "offset": offset}

    @db_router.post("/widget/{canvas_id}/rows")
    async def widget_insert(canvas_id: str, body: WidgetRowBody):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, f"Invalid canvasId")
        import datetime as _dt
        rows = body.rows or ([body.row] if body.row else [])
        if not rows:
            raise HTTPException(400, "Provide 'row' or 'rows'")
        with _widget_lock(canvas_id):
            data = _widget_load(canvas_id)
            inserted = []
            for row in rows:
                row = {k: v for k, v in row.items() if k not in ("id", "created_at")}
                row["id"] = data["_next_id"]
                row["created_at"] = _dt.datetime.utcnow().isoformat() + "Z"
                data["_next_id"] += 1
                data["records"].append(row)
                inserted.append(row)
            _widget_save(canvas_id, data)
        return {"inserted": inserted}

    @db_router.put("/widget/{canvas_id}/rows/{row_id}")
    async def widget_update(canvas_id: str, row_id: int, body: WidgetUpdateBody):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, "Invalid canvasId")
        patch = {k: v for k, v in body.data.items() if k not in ("id", "created_at")}
        if not patch:
            raise HTTPException(400, "'data' required")
        with _widget_lock(canvas_id):
            data = _widget_load(canvas_id)
            for r in data["records"]:
                if r.get("id") == row_id:
                    r.update(patch)
                    _widget_save(canvas_id, data)
                    return {"updated": r}
        raise HTTPException(404, "Row not found")

    @db_router.delete("/widget/{canvas_id}/rows/{row_id}")
    async def widget_delete(canvas_id: str, row_id: int):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, "Invalid canvasId")
        with _widget_lock(canvas_id):
            data = _widget_load(canvas_id)
            before = len(data["records"])
            data["records"] = [r for r in data["records"] if r.get("id") != row_id]
            if len(data["records"]) == before:
                raise HTTPException(404, "Row not found")
            _widget_save(canvas_id, data)
        return {"deleted": row_id}

    @db_router.post("/widget/{canvas_id}/exec")
    async def widget_exec(canvas_id: str, body: WidgetExecBody):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, "Invalid canvasId")
        data = _widget_load(canvas_id)
        ns = {"records": data["records"], "result": None}
        try:
            exec(compile(body.code, "<widget-exec>", "exec"), ns)  # nosec
        except Exception as exc:
            raise HTTPException(400, str(exc))
        return {"result": ns.get("result")}

    # ── § 8 · Batch Execution ─────────────────────────────────────────────────

    @batch_router.post("/batch")
    async def batch_run(body: BatchRunBody, background: BackgroundTasks):
        import uuid as _uuid, time as _t
        if not body.cwds or not body.message:
            raise HTTPException(400, "cwds and message required")
        _bzcode = app.state.bzcode_path
        batch_id = _uuid.uuid4().hex[:12]
        items = [_BatchItem(cwd, _bzcode, resume_session_id=body.sessions.get(cwd, ""))
                 for cwd in body.cwds]
        _batch_store[batch_id] = {"items": items, "created": _t.time()}

        async def _run():
            await asyncio.gather(*[item.run(body.message) for item in items],
                                 return_exceptions=True)

        background.add_task(asyncio.ensure_future, _run())
        return {"batchId": batch_id}

    @batch_router.get("/batch/{batch_id}")
    async def batch_status(batch_id: str = FPath(...)):
        batch = _batch_store.get(batch_id)
        if not batch:
            raise HTTPException(404, "not found")
        items = [item.to_dict() for item in batch["items"]]
        done  = all(i["status"] in ("done", "error") for i in items)
        return {"batchId": batch_id, "done": done, "items": items}

    # ── § 7 · BoltzHub ────────────────────────────────────────────────────────

    @boltzhub_router.get("/check")
    async def boltzhub_check(cwd: str = Query("")):
        if not cwd:
            cwd = app.state.default_cwd
        token     = _boltzhub_token()
        cfg       = _read_app_config(cwd)
        bzhub_dir = Path(cwd) / ".bzhub"
        return {
            "isLoggedIn":   bool(token),
            "hasAppConfig": bool(cfg),
            "appConfig":    cfg,
            "hasBzhubDir":  bzhub_dir.is_dir(),
            "configPath":   str(bzhub_dir / "app_config.json"),
            "dirName":      Path(cwd).name,
            "cwd":          cwd,
        }

    @boltzhub_router.post("/create-app")
    async def boltzhub_create_app(body: CreateAppBody):
        import aiohttp as _aio
        token = _boltzhub_token()
        if not token:
            raise HTTPException(401, "Not logged in to BoltzHub")
        cwd = body.cwd or app.state.default_cwd
        api_body = {"name": body.name, "visibility": body.visibility}
        if body.description:
            api_body["description"] = body.description
        if body.priceMonthly:
            api_body["priceMonthly"] = body.priceMonthly
        connector = _aio.TCPConnector(ssl=False)
        async with _aio.ClientSession(connector=connector) as sess:
            async with sess.post(f"{BOLTZHUB_API}/v1/creator/apps",
                                 json=api_body, headers=_bz_headers(token)) as resp:
                if resp.status not in (200, 201):
                    raise HTTPException(resp.status, await resp.text())
                result = await resp.json()
        cfg = {"id": result["id"], "name": result["name"],
               "description": result.get("description"),
               "visibility": result.get("visibility", "private"),
               "buildCommand": body.buildCommand,
               "createdAt": result.get("createdAt")}
        _write_app_config(cwd, cfg)
        return {"ok": True, "appConfig": cfg}

    @boltzhub_router.post("/push")
    async def boltzhub_push(body: PushBody):
        """SSE streaming response for push progress."""
        import aiohttp as _aio, zipfile as _zf, io as _io
        cwd = body.cwd or app.state.default_cwd
        token = _boltzhub_token()

        async def _stream():
            def emit(step, message, **kw):
                return f"data: {json.dumps({'step':step,'message':message,**kw})}\n\n"
            try:
                if not token:
                    yield emit("error", "Not logged in to BoltzHub"); return
                cfg = _read_app_config(cwd)
                if not cfg:
                    yield emit("error", "No .bzhub/app_config.json found"); return
                app_id    = cfg["id"]
                build_cmd = cfg.get("buildCommand") or "pnpm build"
                yield emit("build", f"Running: {build_cmd}")
                proc = await asyncio.create_subprocess_shell(
                    build_cmd, cwd=cwd,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                _, stderr = await proc.communicate()
                if proc.returncode != 0:
                    yield emit("error", f"Build failed: {stderr.decode()[:300]}"); return
                yield emit("archive", "Archiving project…")
                bzhub_dir = Path(cwd) / ".bzhub"
                bzhub_dir.mkdir(parents=True, exist_ok=True)
                zip_path = bzhub_dir / "project.zip"
                if zip_path.exists():
                    zip_path.unlink()
                zip_cmd = f'cd "{cwd}" && zip -r "{zip_path}" . -x "node_modules/*" ".bzhub/*" ".git/*"'
                proc2 = await asyncio.create_subprocess_shell(
                    zip_cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
                _, zip_err = await proc2.communicate()
                if proc2.returncode not in (0, 12):
                    yield emit("error", f"Archive failed: {zip_err.decode()[:300]}"); return
                zip_bytes = zip_path.read_bytes()
                auth = {"Authorization": f"Bearer {token}"}
                connector = _aio.TCPConnector(ssl=False)
                async with _aio.ClientSession(connector=connector) as sess:
                    yield emit("upload", f"Uploading {len(zip_bytes)//1024} KB…")
                    form = _aio.FormData()
                    form.add_field("archiveFile", zip_bytes, filename="project.zip",
                                   content_type="application/zip")
                    async with sess.post(f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/code",
                                         data=form, headers=auth) as r:
                        if r.status not in (200, 201):
                            yield emit("error", f"Upload failed ({r.status}): {await r.text()}"); return
                    yield emit("deploy", "Deploying…")
                    async with sess.put(f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/deploy",
                                        headers=auth) as r:
                        if r.status not in (200, 201):
                            yield emit("error", f"Deploy trigger failed: {await r.text()}"); return
                    service_url = None
                    for attempt in range(60):
                        if attempt:
                            await asyncio.sleep(5)
                        async with sess.get(f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/status",
                                            headers=auth) as r:
                            if r.status != 200:
                                continue
                            st = await r.json()
                            service_url = st.get("serviceUrl")
                            dep_status  = st.get("status")
                            yield emit("deploy", st.get("stepMessage", f"Deploying… ({attempt*5}s)"))
                            if dep_status == "deployed":
                                break
                            if dep_status == "failed":
                                yield emit("error", "Deployment failed"); return
                    yield emit("publish", "Publishing version…")
                    if body.releaseNotes:
                        async with sess.post(
                            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
                            json={"releaseNotes": body.releaseNotes, "versionNumber": body.versionNumber},
                            headers=auth,
                        ) as r:
                            pass
                yield emit("done", "Deployed!", serviceUrl=service_url or "", appId=app_id)
            except Exception as exc:
                yield emit("error", str(exc))

        return StreamingResponse(_stream(),
                                 media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no"})

    @boltzhub_router.get("/apps")
    async def boltzhub_apps():
        import aiohttp as _aio
        token = _boltzhub_token()
        if not token:
            raise HTTPException(401, "Not logged in")
        connector = _aio.TCPConnector(ssl=False)
        async with _aio.ClientSession(connector=connector) as sess:
            async with sess.get(f"{BOLTZHUB_API}/v1/creator/apps",
                                 headers={"Authorization": f"Bearer {token}"}) as r:
                if r.status != 200:
                    raise HTTPException(r.status, await r.text())
                return await r.json()

    @boltzhub_router.get("/versions")
    async def boltzhub_versions(appId: str = Query(...)):
        import aiohttp as _aio
        token = _boltzhub_token()
        if not token:
            raise HTTPException(401, "Not logged in")
        connector = _aio.TCPConnector(ssl=False)
        async with _aio.ClientSession(connector=connector) as sess:
            async with sess.get(f"{BOLTZHUB_API}/v1/creator/apps/{appId}/versions",
                                 headers={"Authorization": f"Bearer {token}"}) as r:
                if r.status != 200:
                    raise HTTPException(r.status, await r.text())
                data = await r.json()
                items = data if isinstance(data, list) else data.get("items", [])
                items.sort(key=lambda v: v.get("createdAt", ""), reverse=True)
                latest = items[0]["versionNumber"] if items else "0.0.0"
                parts  = latest.split(".")
                try:
                    suggested = f"{parts[0]}.{parts[1]}.{int(parts[2])+1}"
                except Exception:
                    suggested = "1.0.0"
                return {"versions": items, "suggestedNext": suggested}

    @boltzhub_router.get("/token-usage")
    async def boltzhub_token_usage(period: str = Query("30d")):
        import aiohttp as _aio
        token = _boltzhub_token()
        if not token:
            raise HTTPException(401, "Not logged in")
        connector = _aio.TCPConnector(ssl=False)
        async with _aio.ClientSession(connector=connector) as sess:
            async with sess.get(
                f"{BOLTZHUB_API}/v1/creator/tokens/usage/history?period={period}&limit=100",
                headers={"Authorization": f"Bearer {token}"},
            ) as r:
                if r.status != 200:
                    raise HTTPException(r.status, await r.text())
                return await r.json()

    @boltzhub_router.post("/sync")
    async def boltzhub_sync(body: BzHubSyncBody):
        import aiohttp as _aio, io, zipfile as _zf
        cwd    = body.cwd or app.state.default_cwd
        app_id = body.appId
        token  = _boltzhub_token()

        async def _stream():
            def emit(step: str, message: str, **kw):
                return f"data: {json.dumps({'step': step, 'message': message, **kw})}\n\n"
            try:
                if not token:
                    yield emit("error", "Not logged in to BoltzHub"); return
                if not app_id:
                    cfg = _read_app_config(cwd)
                    if not cfg:
                        yield emit("error", "No .bzhub/app_config.json found"); return
                    _app_id = cfg["id"]
                else:
                    _app_id = app_id
                connector = _aio.TCPConnector(ssl=False)
                yield emit("download", "Downloading project…")
                async with _aio.ClientSession(connector=connector) as sess:
                    async with sess.get(
                        f"{BOLTZHUB_API}/v1/creator/apps/{_app_id}/code",
                        headers={"Authorization": f"Bearer {token}"},
                    ) as r:
                        if r.status != 200:
                            yield emit("error", f"Download failed ({r.status})"); return
                        zip_bytes = await r.read()
                yield emit("extract", "Extracting files…")
                buf = io.BytesIO(zip_bytes)
                with _zf.ZipFile(buf) as z:
                    z.extractall(cwd)
                yield emit("install", "Installing dependencies…")
                lock_pnpm = (Path(cwd) / "pnpm-lock.yaml").exists()
                install_cmd = "pnpm install" if lock_pnpm else "npm install"
                if (Path(cwd) / "package.json").exists():
                    proc = await asyncio.create_subprocess_shell(
                        install_cmd, cwd=cwd,
                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                    await proc.wait()
                yield emit("done", "Project synced successfully!")
            except Exception as exc:
                yield emit("error", str(exc))

        return StreamingResponse(_stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @boltzhub_router.post("/create-version")
    async def boltzhub_create_version(body: BzHubVersionBody):
        import aiohttp as _aio
        token = _boltzhub_token()
        if not token:
            raise HTTPException(401, "Not logged in")
        connector = _aio.TCPConnector(ssl=False)
        async with _aio.ClientSession(connector=connector) as sess:
            async with sess.post(
                f"{BOLTZHUB_API}/v1/creator/apps/{body.appId}/versions",
                json={"releaseNotes": body.releaseNotes, "versionNumber": body.versionNumber},
                headers={"Authorization": f"Bearer {token}"},
            ) as r:
                result = await r.json() if r.content_type == "application/json" else {"status": r.status}
                if r.status not in (200, 201):
                    raise HTTPException(r.status, str(result))
                return result

    @boltzhub_router.post("/publish")
    async def boltzhub_publish(body: BzHubPublishBody):
        import aiohttp as _aio
        token = _boltzhub_token()
        if not token:
            raise HTTPException(401, "Not logged in")
        connector = _aio.TCPConnector(ssl=False)
        async with _aio.ClientSession(connector=connector) as sess:
            async with sess.put(
                f"{BOLTZHUB_API}/v1/creator/apps/{body.appId}/publish",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            ) as r:
                result = await r.json() if r.content_type == "application/json" else {"status": r.status}
                if r.status not in (200, 201):
                    raise HTTPException(r.status, str(result))
                return result

    # ── § 9 · WhatsApp ────────────────────────────────────────────────────────

    @whatsapp_router.post("/incoming")
    async def whatsapp_incoming(request: Request):
        data   = await request.form()
        from_  = data.get("From", "").strip()
        body_t = data.get("Body", "").strip()
        if not from_ or not body_t:
            return "<Response/>"
        _bzcode = app.state.bzcode_path
        _cwd    = app.state.default_cwd
        whatsapp_dir = Path(_cwd) / "whatsapp"
        whatsapp_dir.mkdir(parents=True, exist_ok=True)
        async with _whatsapp_lock:
            if from_ not in _whatsapp_sessions:
                _whatsapp_sessions[from_] = _WASess(from_, _bzcode, str(whatsapp_dir))
            sess = _whatsapp_sessions[from_]
        from server import _send_whatsapp, _load_creds
        async def _process():
            reply = await sess.chat(body_t)
            await _send_whatsapp(from_, reply, _load_creds())
        asyncio.create_task(_process())
        from fastapi.responses import Response
        return Response(content="<Response/>", media_type="text/xml")

    @whatsapp_router.post("/status")
    async def whatsapp_status(request: Request):
        data   = await request.form()
        status = data.get("MessageStatus", "unknown")
        sid    = data.get("MessageSid", "")
        print(f"[whatsapp] delivery {sid}: {status}", file=sys.stderr)
        from fastapi.responses import Response
        return Response(content="<Response/>", media_type="text/xml")

    # ── Mount all routers ─────────────────────────────────────────────────────
    for _router in [ws_router, auth_router, files_router, sessions_router,
                    canvas_router, db_router, boltzhub_router,
                    batch_router, whatsapp_router, misc_router]:
        app.include_router(_router)

    return app


# ── Static file serving helper ────────────────────────────────────────────────

def mount_frontend(app: FastAPI, dist_dir: Path) -> None:
    """Serve the Vite production build as a SPA from the same server."""
    if not dist_dir.is_dir():
        print(f"[frontend] dist dir not found: {dist_dir}", file=sys.stderr)
        return
    index_html = dist_dir / "index.html"
    if not index_html.exists():
        print(f"[frontend] index.html not found — run 'pnpm build' first", file=sys.stderr)
        return

    # Serve /assets and other static sub-directories
    for entry in dist_dir.iterdir():
        if entry.is_dir():
            app.mount(f"/{entry.name}", StaticFiles(directory=str(entry)), name=entry.name)

    # SPA catch-all — must be last
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Serve real files, fall back to index.html
        candidate = dist_dir / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(index_html))

    print(f"[frontend] serving {dist_dir}", file=sys.stderr)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="BoltzAgent FastAPI server")
    parser.add_argument("--bzcode", default="./bzcode")
    parser.add_argument("--host",   default="localhost")
    parser.add_argument("--port",   type=int, default=18789)
    parser.add_argument("--cwd",    default=os.getcwd())
    parser.add_argument("--dist",   default="", metavar="DIR",
                        help="Vite dist/ directory to serve as the SPA frontend")
    args = parser.parse_args()

    bzcode_path = os.path.abspath(args.bzcode)
    default_cwd = os.path.abspath(args.cwd)

    fastapi_app = create_app(bzcode_path=bzcode_path, default_cwd=default_cwd,
                              port=args.port)

    if args.dist:
        mount_frontend(fastapi_app, Path(args.dist).resolve())

    print(f"BoltzAgent FastAPI server", flush=True)
    print(f"  WebSocket : ws://{args.host}:{args.port}/ws", flush=True)
    print(f"  HTTP API  : http://{args.host}:{args.port}", flush=True)
    print(f"  Docs      : http://{args.host}:{args.port}/docs", flush=True)
    if args.dist:
        print(f"  Frontend  : http://{args.host}:{args.port}/", flush=True)

    uvicorn.run(
        fastapi_app,
        host=args.host,
        port=args.port,
        log_level="info",
    )


# Allow `uvicorn app:app` to work without any arguments (uses defaults).
# Set environment variables to configure without CLI flags:
#   BZCODE_PATH   path to the bzcode binary  (default: ./bzcode)
#   BZCODE_CWD    default working directory   (default: current directory)
#   PORT          HTTP port                   (default: 18789)
#   BZCODE_DIST   path to Vite dist/ folder   (default: ./dist if it exists)
import re
app = create_app(
    bzcode_path=os.path.abspath(os.environ.get("BZCODE_PATH", "./bzcode")),
    default_cwd=os.path.abspath(os.environ.get("BZCODE_CWD", os.getcwd())),
    port=int(os.environ.get("PORT", "18789")),
)

# Auto-mount the frontend if BZCODE_DIST is set, or if ./dist/index.html exists
_dist_env  = os.environ.get("BZCODE_DIST", "")
_dist_auto = Path("./dist")
_dist_path = Path(_dist_env).resolve() if _dist_env else (_dist_auto.resolve() if (_dist_auto / "index.html").exists() else None)
if _dist_path:
    mount_frontend(app, _dist_path)

if __name__ == "__main__":
    main()
