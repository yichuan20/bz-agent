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
    _credentials_valid,
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
    _read_api_keys,
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

class CreateSessionBody(BaseModel):
    cwd: str = ""
    mode: str = "general"

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

class WidgetSchemaBody(BaseModel):
    columns: List[Dict[str, Any]] = []

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

class ExcelPatchBody(BaseModel):
    path: str
    sheet: str = ""       # sheet name; empty = first sheet
    cells: dict = {}      # { ref: { f?, v?, s? } } in sidecar schema

class ExcelGridBody(BaseModel):
    path: str
    sheet: str = ""
    columnIndexToWidth: dict = {}
    rowIndexToHeight: dict = {}

class ExcelAddSheetBody(BaseModel):
    path: str
    sheetName: str = "Sheet2"

class ExcelRenameSheetBody(BaseModel):
    path: str
    oldName: str
    newName: str

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


# ── PPTX binary export (shared by load + save) ───────────────────────────────

def _pptx_export(p, slides):
    """Rebuild the .pptx binary from slide JSON. Called on save and on load-from-sidecar."""
    import json as _json, tempfile, shutil as _shutil, os as _os, base64 as _b64mod, io as _iomod
    from pathlib import Path as _Path
    from pptx import Presentation
    from pptx.util import Emu, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE
    from pptx.oxml.ns import qn as _qn_save
    from lxml import etree as _etree_save

    CW, CH = 896, 504
    p = _Path(p)

    def hex_to_rgb(hex_str):
        h = str(hex_str).lstrip("#")
        if len(h) == 6:
            try:
                return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
            except Exception:
                pass
        return None

    if p.exists():
        _orig = Presentation(str(p))
        sw, sh = _orig.slide_width, _orig.slide_height
    else:
        _orig = Presentation()
        sw = _orig.slide_width or Emu(9144000)
        sh = _orig.slide_height or Emu(5143500)
    sx = sw / CW if CW else 1
    sy = sh / CH if CH else 1
    prs = Presentation()
    prs.slide_width = sw
    prs.slide_height = sh
    blank_layout = prs.slide_layouts[6]

    _PRST_MAP = {
        'ellipse': 'ellipse', 'roundRect': 'roundRect', 'rect': 'rect',
        'triangle': 'triangle', 'isoscelesTri': 'triangle',
        'rtTriangle': 'rtTriangle', 'diamond': 'diamond',
        'parallelogram': 'parallelogram', 'trapezoid': 'trapezoid',
        'pentagon': 'pentagon', 'hexagon': 'hexagon',
        'plus': 'plus', 'mathPlus': 'mathPlus',
        'mathMinus': 'mathMinus', 'mathMultiply': 'mathMultiply',
        'rightArrow': 'rightArrow', 'leftArrow': 'leftArrow',
        'upArrow': 'upArrow', 'downArrow': 'downArrow',
        'chevron': 'chevron', 'bentArrow': 'bentArrow',
        'curvedRightArrow': 'curvedRightArrow',
        'can': 'can', 'cube': 'cube',
        'star4': 'star4', 'star5': 'star5',
        'snip1Rect': 'snip1Rect',
        'round2SameRect': 'round2SameRect',
        'round2DiagRect': 'round2DiagRect',
    }

    from pptx.enum.text import PP_ALIGN as _PP_ALIGN
    def _align(s):
        if s == 'center': return _PP_ALIGN.CENTER
        if s == 'right':  return _PP_ALIGN.RIGHT
        return _PP_ALIGN.LEFT

    def _apply_prst_geom(sp, st_str, corner_radius=0):
        """Patch prstGeom prst attribute and re-apply corner radius adjust."""
        sp_el = sp._element
        sp_pr = sp_el.find(_qn_save('p:spPr'))
        if sp_pr is None:
            return
        pg = sp_pr.find(_qn_save('a:prstGeom'))
        if pg is None:
            return
        prst = _PRST_MAP.get(st_str, st_str)
        pg.set('prst', prst)
        av = pg.find(_qn_save('a:avLst'))
        if av is not None:
            for gd_el in av.findall(_qn_save('a:gd')):
                av.remove(gd_el)
        if st_str == 'roundRect' and corner_radius > 0:
            adj_val = max(0, min(50000, int(corner_radius * 500)))
            if av is None:
                av = _etree_save.SubElement(pg, _qn_save('a:avLst'))
            gd_new = _etree_save.SubElement(av, _qn_save('a:gd'))
            gd_new.set('name', 'adj')
            gd_new.set('fmla', f'val {adj_val}')

    def _apply_fill(sp, fill_data, box_style):
        """Apply solid or gradient fill to a shape."""
        fill_type = fill_data.get('type') if isinstance(fill_data, dict) else None
        fill_color = fill_data.get('color') if isinstance(fill_data, dict) else None
        opacity = float(fill_data.get('opacity', 1.0)) if isinstance(fill_data, dict) else 1.0
        gradient = fill_data.get('gradient') if isinstance(fill_data, dict) else None
        # Prefer boxStyle bgGradient if present
        bg_grad = box_style.get('bgGradient') if box_style else None
        if bg_grad:
            gradient = bg_grad
            fill_type = 'gradient'

        if fill_type == 'gradient' and gradient and gradient.get('stops'):
            try:
                sp_pr_g = sp._element.find(_qn_save('p:spPr'))
                if sp_pr_g is not None:
                    # Remove existing fill elements
                    for tag in ('a:solidFill', 'a:gradFill', 'a:noFill', 'a:blipFill', 'a:pattFill'):
                        for el in sp_pr_g.findall(_qn_save(tag)):
                            sp_pr_g.remove(el)
                    gf = _etree_save.SubElement(sp_pr_g, _qn_save('a:gradFill'))
                    gsLst = _etree_save.SubElement(gf, _qn_save('a:gsLst'))
                    for stop in gradient['stops']:
                        gs = _etree_save.SubElement(gsLst, _qn_save('a:gs'))
                        gs.set('pos', str(int(stop['pos'] * 100000)))
                        srgb = _etree_save.SubElement(gs, _qn_save('a:srgbClr'))
                        srgb.set('val', stop['color'].lstrip('#'))
                    lin = _etree_save.SubElement(gf, _qn_save('a:lin'))
                    ang_60k = int(gradient.get('angle', 0) * 60000)
                    lin.set('ang', str(ang_60k))
                    lin.set('scaled', '0')
            except Exception:
                pass
        elif fill_color:
            rgb3 = hex_to_rgb(fill_color)
            if rgb3:
                sp.fill.solid()
                sp.fill.fore_color.rgb = rgb3
                if opacity < 1.0:
                    alpha_val = max(0, min(100000, int(opacity * 100000)))
                    try:
                        sp_pr2 = sp._element.find(_qn_save('p:spPr'))
                        if sp_pr2 is not None:
                            clr_el = sp_pr2.find('.//' + _qn_save('a:srgbClr'))
                            if clr_el is not None:
                                alpha_el = _etree_save.SubElement(clr_el, _qn_save('a:alpha'))
                                alpha_el.set('val', str(alpha_val))
                    except Exception:
                        pass
        else:
            sp.fill.background()

    def _apply_line(sp, box_style):
        """Apply border/line from boxStyle, or remove it."""
        border_color = (box_style or {}).get('borderColor', '')
        border_width = float((box_style or {}).get('borderWidth', 0) or 0)
        if border_color and border_color != 'transparent' and border_width > 0:
            try:
                rgb_ln = hex_to_rgb(border_color)
                if rgb_ln:
                    sp.line.color.rgb = rgb_ln
                    sp.line.width = Pt(border_width)
            except Exception:
                pass
        else:
            try:
                sp.line.fill.background()
            except Exception:
                pass

    def _apply_text(tf, paragraphs, plain_text, box_style, box_font):
        """Populate a text frame from paragraphs or plain text."""
        if paragraphs:
            for pi, para_data in enumerate(paragraphs):
                para = tf.paragraphs[0] if pi == 0 else tf.add_paragraph()
                try:
                    para.alignment = _align(para_data.get("align") or box_style.get("textAlign", "left"))
                except Exception:
                    pass
                try:
                    sb = para_data.get("spaceBefore", 0) or 0
                    if sb:
                        para.space_before = Pt(sb)
                except Exception:
                    pass
                for run_data in (para_data.get("runs") or []):
                    rt = run_data.get("text", "")
                    if not rt:
                        continue
                    run = para.add_run()
                    run.text = rt
                    run.font.size = Pt(run_data.get("fontSize") or box_style.get("fontSize", 16))
                    run.font.name = run_data.get("fontFamily") or box_font
                    if run_data.get("bold"):
                        run.font.bold = True
                    if run_data.get("italic"):
                        run.font.italic = True
                    if run_data.get("underline"):
                        run.font.underline = True
                    c_hex = run_data.get("color") or box_style.get("color", "#000000")
                    rgb_r = hex_to_rgb(c_hex)
                    if rgb_r:
                        run.font.color.rgb = rgb_r
        else:
            box_align = box_style.get("textAlign", "left")
            for li, line in enumerate((plain_text or "").split("\n")):
                para = tf.paragraphs[0] if li == 0 else tf.add_paragraph()
                try:
                    para.alignment = _align(box_align)
                except Exception:
                    pass
                if not line:
                    continue
                run = para.add_run()
                run.text = line
                run.font.size = Pt(box_style.get("fontSize", 16))
                run.font.name = box_font
                if box_style.get("fontWeight") == "bold":
                    run.font.bold = True
                if box_style.get("fontStyle") == "italic":
                    run.font.italic = True
                if box_style.get("textDecoration") == "underline":
                    run.font.underline = True
                rgb = hex_to_rgb(box_style.get("color", "#000000"))
                if rgb:
                    run.font.color.rgb = rgb

    def _apply_text_anchor(tf, box_style):
        """Set vertical text anchor from boxStyle.textAnchor (OOXML: t/ctr/b)."""
        anchor = (box_style or {}).get('textAnchor', '')
        if anchor:
            try:
                body_pr = tf._txBody.find(_qn_save('a:bodyPr'))
                if body_pr is not None:
                    body_pr.set('anchor', anchor)
            except Exception:
                pass

    for slide_data in slides:
        slide = prs.slides.add_slide(blank_layout)

        # ── Slide background ──────────────────────────────────────────────────
        try:
            bg_grad = slide_data.get("bgGradient")
            if bg_grad and bg_grad.get('stops'):
                bg_pr = slide.background._element.find(_qn_save('p:bg'))
                if bg_pr is None:
                    bg_pr = _etree_save.SubElement(slide.background._element, _qn_save('p:bg'))
                bg_prop = bg_pr.find(_qn_save('p:bgPr'))
                if bg_prop is None:
                    bg_prop = _etree_save.SubElement(bg_pr, _qn_save('p:bgPr'))
                for tag in ('a:solidFill', 'a:gradFill', 'a:noFill'):
                    for el in bg_prop.findall(_qn_save(tag)):
                        bg_prop.remove(el)
                gf_bg = _etree_save.SubElement(bg_prop, _qn_save('a:gradFill'))
                gsLst_bg = _etree_save.SubElement(gf_bg, _qn_save('a:gsLst'))
                for stop in bg_grad['stops']:
                    gs_bg = _etree_save.SubElement(gsLst_bg, _qn_save('a:gs'))
                    gs_bg.set('pos', str(int(stop['pos'] * 100000)))
                    srgb_bg = _etree_save.SubElement(gs_bg, _qn_save('a:srgbClr'))
                    srgb_bg.set('val', stop['color'].lstrip('#'))
                lin_bg = _etree_save.SubElement(gf_bg, _qn_save('a:lin'))
                lin_bg.set('ang', str(int(bg_grad.get('angle', 0) * 60000)))
                lin_bg.set('scaled', '0')
            else:
                bg = slide.background.fill
                bg.solid()
                rgb = hex_to_rgb(slide_data.get("bgColor", "#ffffff"))
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
                rotation = float(box.get("rotation", 0) or 0)
                box_style = box.get("boxStyle", {})

                # ── Image box ────────────────────────────────────────────────
                img_data = box.get("imageData", "")
                if img_data and "," in img_data:
                    try:
                        _, b64part = img_data.split(",", 1)
                        img_bytes = _b64mod.b64decode(b64part)
                        pic = slide.shapes.add_picture(_iomod.BytesIO(img_bytes), x, y, w, h)
                        if rotation:
                            pic.rotation = rotation
                    except Exception:
                        pass
                    continue

                fill_data = box.get("fill")
                st_str = box.get("shapeType", "rect") or "rect"
                has_text = bool(box.get("text") or box.get("paragraphs"))
                paragraphs = box.get("paragraphs", [])
                box_font = box_style.get("fontFamily") or "Montserrat"

                # ── Geometric shape with text (shape + text frame) ────────────
                if has_text and st_str not in ("", "textbox", "rect"):
                    sp = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, x, y, w, h)
                    _apply_prst_geom(sp, st_str, box.get("cornerRadius", 0))
                    _apply_fill(sp, fill_data or {'type': 'none'}, box_style)
                    _apply_line(sp, box_style)
                    if rotation:
                        sp.rotation = rotation
                    tf = sp.text_frame
                    tf.word_wrap = True
                    _apply_text(tf, paragraphs, box.get("text", ""), box_style, box_font)
                    _apply_text_anchor(tf, box_style)
                    continue

                # ── Pure geometric shape (no text) ────────────────────────────
                if fill_data and not has_text and st_str not in ("", "textbox"):
                    sp = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, x, y, w, h)
                    _apply_prst_geom(sp, st_str, box.get("cornerRadius", 0))
                    _apply_fill(sp, fill_data, box_style)
                    _apply_line(sp, box_style)
                    if rotation:
                        sp.rotation = rotation
                    if sp.has_text_frame:
                        sp.text_frame.text = ""
                    continue

                # ── Text box ──────────────────────────────────────────────────
                txBox = slide.shapes.add_textbox(x, y, w, h)
                if rotation:
                    txBox.rotation = rotation
                tf = txBox.text_frame
                tf.word_wrap = True
                _apply_text(tf, paragraphs, box.get("text", ""), box_style, box_font)
                _apply_text_anchor(tf, box_style)
                _apply_line(txBox, box_style)
                bg_hex2 = box_style.get("bgColor")
                if bg_hex2 and bg_hex2 != "transparent":
                    rgb2 = hex_to_rgb(bg_hex2)
                    if rgb2:
                        txBox.fill.solid()
                        txBox.fill.fore_color.rgb = rgb2
                elif box_style.get('bgGradient'):
                    _apply_fill(txBox, {'type': 'gradient', 'gradient': box_style['bgGradient'],
                                        'color': box_style.get('bgColor', '#ffffff')}, box_style)
            except Exception:
                pass

    tmp_fd, tmp_name = tempfile.mkstemp(suffix=".pptx", dir=p.parent)
    try:
        _os.close(tmp_fd)
        prs.save(tmp_name)
        _shutil.move(tmp_name, str(p))
    except Exception:
        try:
            _os.unlink(tmp_name)
        except OSError:
            pass
        raise


# ── App factory ───────────────────────────────────────────────────────────────

_DEFAULT_BZ_HOME = "/usr/local/boltzbit"

def create_app(bzcode_path: str = "", default_cwd: str = "",
               bz_home: str = "", port: int = 18789) -> FastAPI:

    app = FastAPI(
        title="BoltzAgent API",
        version="1.0.0",
        description="bzcode bridge + widget canvas + session management",
        lifespan=lifespan,
    )

    bz_home = bz_home or _DEFAULT_BZ_HOME
    os.makedirs(bz_home, exist_ok=True)

    # Store config accessible to route handlers
    app.state.bzcode_path = bzcode_path
    app.state.default_cwd = default_cwd
    app.state.bz_home     = bz_home
    app.state.port        = port

    # Propagate BZ_HOME into the process environment so that _BatchItem and
    # _WASess (which inherit os.environ) also pick it up without needing refactoring.
    os.environ["BZ_HOME"] = bz_home

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

        _bzcode  = app.state.bzcode_path
        _cwd     = app.state.default_cwd
        _bz_home = app.state.bz_home

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
        import shutil as _shutil_ws
        _bzcode_resolved = _shutil_ws.which(_bzcode) or _bzcode
        if not os.path.isfile(_bzcode_resolved):
            await websocket.send_text(json.dumps({
                "type": "result", "status": "error",
                "error": f"bzcode not found: '{_bzcode}' is not on PATH and not a file. Install bzcode or set BZCODE_PATH.",
            }))
            print(f"[ws] bzcode not found: {_bzcode}", file=sys.stderr)
            return
        _bzcode = _bzcode_resolved

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

        # ── Credential check ─────────────────────────────────────────────────
        cred_ok, cred_reason = _credentials_valid()
        if not cred_ok:
            print(f"[ws] auth_error: {cred_reason}", file=sys.stderr)
            await websocket.send_text(json.dumps({
                "type": "auth_error",
                "reason": cred_reason,
            }))
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
                env={**os.environ, **_read_api_keys(), "BZ_PYTHON": sys.executable,
                     **( {"BZ_HOME": _bz_home} if _bz_home else {} )},
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

        if req_mode == 'widget':
            proc.stdin.write(b'{"type":"setMode","mode":"yolo"}\n')
            await proc.stdin.drain()

        try:
            await asyncio.gather(
                read_bzcode_stdout(proc, out_queue, ready_event,
                                   cwd=effective_cwd, mode=req_mode),
                send_to_client(out_queue, ws_shim),
                drain_bzcode_stderr(proc, out_queue),
                relay_client_messages(proc, ws_shim, ready_event),
            )
        except (BrokenPipeError, ConnectionResetError, asyncio.CancelledError, WebSocketDisconnect):
            pass
        finally:
            _active_cwds.discard(effective_cwd)
            exit_code = proc.returncode
            if exit_code not in (None, 0):
                print(f"[ws] bzcode exited with code {exit_code}  pid={proc.pid}", file=sys.stderr)
                try:
                    await websocket.send_text(json.dumps({
                        "type": "system",
                        "message": f"⚠ bzcode process exited unexpectedly (code {exit_code}). Reconnecting…",
                    }))
                except Exception:
                    pass
            else:
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
        try:
            _write_bzcode_credentials(
                access_token=body.accessToken,
                refresh_token=body.refreshToken or "",
                expires_at=body.expiresAt,
                auth_url=body.authUrl,
            )
        except Exception as exc:
            print(f"[auth] failed to write credentials: {exc}", file=sys.stderr)
            raise HTTPException(status_code=500, detail="credential_write_failed")
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

    @auth_router.get("/auth/status")
    async def auth_status():
        valid, reason = _credentials_valid()
        return {"valid": valid, "reason": reason}

    @auth_router.post("/auth/logout")
    async def logout(body: LogoutBody):
        bz_home = app.state.bz_home
        creds_file = Path(bz_home) / "credentials.json"
        try:
            if creds_file.exists():
                creds_file.unlink()
                print(f"[auth] credentials deleted from {creds_file}", file=sys.stderr)
            else:
                print(f"[auth] logout: no credentials file at {creds_file}", file=sys.stderr)
        except Exception as exc:
            print(f"[auth] logout error: {exc}", file=sys.stderr)
        return {"ok": True}

    @auth_router.post("/agent-key")
    async def set_api_key(request: Request):
        body = await request.json()
        key_name  = body.get("name", "")
        key_value = body.get("value", "")
        if key_name != "BZ_API_KEY":
            raise HTTPException(400, "Only BZ_API_KEY is accepted")
        if not key_value:
            raise HTTPException(400, "value is required")
        bz_home = app.state.bz_home
        keys_file = Path(bz_home) / "api_keys.json"
        keys: dict = {"BZ_API_KEY": key_value}  # overwrite; only BZ_API_KEY is stored
        with open(keys_file, "w") as f:
            json.dump(keys, f, indent=2)
        print(f"[api-key] BZ_API_KEY updated", file=sys.stderr)
        return {"ok": True}

    @auth_router.get("/agent-keys")
    async def list_api_keys():
        return {"keys": list(_read_api_keys().keys())}

    @auth_router.delete("/agent-key/{name}")
    async def delete_api_key(name: str):
        if name != "BZ_API_KEY":
            raise HTTPException(400, "Only BZ_API_KEY can be deleted")
        bz_home = app.state.bz_home
        keys_file = Path(bz_home) / "api_keys.json"
        if not keys_file.exists():
            return {"ok": True}
        try:
            with open(keys_file, "w") as f:
                json.dump({}, f)
            print(f"[api-key] BZ_API_KEY deleted", file=sys.stderr)
        except Exception as exc:
            raise HTTPException(500, str(exc))
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
            path = app.state.default_cwd or os.getcwd()
        p = Path(path)
        if not p.exists() or not p.is_dir():
            raise HTTPException(404, "path not found or not a directory")
        entries = []
        for entry in sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            if entry.name.startswith('.'):
                continue  # hide dotfiles (including pptx JSON sidecars)
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

    @sessions_router.post("/sessions/create")
    async def create_session_with_handshake(body: CreateSessionBody):
        """Pre-create a session: write config, spawn bzcode, run a handshake exchange,
        then terminate bzcode. Returns the confirmed sessionId so the frontend can
        resume a verified session instead of opening a raw unconfirmed connection."""
        import secrets as _sec2
        import shutil as _sh
        _bz = app.state.bzcode_path
        effective_cwd = (body.cwd if body.cwd and os.path.isdir(body.cwd)
                         else app.state.default_cwd)
        mode = body.mode or _load_mode_config().get("default", "general")

        session_id = f"bz-{_sec2.token_hex(6)}"
        _write_session_config(session_id, mode, working_dir=effective_cwd)

        # Resolve and validate bzcode path (same logic as ws_endpoint)
        bz_resolved = _sh.which(_bz) or _bz
        if not os.path.isfile(bz_resolved):
            raise HTTPException(500, f"bzcode not found: '{_bz}'")
        if not os.access(bz_resolved, os.X_OK):
            try:
                os.chmod(bz_resolved, 0o755)
            except OSError:
                raise HTTPException(500, f"bzcode is not executable: {bz_resolved}")

        try:
            proc = await asyncio.create_subprocess_exec(
                bz_resolved, "--stdio", "--resume", session_id,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=effective_cwd,
                env={**os.environ, **_read_api_keys(), "BZ_PYTHON": sys.executable},
                limit=16 * 1024 * 1024,
            )
        except (FileNotFoundError, PermissionError) as exc:
            raise HTTPException(500, f"Failed to start bzcode: {exc}")

        confirmed_id = session_id
        try:
            if mode == 'widget':
                proc.stdin.write(b'{"type":"setMode","mode":"yolo"}\n')
                await proc.stdin.drain()

            # Wait for session message (bzcode ready)
            try:
                while True:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=20.0)
                    if not line:
                        raise HTTPException(500, "bzcode exited before sending session message")
                    raw = line.decode().rstrip('\n')
                    if raw and raw[0] == '{':
                        try:
                            msg = json.loads(raw)
                            if msg.get('type') == 'session':
                                confirmed_id = msg.get('sessionId', session_id)
                                break
                        except json.JSONDecodeError:
                            pass
            except asyncio.TimeoutError:
                raise HTTPException(504, "bzcode startup timed out after 20s")

            # Send handshake
            handshake = json.dumps({"type": "user", "content": "Hi, hand shake, say yes"}) + "\n"
            proc.stdin.write(handshake.encode())
            await proc.stdin.drain()

            # Wait for bzcode to finish processing the handshake.
            # Capture any error message so we can surface it to the caller.
            _handshake_error: list[str] = []

            async def _wait_reply() -> bool:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        return False
                    raw = line.decode().rstrip('\n')
                    if not raw or raw[0] != '{':
                        continue
                    try:
                        msg = json.loads(raw)
                        mtype = msg.get('type')
                        if mtype == 'result':
                            if msg.get('status') == 'error':
                                err = msg.get('error') or msg.get('message') or 'Model call failed during handshake'
                                _handshake_error.append(str(err))
                                return False
                            # Only a non-error result means the model actually replied.
                            # status:idle alone is NOT sufficient — it fires even on failure.
                            return True
                    except json.JSONDecodeError:
                        pass

            try:
                ok = await asyncio.wait_for(_wait_reply(), timeout=60.0)
            except asyncio.TimeoutError:
                raise HTTPException(504, "Handshake timed out — model may be unreachable")
            if not ok:
                err_detail = _handshake_error[0] if _handshake_error else "bzcode exited during handshake"
                raise HTTPException(500, err_detail)

            # Close stdin so bzcode sees EOF and flushes its JSONL to disk.
            try:
                proc.stdin.close()
            except Exception:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except (asyncio.TimeoutError, ProcessLookupError):
                pass  # fall through to terminate in finally

            return {"ok": True, "sessionId": confirmed_id}

        finally:
            # Ensure process is dead (noop if already exited above).
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass

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

    @files_router.post("/api/file/upload")
    async def file_upload(request: Request):
        form = await request.form()
        upload = form.get("file")
        dir_path = str(form.get("dir", "")).strip() or app.state.default_cwd
        if upload is None:
            raise HTTPException(400, "expected field 'file'")
        filename = getattr(upload, "filename", None) or "upload"
        data = await upload.read()
        dest = Path(dir_path) / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Avoid clobbering: append (2), (3), … if file exists
        if dest.exists():
            stem, suffix = dest.stem, dest.suffix
            n = 2
            while dest.exists():
                dest = dest.parent / f"{stem} ({n}){suffix}"
                n += 1
        dest.write_bytes(data)
        return {"ok": True, "path": str(dest), "name": dest.name}

    @files_router.post("/api/file/mkdir")
    async def file_mkdir(body: dict):
        path_str = str(body.get("path", "")).strip()
        if not path_str:
            raise HTTPException(400, "path required")
        p = Path(path_str)
        p.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "path": str(p)}

    @files_router.delete("/api/file")
    async def file_delete(path: str = Query(...)):
        import shutil as _sh
        p = Path(path)
        if not p.exists():
            raise HTTPException(404, "path not found")
        if p.is_dir():
            _sh.rmtree(str(p))
        else:
            p.unlink()
        return {"ok": True}

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

    def _sidecar_to_api(sidecar: dict) -> dict:
        """Convert sidecar JSON to the API schema the frontend expects."""
        sheets = []
        for sheet in sidecar.get('sheets', []):
            api_cells: dict = {}
            for ref, cd in sheet.get('cells', {}).items():
                api_cd: dict = {}
                v = cd.get('v')
                if v is not None:
                    api_cd['value'] = v
                if 'f' in cd:
                    api_cd['formula'] = cd['f']
                s = cd.get('s', {})
                if s.get('bold'):   api_cd['fontBold']  = True
                if s.get('italic'): api_cd['fontItalic'] = True
                if s.get('fg'):     api_cd['color']     = s['fg']
                if s.get('bg'):     api_cd['bgColor']   = s['bg']
                if s.get('align'):  api_cd['align']     = s['align']
                if api_cd:
                    api_cells[ref] = api_cd
            # Grid dimensions: prefer explicit grid field, fall back to col_widths array
            grid_obj = sheet.get('grid', {})
            col_widths: dict = {str(k): v for k, v in (grid_obj.get('columnIndexToWidth') or {}).items()}
            if not col_widths:
                for i, w in enumerate(sheet.get('col_widths', [])):
                    if w:
                        col_widths[str(i)] = max(30, int(w * 7.5) if w < 50 else w)
            row_heights: dict = {str(k): v for k, v in (grid_obj.get('rowIndexToHeight') or {}).items()}
            sheets.append({
                "sheetName": sheet['name'],
                "cells": api_cells,
                "images": [],
                "columnIndexToWidth": col_widths,
                "rowIndexToHeight": row_heights,
                "hiddenColIndices": [],
                "hiddenRowIndices": [],
                "mergedCellIndices": [],
            })
        p = Path(sidecar.get('xlsx_path', ''))
        return {"id": p.stem, "name": p.stem, "sheets": sheets, "sources": []}

    def _find_excel_worker() -> Path | None:
        candidates = [
            Path(__file__).parent / "bzcode_assets" / "scripts" / "excel-worker.py",
            Path.cwd() / "bzcode_assets" / "scripts" / "excel-worker.py",
        ]
        for c in candidates:
            if c.exists():
                return c
        return None

    @misc_router.get("/api/excel/load")
    async def excel_load(path: str = Query(...)):
        p = Path(path)
        if not p.exists():
            raise HTTPException(404, "file not found")

        # Fast path: sidecar JSON created by excel-worker.py has correct computed values
        json_path = p.parent / f".{p.name}.excel.json"
        if json_path.exists():
            try:
                sidecar = json.loads(json_path.read_text(encoding='utf-8'))
                return _sidecar_to_api(sidecar)
            except Exception:
                pass  # fall through to openpyxl

        # Slow path: parse xlsx with openpyxl (for files not created by excel-worker.py)
        try:
            import openpyxl
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
                for row in ws.iter_rows():
                    for cell in row:
                        cell_id    = cell.coordinate
                        formula    = formula_map.get((ws.title, cell_id))
                        cached_val = cell.value
                        if cached_val is None and not formula:
                            continue
                        cd: dict = {}
                        if cached_val is not None:
                            cd["value"] = str(cached_val) if not isinstance(cached_val, (int, float, bool)) else cached_val
                        if formula:
                            cd["formula"] = formula
                        try:
                            f = cell.font
                            if f.bold:   cd["fontBold"]  = True
                            if f.italic: cd["fontItalic"] = True
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
                sheets.append({"sheetName": ws.title, "cells": cells, "images": [],
                               "columnIndexToWidth": col_widths, "rowIndexToHeight": {},
                               "hiddenColIndices": [], "hiddenRowIndices": [], "mergedCellIndices": []})
            return {"id": p.stem, "name": p.stem, "sheets": sheets, "sources": []}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @misc_router.put("/api/excel/patch")
    async def excel_patch(body: ExcelPatchBody):
        """
        Merge cell updates into the sidecar JSON, re-evaluate all formulas via
        excel-worker.py --recalc, rewrite the xlsx, and return the updated cells
        (all formula cells + the patched cells) so the frontend can re-render.
        """
        p = Path(body.path)
        json_path = p.parent / f".{p.name}.excel.json"
        if not json_path.exists():
            raise HTTPException(404, "sidecar JSON not found — file must be created with excel-worker.py first")

        script = _find_excel_worker()
        if not script:
            raise HTTPException(500, "excel-worker.py not found on server")

        patch_json = json.dumps({"sheet": body.sheet, "cells": body.cells})
        import asyncio as _asyncio
        proc = await _asyncio.create_subprocess_exec(
            sys.executable, str(script),
            "--recalc", str(json_path),
            "--out",    str(p),
            "--patch",  patch_json,
            stdout=_asyncio.subprocess.PIPE,
            stderr=_asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            result = json.loads(stdout)
        except Exception:
            raise HTTPException(500, "excel-worker.py returned invalid output")
        if not result.get("ok"):
            raise HTTPException(500, result.get("error", "recalculation failed"))

        # Return updated sidecar converted to API schema
        sidecar = json.loads(json_path.read_text(encoding='utf-8'))
        return _sidecar_to_api(sidecar)

    @misc_router.get("/api/excel/download")
    async def excel_download(path: str = Query(...)):
        from fastapi.responses import FileResponse
        p = Path(path)
        if not p.exists():
            raise HTTPException(404, "file not found")
        return FileResponse(
            path=str(p),
            filename=p.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    @misc_router.put("/api/excel/grid")
    async def excel_grid(body: ExcelGridBody):
        """Persist column/row dimension changes from frontend drag-resize."""
        p = Path(body.path)
        json_path = p.parent / f".{p.name}.excel.json"
        if not json_path.exists():
            raise HTTPException(404, "sidecar not found")
        sidecar = json.loads(json_path.read_text(encoding='utf-8'))
        target = body.sheet or (sidecar['sheets'][0]['name'] if sidecar.get('sheets') else "")
        for sheet in sidecar.get('sheets', []):
            if sheet['name'] == target:
                if 'grid' not in sheet:
                    sheet['grid'] = {}
                sheet['grid']['columnIndexToWidth'] = body.columnIndexToWidth
                sheet['grid']['rowIndexToHeight']   = body.rowIndexToHeight
                break
        json_path.write_text(json.dumps(sidecar, indent=2, ensure_ascii=False), encoding='utf-8')
        return {"ok": True}

    @misc_router.put("/api/excel/renamesheet")
    async def excel_renamesheet(body: ExcelRenameSheetBody):
        """Rename a sheet in the sidecar JSON."""
        p = Path(body.path)
        json_path = p.parent / f".{p.name}.excel.json"
        if not json_path.exists():
            raise HTTPException(404, "sidecar not found")
        sidecar = json.loads(json_path.read_text(encoding='utf-8'))
        names = {s['name'] for s in sidecar.get('sheets', [])}
        if body.oldName not in names:
            raise HTTPException(404, "sheet not found")
        if body.newName in names and body.newName != body.oldName:
            raise HTTPException(409, "name already in use")
        for sheet in sidecar.get('sheets', []):
            if sheet['name'] == body.oldName:
                sheet['name'] = body.newName
                break
        json_path.write_text(json.dumps(sidecar, indent=2, ensure_ascii=False), encoding='utf-8')
        return {"ok": True, "name": body.newName}

    @misc_router.post("/api/excel/addsheet")
    async def excel_addsheet(body: ExcelAddSheetBody):
        """Append a new empty sheet to the sidecar JSON."""
        p = Path(body.path)
        json_path = p.parent / f".{p.name}.excel.json"
        if not json_path.exists():
            raise HTTPException(404, "sidecar not found")
        sidecar = json.loads(json_path.read_text(encoding='utf-8'))
        existing = {s['name'] for s in sidecar.get('sheets', [])}
        if body.sheetName in existing:
            raise HTTPException(409, "sheet already exists")
        sidecar.setdefault('sheets', []).append({
            "name": body.sheetName,
            "col_widths": [],
            "cells": {},
            "grid": {"columnIndexToWidth": {}, "rowIndexToHeight": {}},
        })
        json_path.write_text(json.dumps(sidecar, indent=2, ensure_ascii=False), encoding='utf-8')
        return {"ok": True, "sheetName": body.sheetName}

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
            import json as _json
            # Ground truth: sidecar JSON takes priority over the binary .pptx
            json_path = p.parent / f".{p.name}.json"
            if json_path.exists():
                data = _json.loads(json_path.read_text())
                slides = data.get("slides", [])
                # Re-export the .pptx whenever the sidecar is newer (nanosecond
                # precision) so the file on disk stays in sync with the app.
                if json_path.stat().st_mtime_ns >= p.stat().st_mtime_ns:
                    try:
                        _pptx_export(p, slides)
                    except Exception:
                        pass
                return {"slides": slides}
            # Fall back: parse .pptx with full extraction
            from pptx import Presentation
            from pptx.oxml.ns import qn as _qn
            import secrets as _sec2
            import base64 as _b64

            prs = Presentation(str(p))
            sw = prs.slide_width
            sh = prs.slide_height
            CW, CH = 896, 504
            sx = CW / sw if sw else 1
            sy = CH / sh if sh else 1

            # ── Build theme color lookup via PPTX zip (works across pptx versions) ─
            theme_colors: dict = {}
            try:
                import zipfile as _zf
                from lxml import etree as _etree
                _NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
                with _zf.ZipFile(str(p)) as _z:
                    _theme_files = sorted(
                        [n for n in _z.namelist() if '/theme/' in n and n.endswith('.xml')]
                    )
                    if _theme_files:
                        _tel = _etree.fromstring(_z.read(_theme_files[0]))
                        _clr = _tel.find(f'.//{{{_NS_A}}}clrScheme')
                        if _clr is not None:
                            for _child in _clr:
                                _tag = _child.tag.split('}')[1]
                                _srgb = _child.find(f'{{{_NS_A}}}srgbClr')
                                _sysc = _child.find(f'{{{_NS_A}}}sysClr')
                                if _srgb is not None:
                                    _v = _srgb.get('val', '')
                                    if len(_v) == 6:
                                        theme_colors[_tag] = f'#{_v.lower()}'
                                elif _sysc is not None:
                                    _last = _sysc.get('lastClr', '')
                                    if len(_last) == 6:
                                        theme_colors[_tag] = f'#{_last.lower()}'
            except Exception:
                pass

            # python-pptx theme color enum → XML slot name
            _THEME_SLOT = {
                1: 'dk1', 2: 'lt1', 3: 'dk2', 4: 'lt2',
                5: 'accent1', 6: 'accent2', 7: 'accent3',
                8: 'accent4', 9: 'accent5', 10: 'accent6',
                11: 'hlink', 12: 'folHlink',
            }

            _NS_A_FULL = 'http://schemas.openxmlformats.org/drawingml/2006/main'

            def _resolve_color(color_obj):
                """Return '#rrggbb' from a pptx color object, or None."""
                try:
                    rgb = color_obj.rgb
                    # RGBColor.__str__ returns 6-char hex (e.g. 'CEC4B6')
                    hex6 = str(rgb)
                    if len(hex6) == 6:
                        return f'#{hex6.lower()}'
                    # Fallback: index access
                    return f'#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}'
                except Exception:
                    pass
                try:
                    tc = color_obj.theme_color
                    tc_int = int(getattr(tc, 'real', tc))
                    slot = _THEME_SLOT.get(tc_int)
                    if slot and slot in theme_colors:
                        raw = theme_colors[slot]
                        # Apply luminance modifier (lum_mod in 1/1000 units)
                        try:
                            lum_mod = color_obj._element.find(
                                f'.//{{{_NS_A_FULL}}}lumMod')
                            if lum_mod is not None:
                                factor = int(lum_mod.get('val', '100000')) / 100000
                                h = raw.lstrip('#')
                                r2, g2, b2 = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
                                r2 = int(min(255, r2 * factor))
                                g2 = int(min(255, g2 * factor))
                                b2 = int(min(255, b2 * factor))
                                return f'#{r2:02x}{g2:02x}{b2:02x}'
                        except Exception:
                            pass
                        return raw
                except Exception:
                    pass
                return None

            def _get_fill(fill_obj, shape_element=None):
                """Return {'type': 'solid'|'gradient'|'none', 'color', 'opacity', 'gradient'}."""
                try:
                    # Check for gradient via XML first (more reliable than python-pptx API)
                    if shape_element is not None:
                        _sp = shape_element.find(_qn('p:spPr'))
                        if _sp is not None:
                            _gf = _sp.find('.//' + _qn('a:gradFill'))
                            if _gf is not None:
                                _lin = _gf.find(_qn('a:lin'))
                                _ang = int(_lin.get('ang', '0')) / 60000.0 if _lin is not None else 0.0
                                _stops = []
                                for _gs in sorted(_gf.findall('.//' + _qn('a:gs')), key=lambda g: int(g.get('pos', '0'))):
                                    _pos = int(_gs.get('pos', '0')) / 100000.0
                                    _c = _color_from_solid_elem(_gs)
                                    if _c:
                                        _stops.append({'pos': _pos, 'color': _c})
                                if _stops:
                                    return {'type': 'gradient', 'color': _stops[0]['color'],
                                            'gradient': {'angle': _ang, 'stops': _stops}}
                    ft = str(fill_obj.type)
                    if ft == 'None' or 'BACKGROUND' in ft:
                        return {'type': 'none'}
                    if 'SOLID' in ft or ft == '1':
                        c = _resolve_color(fill_obj.fore_color)
                        opacity = 1.0
                        try:
                            if shape_element is not None:
                                _sp = shape_element.find(_qn('p:spPr'))
                                _solid = _sp.find('.//' + _qn('a:solidFill')) if _sp is not None else None
                                if _solid is not None:
                                    for _child in _solid:
                                        _alpha = _child.find(f'{{{_NS_A_FULL}}}alpha')
                                        if _alpha is not None:
                                            opacity = int(_alpha.get('val', '100000')) / 100000.0
                                            break
                        except Exception:
                            pass
                        result = {'type': 'solid', 'color': c}
                        if opacity < 0.999:
                            result['opacity'] = round(opacity, 4)
                        return result
                except Exception:
                    pass
                return {'type': 'none'}

            def _color_from_solid_elem(solid_elem):
                """Return '#rrggbb' from an a:solidFill element, or None."""
                _SCHEME_MAP = {'bg1': 'lt1', 'tx1': 'dk1', 'bg2': 'lt2', 'tx2': 'dk2'}
                for _c in solid_elem:
                    _ctag = _c.tag.split('}')[-1]
                    if _ctag == 'srgbClr':
                        _v = _c.get('val', '')
                        return f'#{_v.lower()}' if len(_v) == 6 else None
                    elif _ctag == 'schemeClr':
                        _key = _SCHEME_MAP.get(_c.get('val', ''), _c.get('val', ''))
                        return theme_colors.get(_key)
                    elif _ctag == 'sysClr':
                        _v = _c.get('lastClr', '')
                        return f'#{_v.lower()}' if len(_v) == 6 else None
                return None

            def _get_bg(slide):
                """Resolve background, walking slide → layout → master.
                Returns (color_str, gradient_dict_or_None)."""
                _SCHEME_MAP = {'bg1': 'lt1', 'tx1': 'dk1', 'bg2': 'lt2', 'tx2': 'dk2'}

                def _resolve_scheme(val):
                    return theme_colors.get(_SCHEME_MAP.get(val, val))

                def _color_from_node(node):
                    """Resolve color from schemeClr/srgbClr/sysClr element."""
                    tag = node.tag.split('}')[-1]
                    if tag == 'srgbClr':
                        v = node.get('val', '')
                        return f'#{v.lower()}' if len(v) == 6 else None
                    if tag == 'schemeClr':
                        return _resolve_scheme(node.get('val', ''))
                    if tag == 'sysClr':
                        v = node.get('lastClr', '')
                        return f'#{v.lower()}' if len(v) == 6 else None
                    return None

                def _fill_from_csld(cSld_elem):
                    """Returns (color, gradient) from p:cSld, both may be None."""
                    bg = cSld_elem.find(_qn('p:bg'))
                    if bg is None:
                        return None, None
                    bgPr = bg.find(_qn('p:bgPr'))
                    if bgPr is not None:
                        solid = bgPr.find(_qn('a:solidFill'))
                        if solid is not None:
                            for child in solid:
                                c = _color_from_node(child)
                                if c:
                                    return c, None
                        grad = bgPr.find(_qn('a:gradFill'))
                        if grad is not None:
                            # Angle: DrawingML ang is in 60000ths of a degree,
                            # 0 = left-to-right, increasing clockwise
                            lin = grad.find(_qn('a:lin'))
                            angle_deg = 0.0
                            if lin is not None:
                                angle_deg = int(lin.get('ang', '0')) / 60000.0
                            gs_list = sorted(
                                grad.findall('.//' + _qn('a:gs')),
                                key=lambda g: int(g.get('pos', '0'))
                            )
                            stops = []
                            for gs in gs_list:
                                pos = int(gs.get('pos', '0')) / 100000.0
                                for child in gs:
                                    c = _color_from_node(child)
                                    if c:
                                        stops.append({'pos': pos, 'color': c})
                                        break
                            if stops:
                                fallback = stops[0]['color']
                                return fallback, {'angle': angle_deg, 'stops': stops}
                        return None, None
                    bgRef = bg.find(_qn('p:bgRef'))
                    if bgRef is not None:
                        for child in bgRef:
                            c = _color_from_node(child)
                            if c:
                                return c, None
                    return None, None

                # 1. Slide's own fill
                try:
                    fd = _get_fill(slide.background.fill)
                    if fd['type'] == 'solid' and fd.get('color'):
                        return fd['color'], None
                except Exception:
                    pass

                # 2. Walk up hierarchy
                for src in [slide, slide.slide_layout, slide.slide_layout.slide_master]:
                    try:
                        c, grad = _fill_from_csld(src.background._element)
                        if c:
                            return c, grad
                    except Exception:
                        pass

                return '#ffffff', None

            slides_out = []
            for slide in prs.slides:
                # Slide background
                bg_color = '#ffffff'
                bg_gradient = None
                try:
                    bg_color, bg_gradient = _get_bg(slide)
                except Exception:
                    pass

                def _iter_shapes_flat(shapes):
                    for s in shapes:
                        if s.shape_type == 6:  # MSO_SHAPE_TYPE.GROUP
                            try:
                                yield from _iter_shapes_flat(s.shapes)
                            except Exception:
                                pass
                        else:
                            yield s

                def _extract_geometry(shape):
                    st, cr = 'rect', 0
                    try:
                        sp_pr = shape._element.find(_qn('p:spPr'))
                        if sp_pr is not None:
                            pg = sp_pr.find('.//' + _qn('a:prstGeom'))
                            if pg is not None:
                                prst = pg.get('prst', 'rect')
                                st = prst  # pass through actual preset name
                                if prst == 'roundRect':
                                    cr = 33.334  # OOXML default adj=16667
                                    av = pg.find(_qn('a:avLst'))
                                    if av is not None:
                                        for gd in av:
                                            fmla = gd.get('fmla', '')
                                            if fmla.startswith('val '):
                                                try:
                                                    cr = int(fmla.split()[1]) / 500
                                                except Exception:
                                                    pass
                    except Exception:
                        pass
                    return st, cr

                def _get_layout_ph_defaults(shape):
                    """Extract text style defaults from the matching layout placeholder."""
                    defaults = {}
                    try:
                        ph_fmt = shape.placeholder_format
                        if ph_fmt is None:
                            return defaults
                        layout = shape.part.slide.slide_layout
                        for lshp in layout.shapes:
                            try:
                                lpf = lshp.placeholder_format
                                if lpf is None or lpf.idx != ph_fmt.idx:
                                    continue
                                sp = lshp._element
                                tx = sp.find(_qn('p:txBody'))
                                if tx is None:
                                    break
                                bpr = tx.find(_qn('a:bodyPr'))
                                if bpr is not None:
                                    anchor = bpr.get('anchor', '')
                                    if anchor:
                                        defaults['textAnchor'] = anchor
                                lst = tx.find(_qn('a:lstStyle'))
                                if lst is not None:
                                    lvl1 = lst.find(_qn('a:lvl1pPr'))
                                    if lvl1 is not None:
                                        drpr = lvl1.find(_qn('a:defRPr'))
                                        if drpr is not None:
                                            sz = drpr.get('sz')
                                            if sz:
                                                defaults['fontSize'] = int(sz) // 100
                                            if drpr.get('b') == '1':
                                                defaults['bold'] = True
                                            if drpr.get('cap', '') == 'all':
                                                defaults['allCaps'] = True
                                            solid = drpr.find(_qn('a:solidFill'))
                                            if solid is not None:
                                                c = _color_from_solid_elem(solid)
                                                if c:
                                                    defaults['color'] = c
                                break
                            except Exception:
                                continue
                    except Exception:
                        pass
                    return defaults

                boxes = []

                # ── Layout non-placeholder shapes (connectors, rects) ─────────
                try:
                    for lshp in slide.slide_layout.shapes:
                        try:
                            if lshp.shape_type == 14:  # placeholder — skip
                                continue
                            lx = int((lshp.left or 0) * sx)
                            ly = int((lshp.top or 0) * sy)
                            sw_emu = lshp.width or 0
                            sh_emu = lshp.height or 0

                            if lshp.shape_type == 9:  # connector / line
                                ln_w_px = max(1, int(25400 * sx))  # default 2pt
                                ln_color = '#888888'
                                spPr2 = lshp._element.find(_qn('p:spPr'))
                                if spPr2 is not None:
                                    ln_el = spPr2.find(_qn('a:ln'))
                                    if ln_el is not None:
                                        ln_w_px = max(1, int(int(ln_el.get('w', '25400')) * sx))
                                        sol2 = ln_el.find(_qn('a:solidFill'))
                                        if sol2 is not None:
                                            c2 = _color_from_solid_elem(sol2)
                                            if c2:
                                                ln_color = c2
                                if sw_emu == 0:
                                    bw, bh = ln_w_px, max(1, int(sh_emu * sy))
                                    bx = lx - ln_w_px // 2
                                    by_ = ly
                                elif sh_emu == 0:
                                    bw, bh = max(1, int(sw_emu * sx)), ln_w_px
                                    bx = lx
                                    by_ = ly - ln_w_px // 2
                                else:
                                    bx, by_ = lx, ly
                                    bw = max(1, int(sw_emu * sx))
                                    bh = max(1, int(sh_emu * sy))
                                boxes.append({
                                    'id': _sec2.token_hex(4),
                                    'x': bx, 'y': by_, 'w': bw, 'h': bh,
                                    'rotation': 0, 'shapeType': 'rect',
                                    'text': '', 'styles': [],
                                    'boxStyle': {'bgColor': ln_color},
                                })
                            elif lshp.shape_type == 1:  # rectangle
                                _fd2 = {'type': 'none'}
                                _grad2 = None
                                _spPr2 = lshp._element.find(_qn('p:spPr'))
                                if _spPr2 is not None:
                                    _sol2 = _spPr2.find('.//' + _qn('a:solidFill'))
                                    if _sol2 is not None:
                                        _c2 = _color_from_solid_elem(_sol2)
                                        if _c2:
                                            _fd2 = {'type': 'solid', 'color': _c2}
                                    _gf2 = _spPr2.find('.//' + _qn('a:gradFill'))
                                    if _gf2 is not None and _fd2['type'] == 'none':
                                        _lin2 = _gf2.find(_qn('a:lin'))
                                        _ang2 = int(_lin2.get('ang', '0')) / 60000.0 if _lin2 is not None else 0.0
                                        _stops2 = []
                                        for _gs2 in sorted(_gf2.findall('.//' + _qn('a:gs')), key=lambda g: int(g.get('pos','0'))):
                                            _pos2 = int(_gs2.get('pos', '0')) / 100000.0
                                            # gs children are color nodes — reuse _color_from_solid_elem trick
                                            _c2 = _color_from_solid_elem(_gs2)
                                            if _c2:
                                                _stops2.append({'pos': _pos2, 'color': _c2})
                                        if _stops2:
                                            _fd2 = {'type': 'solid', 'color': _stops2[0]['color']}
                                            _grad2 = {'angle': _ang2, 'stops': _stops2}
                                if _fd2.get('type') == 'solid' or _grad2:
                                    _bs2 = {'bgColor': _fd2.get('color', 'transparent')}
                                    if _grad2:
                                        _bs2['bgGradient'] = _grad2
                                    boxes.append({
                                        'id': _sec2.token_hex(4),
                                        'x': lx, 'y': ly,
                                        'w': max(1, int(sw_emu * sx)),
                                        'h': max(1, int(sh_emu * sy)),
                                        'rotation': 0, 'shapeType': 'rect',
                                        'text': '', 'styles': [],
                                        'boxStyle': _bs2,
                                    })
                        except Exception:
                            pass
                except Exception:
                    pass

                for shape in _iter_shapes_flat(slide.shapes):
                    try:
                        box_id = _sec2.token_hex(4)
                        x = int((shape.left or 0) * sx)
                        y = int((shape.top or 0) * sy)
                        w = max(1, int((shape.width or 100) * sx))
                        h = max(1, int((shape.height or 50) * sy))
                        rotation = float(getattr(shape, 'rotation', 0) or 0)

                        # ── Image shapes (type=13 or picture placeholder type=14) ──
                        _is_picture = shape.shape_type == 13
                        if not _is_picture and not shape.has_text_frame:
                            try:
                                _blob_test = shape.image.blob
                                _is_picture = True
                            except Exception:
                                pass
                        if _is_picture:
                            try:
                                img_bytes = shape.image.blob
                                ct = shape.image.content_type or 'image/png'
                                img_b64 = _b64.b64encode(img_bytes).decode()
                                boxes.append({
                                    'id': box_id, 'x': x, 'y': y, 'w': w, 'h': h,
                                    'rotation': rotation,
                                    'imageData': f'data:{ct};base64,{img_b64}',
                                    'shapeType': 'rect',
                                    'text': '', 'styles': [], 'boxStyle': {},
                                })
                            except Exception:
                                pass
                            continue

                        # ── Pure geometric shapes (no text frame) ──────────
                        if not shape.has_text_frame:
                            _st, _cr = _extract_geometry(shape)
                            _fd = {'type': 'none'}
                            try:
                                _fd = _get_fill(shape.fill, shape._element)
                            except Exception:
                                pass
                            if _fd.get('type') != 'none' or _st != 'rect':
                                _bs = {'bgColor': 'transparent'}
                                if _fd.get('type') in ('solid', 'gradient') and _fd.get('color'):
                                    _bs['bgColor'] = _fd['color']
                                if _fd.get('type') == 'gradient' and _fd.get('gradient'):
                                    _bs['bgGradient'] = _fd['gradient']
                                # Read border/line
                                try:
                                    _spPr = shape._element.find(_qn('p:spPr'))
                                    if _spPr is not None:
                                        _ln = _spPr.find(_qn('a:ln'))
                                        if _ln is not None and _ln.find(_qn('a:noFill')) is None:
                                            _ln_w_emu = int(_ln.get('w', '0') or '0')
                                            if _ln_w_emu > 0:
                                                _ln_sol = _ln.find(_qn('a:solidFill'))
                                                _ln_color = '#000000'
                                                if _ln_sol is not None:
                                                    _lc = _color_from_solid_elem(_ln_sol)
                                                    if _lc:
                                                        _ln_color = _lc
                                                _bs['borderColor'] = _ln_color
                                                _bs['borderWidth'] = round(_ln_w_emu / 12700, 1)
                                except Exception:
                                    pass
                                boxes.append({
                                    'id': box_id, 'x': x, 'y': y, 'w': w, 'h': h,
                                    'rotation': rotation,
                                    'shapeType': _st,
                                    'cornerRadius': _cr,
                                    'fill': _fd,
                                    'text': '', 'styles': [], 'boxStyle': _bs,
                                })
                            continue

                        # ── Geometry ───────────────────────────────────────
                        shape_type, corner_radius = _extract_geometry(shape)

                        # ── Fill ──────────────────────────────────────────
                        fill_dict = {'type': 'none'}
                        try:
                            fill_dict = _get_fill(shape.fill, shape._element)
                        except Exception:
                            pass

                        # ── Rich text paragraphs ──────────────────────────
                        tf = shape.text_frame
                        paras_out = []
                        box_style: dict = {'bgColor': 'transparent'}
                        first_done = False

                        for para in tf.paragraphs:
                            # Alignment
                            align_str = 'left'
                            try:
                                from pptx.enum.text import PP_ALIGN
                                al = para.alignment
                                if al == PP_ALIGN.CENTER:
                                    align_str = 'center'
                                elif al == PP_ALIGN.RIGHT:
                                    align_str = 'right'
                            except Exception:
                                pass

                            # Space before (EMU → points: 1pt = 12700 EMU)
                            space_before = 0
                            try:
                                sb = para.space_before
                                if sb is not None:
                                    space_before = round(float(sb) / 12700, 1)
                            except Exception:
                                pass

                            runs_out = []
                            para_text_parts = []
                            for run in para.runs:
                                rt = run.text or ''
                                if not rt:
                                    continue
                                para_text_parts.append(rt)
                                rs: dict = {'text': rt}
                                try:
                                    if run.font.size:
                                        rs['fontSize'] = int(run.font.size / 12700)
                                except Exception:
                                    pass
                                try:
                                    if run.font.bold:
                                        rs['bold'] = True
                                except Exception:
                                    pass
                                try:
                                    if run.font.italic:
                                        rs['italic'] = True
                                except Exception:
                                    pass
                                try:
                                    if run.font.underline:
                                        rs['underline'] = True
                                except Exception:
                                    pass
                                try:
                                    fn = run.font.name
                                    if fn:
                                        rs['fontFamily'] = fn
                                except Exception:
                                    pass
                                try:
                                    c = _resolve_color(run.font.color)
                                    if c:
                                        rs['color'] = c
                                except Exception:
                                    pass
                                runs_out.append(rs)

                                # Build boxStyle from first run
                                if not first_done:
                                    if 'fontSize' in rs:
                                        box_style['fontSize'] = rs['fontSize']
                                    if rs.get('bold'):
                                        box_style['fontWeight'] = 'bold'
                                    if rs.get('italic'):
                                        box_style['fontStyle'] = 'italic'
                                    if 'color' in rs:
                                        box_style['color'] = rs['color']
                                    if 'fontFamily' in rs:
                                        box_style['fontFamily'] = rs['fontFamily']
                                    box_style['textAlign'] = align_str
                                    first_done = True

                            para_text = ''.join(para_text_parts)
                            if para_text or runs_out:
                                paras_out.append({
                                    'text': para_text,
                                    'align': align_str,
                                    'spaceBefore': space_before,
                                    'runs': runs_out,
                                })

                        # Fill color to boxStyle bgColor
                        if fill_dict.get('type') in ('solid', 'gradient') and fill_dict.get('color'):
                            box_style['bgColor'] = fill_dict['color']
                        if fill_dict.get('type') == 'gradient' and fill_dict.get('gradient'):
                            box_style['bgGradient'] = fill_dict['gradient']

                        # Border/line from shape XML
                        try:
                            _spPr_t = shape._element.find(_qn('p:spPr'))
                            if _spPr_t is not None:
                                _ln_t = _spPr_t.find(_qn('a:ln'))
                                if _ln_t is not None and _ln_t.find(_qn('a:noFill')) is None:
                                    _ln_w_emu_t = int(_ln_t.get('w', '0') or '0')
                                    if _ln_w_emu_t > 0:
                                        _ln_sol_t = _ln_t.find(_qn('a:solidFill'))
                                        _ln_color_t = '#000000'
                                        if _ln_sol_t is not None:
                                            _lct = _color_from_solid_elem(_ln_sol_t)
                                            if _lct:
                                                _ln_color_t = _lct
                                        box_style['borderColor'] = _ln_color_t
                                        box_style['borderWidth'] = round(_ln_w_emu_t / 12700, 1)
                        except Exception:
                            pass

                        # Text vertical anchor from bodyPr
                        try:
                            _txBody_t = shape._element.find(_qn('p:txBody'))
                            if _txBody_t is not None:
                                _bpr_t = _txBody_t.find(_qn('a:bodyPr'))
                                if _bpr_t is not None:
                                    _anchor = _bpr_t.get('anchor', '')
                                    if _anchor:
                                        box_style['textAnchor'] = _anchor
                        except Exception:
                            pass

                        # Apply layout placeholder defaults for missing styles
                        try:
                            if shape.shape_type == 14:
                                ld = _get_layout_ph_defaults(shape)
                                if ld:
                                    if 'textAnchor' in ld:
                                        box_style['textAnchor'] = ld['textAnchor']
                                    if 'fontSize' in ld and 'fontSize' not in box_style:
                                        box_style['fontSize'] = ld['fontSize']
                                    if ld.get('bold') and 'fontWeight' not in box_style:
                                        box_style['fontWeight'] = 'bold'
                                    if ld.get('allCaps'):
                                        box_style['allCaps'] = True
                                    if 'color' in ld and 'color' not in box_style:
                                        box_style['color'] = ld['color']
                        except Exception:
                            pass

                        full_text = '\n'.join(p['text'] for p in paras_out)
                        boxes.append({
                            'id': box_id, 'x': x, 'y': y, 'w': w, 'h': h,
                            'rotation': rotation,
                            'shapeType': shape_type,
                            'cornerRadius': corner_radius,
                            'fill': fill_dict,
                            'text': full_text,
                            'paragraphs': paras_out,
                            'styles': [],
                            'boxStyle': box_style,
                        })
                    except Exception:
                        pass

                slide_out = {'bgColor': bg_color, 'boxes': boxes,
                            'slideWidthPt': int(sw / 12700)}
                if bg_gradient:
                    slide_out['bgGradient'] = bg_gradient
                slides_out.append(slide_out)
            return {"slides": slides_out}
        except Exception as exc:
            raise HTTPException(500, str(exc))

    @misc_router.put("/api/ppt/save")
    async def ppt_save(body: PptSaveBody):
        if not body.path:
            raise HTTPException(400, "path required")
        if not body.slides:
            raise HTTPException(400, "slides cannot be empty")
        try:
            import json as _json, tempfile, shutil as _shutil, os as _os
            from pptx import Presentation
            from pptx.util import Emu, Pt
            from pptx.dml.color import RGBColor

            CW, CH = 896, 504
            p = Path(body.path)
            json_path = p.parent / f".{p.name}.json"
            p.parent.mkdir(parents=True, exist_ok=True)

            def hex_to_rgb(hex_str: str):
                h = hex_str.lstrip("#")
                if len(h) == 6:
                    try:
                        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
                    except Exception:
                        pass
                return None

            # 1. Write JSON sidecar atomically (ground truth)
            tmp_fd, tmp_name = tempfile.mkstemp(suffix=".json", dir=p.parent)
            try:
                _os.close(tmp_fd)
                Path(tmp_name).write_text(_json.dumps({"slides": body.slides}))
                _shutil.move(tmp_name, str(json_path))
            except Exception:
                try: _os.unlink(tmp_name)
                except OSError: pass
                raise

            # 2. Re-export to .pptx for compatibility
            _pptx_export(p, body.slides)
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

    @db_router.get("/widget/{canvas_id}/schema")
    async def widget_schema_get(canvas_id: str = FPath(...)):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, f"Invalid canvasId: {canvas_id!r}")
        data = _widget_load(canvas_id)
        return {"columns": data.get("_schema", []), "rowCount": len(data.get("records", []))}

    @db_router.post("/widget/{canvas_id}/schema")
    async def widget_schema_ensure(canvas_id: str, body: WidgetSchemaBody):
        if not _CANVAS_ID_RE.match(canvas_id):
            raise HTTPException(400, f"Invalid canvasId: {canvas_id!r}")
        with _widget_lock(canvas_id):
            data = _widget_load(canvas_id)
            existing = {c["name"]: c for c in data.get("_schema", []) if "name" in c}
            for col in body.columns:
                if "name" in col and col["name"] not in existing:
                    existing[col["name"]] = col
            data["_schema"] = list(existing.values())
            _widget_save(canvas_id, data)
        return {"columns": data["_schema"], "rowCount": len(data.get("records", []))}

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
    async def batch_run(body: BatchRunBody):
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

        asyncio.create_task(_run())
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
        # Serve real files, fall back to index.html.
        # Guard against OSError ENAMETOOLONG (e.g. gateway injects JWT into URL path).
        try:
            candidate = dist_dir / full_path
            if candidate.is_file():
                return FileResponse(str(candidate))
        except OSError:
            pass
        return FileResponse(str(index_html))

    print(f"[frontend] serving {dist_dir}", file=sys.stderr)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="BoltzAgent FastAPI server")
    parser.add_argument("--bzcode",  default="bzcode")
    parser.add_argument("--host",    default="localhost")
    parser.add_argument("--port",    type=int, default=18789)
    parser.add_argument("--cwd",     default=os.getcwd())
    parser.add_argument("--bz-home", default="", dest="bz_home",
                        help="BZ_HOME directory for bzcode credentials, sessions and settings")
    parser.add_argument("--dist",    default="", metavar="DIR",
                        help="Vite dist/ directory to serve as the SPA frontend")
    args = parser.parse_args()

    import shutil as _shutil
    bzcode_path = _shutil.which(args.bzcode) or args.bzcode
    default_cwd = os.path.abspath(args.cwd)
    _bz_home_raw = args.bz_home or os.environ.get("BZ_HOME", "")
    bz_home      = os.path.abspath(_bz_home_raw) if _bz_home_raw else ""

    fastapi_app = create_app(bzcode_path=bzcode_path, default_cwd=default_cwd,
                              bz_home=bz_home, port=args.port)

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
#   BZCODE_PATH   path to the bzcode binary  (default: bzcode, resolved via PATH)
#   BZCODE_CWD    default working directory   (default: current directory)
#   BZ_HOME       bzcode home dir for credentials/sessions/settings (recommended on servers)
#   PORT          HTTP port                   (default: 18789)
#   BZCODE_DIST   path to Vite dist/ folder   (default: ./dist if it exists)
import re, shutil as _shutil_mod
app = create_app(
    bzcode_path=_shutil_mod.which(os.environ.get("BZCODE_PATH", "bzcode")) or os.environ.get("BZCODE_PATH", "bzcode"),
    default_cwd=os.path.abspath(os.environ.get("BZCODE_CWD", os.getcwd())),
    bz_home=os.environ.get("BZ_HOME", ""),
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
