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

    # ── WebSocket bridge ──────────────────────────────────────────────────────

    @app.websocket("/ws")
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
                env={**os.environ},
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

    # ── Auth ──────────────────────────────────────────────────────────────────

    @app.post("/auth")
    async def auth(body: AuthBody):
        creds_dir  = Path.home() / ".boltzbit"
        creds_file = creds_dir / "credentials.json"
        creds_dir.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if creds_file.exists():
            try:
                existing = json.loads(creds_file.read_text())
            except Exception:
                pass
        entry: dict = {"accessToken": body.accessToken}
        if body.refreshToken:
            entry["refreshToken"] = body.refreshToken
        if body.expiresAt is not None:
            entry["expiresAt"] = body.expiresAt
        existing[body.authUrl] = entry
        with open(creds_file, "w") as f:
            json.dump(existing, f, indent=2)
        print(f"[auth] credentials written for {body.authUrl}", file=sys.stderr)
        return {"ok": True}

    # ── Proxy ─────────────────────────────────────────────────────────────────

    @app.post("/proxy")
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

    @app.get("/credentials")
    async def get_credential_keys():
        f = SERVER_DATA_DIR / "credentials.json"
        if not f.exists():
            return {"keys": []}
        try:
            return {"keys": list(json.loads(f.read_text()).keys())}
        except Exception:
            return {"keys": []}

    @app.post("/credentials")
    async def post_credential(body: CredentialBody):
        SERVER_DATA_DIR.mkdir(parents=True, exist_ok=True)
        f = SERVER_DATA_DIR / "credentials.json"
        data = json.loads(f.read_text()) if f.exists() else {}
        data[body.key] = body.value
        f.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        return {"ok": True, "key": body.key}

    @app.delete("/credentials/{key}")
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

    # ── Shell + Files ─────────────────────────────────────────────────────────

    @app.get("/shell")
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

    @app.get("/files")
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

    # ── Canvas ────────────────────────────────────────────────────────────────

    @app.get("/canvas")
    async def get_canvas(cwd: str = Query("")):
        if not cwd or not os.path.isdir(cwd):
            return {"widgets": []}
        f = Path(cwd) / ".bzcanvas.json"
        if not f.exists():
            return {"widgets": []}
        return json.loads(f.read_text())

    @app.post("/canvas")
    async def post_canvas(request: Request, cwd: str = Query("")):
        if not cwd or not os.path.isdir(cwd):
            raise HTTPException(400, "invalid cwd")
        body = await request.json()
        f = Path(cwd) / ".bzcanvas.json"
        f.write_text(json.dumps(body, indent=2, ensure_ascii=False))
        return {"ok": True, "file": str(f)}

    # ── Widgets ───────────────────────────────────────────────────────────────

    @app.get("/widgets")
    async def get_widgets():
        data = _load_index()
        return {"widgets": [
            {**e, "code": _load_code(e["id"])}
            for e in data.get("widgets", []) if not e.get("archived", False)
        ]}

    @app.get("/widgets/{widget_id}")
    async def get_widget(widget_id: str = FPath(...)):
        data = _load_index()
        entry = next((w for w in data.get("widgets", []) if w.get("id") == widget_id), None)
        if entry is None:
            raise HTTPException(404, "widget not found")
        return {**entry, "code": _load_code(widget_id)}

    @app.post("/widgets")
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

    @app.post("/widgets/seed")
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

    @app.delete("/widgets/{widget_id}")
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

    # ── Sessions ──────────────────────────────────────────────────────────────

    @app.get("/sessions")
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

    @app.post("/session-default")
    async def set_default_session(body: SetDefaultBody):
        if not body.cwd:
            raise HTTPException(400, "cwd required")
        if body.sessionId:
            _save_default(body.cwd, body.sessionId)
        else:
            _clear_default(body.cwd)
        return {"ok": True}

    @app.delete("/sessions/{session_id}")
    async def delete_session(session_id: str = FPath(...)):
        if "/" in session_id or ".." in session_id:
            raise HTTPException(400, "invalid sessionId")
        p = SESSIONS_DIR / f"{session_id}.jsonl"
        if not p.exists():
            raise HTTPException(404, "not found")
        p.unlink()
        return {"ok": True}

    @app.post("/sessions/{session_id}/title")
    async def update_session_title(session_id: str, body: SessionTitleBody):
        if "/" in session_id or ".." in session_id:
            raise HTTPException(400, "invalid sessionId")
        _save_title(session_id, body.title[:100])
        return {"ok": True}

    # ── Search ────────────────────────────────────────────────────────────────

    @app.get("/search")
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

    # ── Token stats ───────────────────────────────────────────────────────────

    @app.get("/token-stats")
    async def token_stats():
        return _token_stats

    # ── Agent modes ───────────────────────────────────────────────────────────

    @app.get("/agent-modes")
    async def agent_modes():
        return _load_mode_config()

    # ── File read/write ───────────────────────────────────────────────────────

    @app.get("/api/file")
    async def read_file(path: str = Query("")):
        if not path:
            raise HTTPException(400, "path required")
        p = Path(path)
        if not p.exists() or not p.is_file():
            raise HTTPException(404, "file not found")
        return {"path": str(p), "content": p.read_text(errors="replace")}

    @app.put("/api/file")
    async def write_file(body: WriteFileBody):
        p = Path(body.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.content, encoding="utf-8")
        return {"ok": True, "path": str(p)}

    # ── Settings ──────────────────────────────────────────────────────────────

    @app.get("/settings/resources")
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

    @app.delete("/settings/sessions/clear")
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

    # ── DB health ─────────────────────────────────────────────────────────────

    @app.get("/db/health")
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

    # ── Widget data (file-based) ──────────────────────────────────────────────

    @app.get("/db/widget/{canvas_id}/rows")
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

    @app.post("/db/widget/{canvas_id}/rows")
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

    @app.put("/db/widget/{canvas_id}/rows/{row_id}")
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

    @app.delete("/db/widget/{canvas_id}/rows/{row_id}")
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

    @app.post("/db/widget/{canvas_id}/exec")
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

    # ── Batch execution ───────────────────────────────────────────────────────

    @app.post("/batch")
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

    @app.get("/batch/{batch_id}")
    async def batch_status(batch_id: str = FPath(...)):
        batch = _batch_store.get(batch_id)
        if not batch:
            raise HTTPException(404, "not found")
        items = [item.to_dict() for item in batch["items"]]
        done  = all(i["status"] in ("done", "error") for i in items)
        return {"batchId": batch_id, "done": done, "items": items}

    # ── BoltzHub integration ──────────────────────────────────────────────────

    @app.get("/boltzhub/check")
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

    @app.post("/boltzhub/create-app")
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

    @app.post("/boltzhub/push")
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

    @app.get("/boltzhub/apps")
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

    @app.get("/boltzhub/versions")
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

    @app.get("/boltzhub/token-usage")
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

    # ── WhatsApp ──────────────────────────────────────────────────────────────

    @app.post("/whatsapp/incoming")
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

    @app.post("/whatsapp/status")
    async def whatsapp_status(request: Request):
        data   = await request.form()
        status = data.get("MessageStatus", "unknown")
        sid    = data.get("MessageSid", "")
        print(f"[whatsapp] delivery {sid}: {status}", file=sys.stderr)
        from fastapi.responses import Response
        return Response(content="<Response/>", media_type="text/xml")

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
