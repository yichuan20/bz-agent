#!/usr/bin/env python3
"""
Unified server:
  ws://localhost:8765?cwd=/path   — start a fresh bzcode session in that dir
  ws://localhost:8765?sessionId=X — resume an existing session
  http://localhost:8766/sessions  — list sessions (one per directory)
  http://localhost:8766/search    — SerpAPI proxy
"""

import argparse
import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import websockets  # kept for legacy compatibility; WS now runs inside aiohttp
except ImportError:
    websockets = None  # type: ignore[assignment]

try:
    import aiohttp
    from aiohttp import web
except ImportError:
    sys.exit("Missing dependency: pip install aiohttp")

try:
    import asyncpg
except ImportError:
    asyncpg = None  # type: ignore[assignment]

# ── Agent mode configuration ──────────────────────────────────────────────────
# agent_modes.json lives next to server.py. Re-read on every connection so
# edits take effect without a server restart.

_MODES_CONFIG_FILE = Path(__file__).parent / "agent_modes.json"

def _load_mode_config() -> dict:
    try:
        return json.loads(_MODES_CONFIG_FILE.read_text())
    except Exception:
        return {"default": "general", "modes": {}}

def _mode_entry(mode: str) -> dict:
    cfg = _load_mode_config()
    modes = cfg.get("modes", {})
    return modes.get(mode) or modes.get(cfg.get("default", "general"), {}) or {}

def _build_widget_template_table() -> str:
    """Build a markdown table of widget templates from server_data/widgets/index.json.
    Used to inject an up-to-date alias table into the new-widget skill at session-write time."""
    try:
        index_path = SERVER_DATA_DIR / "widgets" / "index.json"
        data = json.loads(index_path.read_text(encoding="utf-8"))
        widgets = [w for w in data.get("widgets", []) if not w.get("archived")]
    except Exception:
        return "(template index unavailable)"

    lines = ["| Template | Matches requests like… | Default size |",
             "|---|---|---|"]
    for w in widgets:
        name     = w.get("id", "")
        label    = w.get("label", name)
        keywords = ", ".join(w.get("keywords", [])[:6])
        dw, dh   = w.get("defaultW", 380), w.get("defaultH", 280)
        lines.append(f"| `{name}` | {label}: {keywords} | {dw}×{dh} |")
    return "\n".join(lines)


def _write_session_config(session_id: str, mode: str, working_dir: str = "") -> None:
    """Write IDENTITY.md, SOUL.md, settings.json, and meta.json into the session
    config directory before spawning bzcode.  bzcode picks these up at startup and
    on every --resume, so they are re-applied on reconnect too.
    meta.json is our own metadata (not read by bzcode) used by _read_session_file."""
    import shutil as _shutil

    entry = _mode_entry(mode)
    cfg_dir = SESSIONS_DIR / session_id
    cfg_dir.mkdir(parents=True, exist_ok=True)

    # Purge sub-agent session files/dirs that bzcode's Agent tool leaves inside
    # the config dir (e.g. cozy-hopping-comet.jsonl, tool-results/).  They are
    # not part of our config and prevent bzcode from resuming cleanly.
    _OWNED_NAMES = {"meta.json", "IDENTITY.md", "SOUL.md", "AGENTS.md", "settings.json", "skills"}
    for item in list(cfg_dir.iterdir()):
        if item.name not in _OWNED_NAMES:
            if item.is_dir():
                _shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)

    # Our own metadata — used by _read_session_file since new bzcode no longer
    # writes a session header line into the .jsonl
    meta = {"sessionId": session_id, "workingDir": working_dir, "mode": mode}
    (cfg_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # IDENTITY.md — who the agent is
    identity = entry.get("identity", "")
    if identity:
        (cfg_dir / "IDENTITY.md").write_text(f"# Identity\n\n{identity}\n", encoding="utf-8")
    else:
        # Remove stale config from a previous mode
        (cfg_dir / "IDENTITY.md").unlink(missing_ok=True)

    # SOUL.md — how the agent behaves (optional, falls back to project/user default)
    soul = entry.get("soul")
    if soul:
        (cfg_dir / "SOUL.md").write_text(soul, encoding="utf-8")
    else:
        (cfg_dir / "SOUL.md").unlink(missing_ok=True)

    # AGENTS.md — workflow instructions; session-level replaces project/user AGENTS.md entirely.
    # Used to tell the agent to invoke skills proactively rather than waiting for the user.
    agents_md = entry.get("agents_md")
    if agents_md:
        (cfg_dir / "AGENTS.md").write_text(agents_md, encoding="utf-8")
    else:
        (cfg_dir / "AGENTS.md").unlink(missing_ok=True)

    # settings.json — tools, model, permissions, etc.
    settings = entry.get("settings")
    if settings:
        (cfg_dir / "settings.json").write_text(json.dumps(settings, indent=2), encoding="utf-8")
    else:
        (cfg_dir / "settings.json").unlink(missing_ok=True)

    # skills/{name}/SKILL.md — session-specific skills (only available to this mode)
    skills_dir = cfg_dir / "skills"
    # Remove any stale skills from a previous mode first
    if skills_dir.exists():
        _shutil.rmtree(skills_dir)
    skills = entry.get("skills", {})
    for skill_name, skill_content in skills.items():
        # Resolve placeholders so skills can reference local paths
        scripts_dir = Path(__file__).resolve().parent / "bzcode" / "scripts"
        resolved = (skill_content
            .replace("{server_data_path}", str(SERVER_DATA_DIR))
            .replace("{scripts_path}",     str(scripts_dir))
            .replace("{working_dir}",      working_dir)
            .replace("{widget_template_table}", _build_widget_template_table())
        )
        skill_path = skills_dir / skill_name / "SKILL.md"
        skill_path.parent.mkdir(parents=True, exist_ok=True)
        skill_path.write_text(resolved, encoding="utf-8")


# ── Database configuration ────────────────────────────────────────────────────
# Override any of these with environment variables:
#   export BZ_DB_HOST=localhost BZ_DB_PORT=5432 BZ_DB_NAME=bz_agent ...
DB_CONFIG = {
    "host":     os.environ.get("BZ_DB_HOST",     "localhost"),
    "port":     int(os.environ.get("BZ_DB_PORT", "5432")),
    "database": os.environ.get("BZ_DB_NAME",     "bz_agent"),
    "user":     os.environ.get("BZ_DB_USER",     "bz_agent"),
    "password": os.environ.get("BZ_DB_PASSWORD", "bz_agent_secret"),
}

# Bzcode session files (written by bzcode itself — location is fixed)
SESSIONS_DIR  = Path.home() / ".boltzbit" / "sessions"

# Tracks cwds with an active WebSocket / bzcode process
_active_cwds  = set()  # type: ignore[var-annotated]
# Tracks cwds where bzcode is actively processing a request (status: running)
_running_cwds = set()  # type: ignore[var-annotated]
_TITLES_FILE   = SESSIONS_DIR / "_titles.json"
_DEFAULTS_FILE = SESSIONS_DIR / "_defaults.json"  # cwd -> sessionId

# Accumulated token usage since server start (counts every result message)
_token_stats: dict = {"input": 0, "output": 0, "total": 0}

def _add_tokens(usage: dict) -> None:
    inp = int(usage.get("inputTokens", 0) or 0)
    out = int(usage.get("outputTokens", 0) or 0)
    _token_stats["input"]  += inp
    _token_stats["output"] += out
    _token_stats["total"]  += inp + out


def _load_titles() -> dict:
    try:
        return json.loads(_TITLES_FILE.read_text())
    except Exception:
        return {}


def _save_title(session_id: str, title: str) -> None:
    titles = _load_titles()
    titles[session_id] = title
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    _TITLES_FILE.write_text(json.dumps(titles, indent=2))


def _load_defaults() -> dict:
    try:
        return json.loads(_DEFAULTS_FILE.read_text())
    except Exception:
        return {}


def _save_default(cwd: str, session_id: str) -> None:
    defaults = _load_defaults()
    defaults[cwd] = session_id
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    _DEFAULTS_FILE.write_text(json.dumps(defaults, indent=2))


def _clear_default(cwd: str) -> None:
    defaults = _load_defaults()
    defaults.pop(cwd, None)
    _DEFAULTS_FILE.write_text(json.dumps(defaults, indent=2))

# Server-local data — lives alongside server.py so it travels with the project
SERVER_DATA_DIR = (Path(__file__).resolve().parent / "server_data")

# ── Custom widget code store ──────────────────────────────────────────────────
# Canvas-edited widget code lives here, keyed by canvasId.
# Separate from server_data/widgets/ (toolbar templates) so edited instances
# don't pollute the template list.
CUSTOM_WIDGETS_DIR = SERVER_DATA_DIR / "custom_widgets"


async def handle_get_custom_widget(request: web.Request) -> web.Response:
    """GET /custom-widgets/{canvasId} — read saved code for a canvas widget instance."""
    canvas_id = request.match_info.get("canvasId", "")
    p = CUSTOM_WIDGETS_DIR / f"{canvas_id}.js"
    if not p.exists():
        return web.json_response({"error": "not found"}, status=404, headers=CORS_HEADERS)
    return web.json_response({"canvasId": canvas_id, "code": p.read_text(encoding="utf-8")},
                             headers=CORS_HEADERS)


async def handle_put_custom_widget(request: web.Request) -> web.Response:
    """PUT /custom-widgets/{canvasId} { code } — save edited code for a canvas widget instance."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    canvas_id = request.match_info.get("canvasId", "")
    if not canvas_id:
        return web.json_response({"error": "canvasId required"}, status=400, headers=CORS_HEADERS)
    try:
        body = await request.json()
        code = str(body.get("code", ""))
        CUSTOM_WIDGETS_DIR.mkdir(parents=True, exist_ok=True)
        (CUSTOM_WIDGETS_DIR / f"{canvas_id}.js").write_text(code, encoding="utf-8")
        return web.json_response({"ok": True, "canvasId": canvas_id}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_delete_custom_widget(request: web.Request) -> web.Response:
    """DELETE /custom-widgets/{canvasId} — remove saved custom code."""
    canvas_id = request.match_info.get("canvasId", "")
    p = CUSTOM_WIDGETS_DIR / f"{canvas_id}.js"
    if p.exists():
        p.unlink()
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


# ── Session reader ────────────────────────────────────────────────────────────

def _read_session_file(path: Path) -> Optional[dict]:
    """Parse a session JSONL and return metadata.  Handles two formats:

    Old format (bzcode < new version):
      Line 0: {"type": "session", "sessionId": "...", "workingDir": "..."}
      Lines 1+: message objects

    New format (bzcode >= new version):
      No header — messages start on line 0.
      workingDir/sessionId are read from {sessionId}/meta.json written by us.
    """
    try:
        with open(path, encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]
        if not lines:
            return None

        # Detect format from first line
        first = json.loads(lines[0])
        session_id  = path.stem
        working_dir = ""
        created     = ""

        if first.get("type") == "session":
            # ── Old format: first line is the session header ──────────────────
            working_dir = first.get("workingDir", "")
            session_id  = first.get("sessionId", path.stem)
            created     = first.get("created", "")
            msg_lines   = lines[1:]
        else:
            # ── New format: no header, look up our meta.json ──────────────────
            meta_file = SESSIONS_DIR / session_id / "meta.json"
            if meta_file.exists():
                try:
                    meta        = json.loads(meta_file.read_text())
                    working_dir = meta.get("workingDir", "")
                    session_id  = meta.get("sessionId", session_id)
                except Exception:
                    pass
            if not working_dir:
                return None   # can't place this session in any project
            msg_lines = lines

        # Walk messages to extract title and last preview
        title        = ""
        last_preview = ""
        msg_count    = 0
        for line in msg_lines:
            try:
                msg = json.loads(line)
                if msg.get("role") == "user":
                    msg_count += 1
                    content = msg.get("content", "")
                    text = ""
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "")
                                break
                    if not title and text:
                        title = text[:60]
                    if text:
                        last_preview = text[:150]
            except json.JSONDecodeError:
                pass

        # Read agent mode from our meta.json
        agent_mode = "general"
        meta_file = SESSIONS_DIR / session_id / "meta.json"
        if meta_file.exists():
            try:
                agent_mode = json.loads(meta_file.read_text()).get("mode", "general")
            except Exception:
                pass

        stat          = path.stat()
        custom_titles = _load_titles()
        return {
            "sessionId":    session_id,
            "workingDir":   working_dir,
            "dirName":      Path(working_dir).name if working_dir else "Unknown",
            "messageCount": msg_count,
            "title":        custom_titles.get(session_id) or title or "(empty)",
            "lastMessage":  last_preview,
            "lastModified": stat.st_mtime,
            "created":      created,
            "mode":         agent_mode,
        }
    except Exception:
        return None


# ── HTTP handlers ─────────────────────────────────────────────────────────────

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


async def handle_options(request: web.Request) -> web.Response:
    return web.Response(headers=CORS_HEADERS)


async def handle_auth(request: web.Request) -> web.Response:
    """
    Receive an access token from the frontend and write it to
    ~/.boltzbit/credentials.json so bzcode can authenticate.

    Body: { accessToken, refreshToken?, expiresAt?, authUrl? }
    """
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)

    access_token  = body.get("accessToken", "")
    refresh_token = body.get("refreshToken", "")
    expires_at    = body.get("expiresAt")       # milliseconds epoch, optional
    auth_url      = body.get("authUrl", "https://boltzhub.com")

    if not access_token:
        return web.json_response({"error": "accessToken is required"}, status=400, headers=CORS_HEADERS)

    creds_dir  = Path.home() / ".boltzbit"
    creds_file = creds_dir / "credentials.json"

    creds_dir.mkdir(parents=True, exist_ok=True)

    # Merge with existing credentials so other env entries are preserved
    existing: dict = {}
    if creds_file.exists():
        try:
            with open(creds_file) as f:
                existing = json.load(f)
        except Exception:
            pass

    entry: dict = {"accessToken": access_token}
    if refresh_token:
        entry["refreshToken"] = refresh_token
    if expires_at is not None:
        entry["expiresAt"] = expires_at

    existing[auth_url] = entry

    with open(creds_file, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"[auth] credentials written for {auth_url}", file=sys.stderr)
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


# ── Widget storage ────────────────────────────────────────────────────────────
#
# Layout inside server_data/widgets/:
#   index.json          — metadata for all widgets (no code)
#   {id}.js             — code for each widget (one file per widget)
#
# This keeps the search index lean and lets code files be edited directly.

WIDGETS_DIR   = SERVER_DATA_DIR / "widgets"
WIDGETS_INDEX = WIDGETS_DIR / "index.json"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_index() -> dict:
    """Load index.json; returns empty structure if missing or corrupt."""
    if not WIDGETS_INDEX.exists():
        return {"version": 1, "widgets": []}
    try:
        with open(WIDGETS_INDEX, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"version": 1, "widgets": []}


def _save_index(data: dict) -> None:
    WIDGETS_DIR.mkdir(parents=True, exist_ok=True)
    with open(WIDGETS_INDEX, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _code_path(widget_id: str) -> Path:
    """Return the .js file path for a widget id."""
    # Sanitise id so it's safe as a filename
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in widget_id)
    return WIDGETS_DIR / f"{safe}.js"


def _load_code(widget_id: str) -> str:
    path = _code_path(widget_id)
    if not path.exists():
        return ""
    with open(path, encoding="utf-8") as f:
        return f.read()


def _save_code(widget_id: str, code: str) -> None:
    WIDGETS_DIR.mkdir(parents=True, exist_ok=True)
    with open(_code_path(widget_id), "w", encoding="utf-8") as f:
        f.write(code)


def _load_creds() -> dict:
    creds_file = SERVER_DATA_DIR / "credentials.json"
    if not creds_file.exists():
        return {}
    try:
        with open(creds_file, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


_PLACEHOLDER_RE = re.compile(r'\{\{(\w+)\}\}')


def _resolve(text: str, creds: dict) -> str:
    """Replace {{KEY}} placeholders with stored credential values."""
    return _PLACEHOLDER_RE.sub(lambda m: creds.get(m.group(1), m.group(0)), text)


async def handle_proxy(request: web.Request) -> web.Response:
    """
    Credential-injecting HTTP proxy for widgets.

    Widget code sends requests here with {{KEY}} placeholders instead of real secrets.
    The server replaces placeholders with stored credentials before forwarding.

    Request body (JSON):
      {
        "url":     "https://api.openai.com/v1/chat/completions",
        "method":  "POST",
        "headers": { "Authorization": "Bearer {{OPENAI_API_KEY}}", ... },
        "body":    "{\"model\": \"gpt-4o\", ...}"   // raw string, placeholders resolved
      }
    """
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)

    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)

    target_url = payload.get("url", "").strip()
    method     = payload.get("method", "GET").upper()
    req_headers = payload.get("headers", {})
    req_body    = payload.get("body", None)  # raw string or None

    if not target_url.startswith("http"):
        return web.json_response({"error": "url must start with http"}, status=400, headers=CORS_HEADERS)

    creds = _load_creds()

    # Resolve {{KEY}} in header values and body string
    resolved_headers = {k: _resolve(str(v), creds) for k, v in req_headers.items()}
    resolved_body    = _resolve(req_body, creds) if isinstance(req_body, str) else req_body

    try:
        # ssl=False — this is a local dev proxy; skip cert verification so sites
        # with self-signed or expired certs (e.g. corp intranets) still load.
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.request(
                method, target_url,
                headers=resolved_headers,
                data=resolved_body,
                allow_redirects=True,
            ) as resp:
                body_bytes   = await resp.read()
                content_type = resp.content_type or "application/octet-stream"

                # Forward response headers — skip hop-by-hop AND content-type
                # (content_type= param below is the sole source; passing both is forbidden)
                skip = {
                    "transfer-encoding", "content-encoding",
                    "connection", "keep-alive", "content-type",
                }
                fwd_headers = {
                    **CORS_HEADERS,
                    **{k: v for k, v in resp.headers.items() if k.lower() not in skip},
                }
                return web.Response(
                    body=body_bytes,
                    status=resp.status,
                    headers=fwd_headers,
                    content_type=content_type,
                )
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=502, headers=CORS_HEADERS)


async def handle_get_credential_keys(request: web.Request) -> web.Response:
    """Return credential key names only (values hidden) — for the management UI listing."""
    creds_file = SERVER_DATA_DIR / "credentials.json"
    if not creds_file.exists():
        return web.json_response({"keys": []}, headers=CORS_HEADERS)
    try:
        with open(creds_file, encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response({"keys": list(data.keys())}, headers=CORS_HEADERS)
    except Exception:
        return web.json_response({"keys": []}, headers=CORS_HEADERS)


async def handle_post_credential(request: web.Request) -> web.Response:
    """Upsert a credential by key."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    key   = body.get("key",   "").strip()
    value = body.get("value", "").strip()
    if not key:
        return web.json_response({"error": "'key' is required"}, status=400, headers=CORS_HEADERS)
    SERVER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = _load_creds()
    data[key] = value
    creds_file = SERVER_DATA_DIR / "credentials.json"
    with open(creds_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return web.json_response({"ok": True, "key": key}, headers=CORS_HEADERS)


async def handle_delete_credential(request: web.Request) -> web.Response:
    """Delete a credential by key."""
    key = request.match_info.get("key", "")
    creds_file = SERVER_DATA_DIR / "credentials.json"
    if not creds_file.exists():
        return web.json_response({"error": "not found"}, status=404, headers=CORS_HEADERS)
    try:
        with open(creds_file, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return web.json_response({"error": "corrupt store"}, status=500, headers=CORS_HEADERS)
    if key not in data:
        return web.json_response({"error": "not found"}, status=404, headers=CORS_HEADERS)
    del data[key]
    with open(creds_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return web.json_response({"ok": True, "deleted": key}, headers=CORS_HEADERS)


async def handle_shell(request: web.Request) -> web.Response:
    """Run a shell command in the default cwd and stream back stdout+stderr."""
    cmd = request.rel_url.query.get("cmd", "").strip()
    cwd = request.rel_url.query.get("cwd", os.getcwd()).strip()
    if not cmd:
        return web.json_response({"error": "cmd is required"}, status=400, headers=CORS_HEADERS)
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cwd if os.path.isdir(cwd) else os.getcwd(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        output = stdout.decode(errors="replace")
        return web.json_response(
            {"output": output, "returncode": proc.returncode},
            headers=CORS_HEADERS,
        )
    except asyncio.TimeoutError:
        return web.json_response({"error": "Command timed out (30 s)"}, status=408, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_files(request: web.Request) -> web.Response:
    """List files and directories at a given path."""
    path_str = request.rel_url.query.get("path", os.getcwd()).strip()
    path = Path(path_str)
    if not path.exists() or not path.is_dir():
        return web.json_response({"error": "path not found or not a directory"}, status=404, headers=CORS_HEADERS)
    try:
        entries = []
        for entry in sorted(path.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            try:
                stat = entry.stat()
                entries.append({
                    "name":     entry.name,
                    "path":     str(entry),
                    "isDir":    entry.is_dir(),
                    "size":     stat.st_size,
                    "modified": stat.st_mtime,
                })
            except (PermissionError, OSError):
                pass
        return web.json_response(
            {"path": str(path), "entries": entries},
            headers=CORS_HEADERS,
        )
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_mkdir(request: web.Request) -> web.Response:
    """POST /files/mkdir { parent, name } — create a new directory."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    parent = body.get("parent", "").strip()
    name   = body.get("name",   "").strip()
    if not parent or not name:
        return web.json_response({"error": "parent and name required"}, status=400, headers=CORS_HEADERS)
    # Sanitise: no path separators in name
    if "/" in name or "\\" in name or name in (".", ".."):
        return web.json_response({"error": "invalid folder name"}, status=400, headers=CORS_HEADERS)
    new_dir = Path(parent) / name
    try:
        new_dir.mkdir(parents=False, exist_ok=False)
        return web.json_response({"path": str(new_dir)}, headers=CORS_HEADERS)
    except FileExistsError:
        return web.json_response({"error": "folder already exists"}, status=409, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_get_canvas(request: web.Request) -> web.Response:
    """Load canvas layout for a working directory."""
    cwd = request.rel_url.query.get("cwd", "").strip()
    if not cwd or not os.path.isdir(cwd):
        return web.json_response({"widgets": []}, headers=CORS_HEADERS)
    canvas_file = Path(cwd) / ".bzcanvas.json"
    if not canvas_file.exists():
        return web.json_response({"widgets": []}, headers=CORS_HEADERS)
    try:
        with open(canvas_file, encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response(data, headers=CORS_HEADERS)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500, headers=CORS_HEADERS)


async def handle_post_canvas(request: web.Request) -> web.Response:
    """Save canvas layout for a working directory."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    cwd = request.rel_url.query.get("cwd", "").strip()
    if not cwd or not os.path.isdir(cwd):
        return web.json_response({"error": "invalid cwd"}, status=400, headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    canvas_file = Path(cwd) / ".bzcanvas.json"
    with open(canvas_file, "w", encoding="utf-8") as f:
        json.dump(body, f, indent=2, ensure_ascii=False)
    return web.json_response({"ok": True, "file": str(canvas_file)}, headers=CORS_HEADERS)


async def handle_deploy_widget(request: web.Request) -> web.Response:
    """
    POST /canvas/deploy-widget
    Deploy a complete widget in one call — the agent uses this to place a
    widget directly onto the user's canvas without manual UI steps.

    Body:
    {
      "cwd":         "/path/to/project",   -- required: project directory
      "title":       "My Widget",           -- required: widget display name
      "code":        "// JS code...",       -- required: self-contained widget JS
      "w":           380,                   -- width  (default 380)
      "h":           280,                   -- height (default 280)
      "x":           null,                  -- x position (auto-placed if null)
      "y":           null,                  -- y position (auto-placed if null)
      "initialData": [{"label":"A","value":1}]  -- optional: seed rows for db
    }

    Returns: { canvasId, widgetId, title, x, y, w, h, canvasFile }
    """
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)

    cwd   = str(body.get("cwd", "")).strip()
    title = str(body.get("title", "Widget")).strip()
    code  = str(body.get("code", "")).strip()
    w     = int(body.get("w", 380))
    h     = int(body.get("h", 280))
    x     = body.get("x")
    y     = body.get("y")
    initial_data = body.get("initialData") or []

    if not cwd or not os.path.isdir(cwd):
        return web.json_response({"error": "invalid cwd"}, status=400, headers=CORS_HEADERS)
    if not code:
        return web.json_response({"error": "code is required"}, status=400, headers=CORS_HEADERS)

    # ── 1. Generate a stable canvas ID ───────────────────────────────────────
    import secrets as _sec
    canvas_id = _sec.token_hex(5)   # 10-char hex, same length as uid() in the frontend

    # ── 2. Save widget code to server_data/custom_widgets/{canvasId}.js ──────
    CUSTOM_WIDGETS_DIR.mkdir(parents=True, exist_ok=True)
    (CUSTOM_WIDGETS_DIR / f"{canvas_id}.js").write_text(code, encoding="utf-8")

    # ── 3. Seed initial data rows if provided ─────────────────────────────────
    if initial_data:
        import datetime as _dt
        widget_data_dir = SERVER_DATA_DIR / "widget_data"
        widget_data_dir.mkdir(parents=True, exist_ok=True)
        data_file = widget_data_dir / f"{canvas_id}.json"
        records   = []
        next_id   = 1
        for row in initial_data:
            row = {k: v for k, v in row.items() if k not in ("id", "created_at")}
            row["id"]         = next_id
            row["created_at"] = _dt.datetime.utcnow().isoformat() + "Z"
            records.append(row)
            next_id += 1
        data_file.write_text(
            json.dumps({"_next_id": next_id, "records": records}, indent=2),
            encoding="utf-8",
        )

    # ── 4. Update .bzcanvas.json — append widget with auto-placement ──────────
    canvas_file = Path(cwd) / ".bzcanvas.json"
    canvas_data: dict = {"version": 1, "widgets": []}
    if canvas_file.exists():
        try:
            canvas_data = json.loads(canvas_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    existing = canvas_data.get("widgets", [])

    # Auto-place: find the first free slot below existing widgets
    if x is None or y is None:
        pad  = 24
        if existing:
            max_y  = max((e.get("y", 0) + e.get("h", 0)) for e in existing)
            place_x = pad
            place_y = max_y + pad
        else:
            place_x = pad
            place_y = pad
        x = x if x is not None else place_x
        y = y if y is not None else place_y

    new_entry = {
        "canvasId": canvas_id,
        "widgetId": canvas_id,   # custom instance — points to custom_widgets/{id}.js
        "kind":     "custom",
        "title":    title,
        "x": x, "y": y, "w": w, "h": h,
    }
    existing.append(new_entry)
    canvas_data["widgets"] = existing
    canvas_file.write_text(json.dumps(canvas_data, indent=2, ensure_ascii=False), encoding="utf-8")

    return web.json_response({
        "ok":        True,
        "canvasId":  canvas_id,
        "widgetId":  canvas_id,
        "title":     title,
        "x": x, "y": y, "w": w, "h": h,
        "canvasFile": str(canvas_file),
        "codePath":  str(CUSTOM_WIDGETS_DIR / f"{canvas_id}.js"),
    }, headers=CORS_HEADERS)


async def handle_get_widgets(request: web.Request) -> web.Response:
    """
    Return all non-archived widgets including their code (read from individual .js files).
    The index holds metadata; code is fetched per-widget from its own .js file.
    """
    data = _load_index()
    result = []
    for entry in data.get("widgets", []):
        if entry.get("archived", False):
            continue
        widget = {**entry, "code": _load_code(entry["id"])}
        result.append(widget)
    return web.json_response({"widgets": result}, headers=CORS_HEADERS)


async def handle_get_widget(request: web.Request) -> web.Response:
    """Return a single widget by id, including its code."""
    widget_id = request.match_info.get("id", "")
    data = _load_index()
    entry = next((w for w in data.get("widgets", []) if w.get("id") == widget_id), None)
    if entry is None:
        return web.json_response({"error": "widget not found"}, status=404, headers=CORS_HEADERS)
    return web.json_response({**entry, "code": _load_code(widget_id)}, headers=CORS_HEADERS)


async def handle_post_widget(request: web.Request) -> web.Response:
    """
    Upsert a widget by id.
    Code is saved to its own .js file; all other fields go into index.json.
    """
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)

    widget_id = body.get("id", "").strip()
    if not widget_id:
        return web.json_response({"error": "'id' is required"}, status=400, headers=CORS_HEADERS)

    code = body.pop("code", None)  # separate code from metadata

    data = _load_index()
    widgets: list = data.get("widgets", [])
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

    return web.json_response({**entry, "code": _load_code(widget_id)}, headers=CORS_HEADERS)


async def handle_seed_widgets(request: web.Request) -> web.Response:
    """
    Seed built-in widgets — idempotent: only inserts ids not already in the index.
    Code is saved to individual .js files; metadata goes into index.json.
    """
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)

    incoming = body if isinstance(body, list) else body.get("widgets", [])
    data = _load_index()
    widgets: list = data.get("widgets", [])
    existing_ids = {w["id"] for w in widgets}
    now = _now()
    seeded = 0

    for w in incoming:
        wid = w.get("id", "")
        if not wid:
            continue
        code = w.pop("code", "")  # extract before storing metadata
        if wid in existing_ids:
            # Built-in widgets are always updated from the registry — this ensures
            # changes to widgetRegistry.ts are reflected immediately on next load.
            # User-created custom widgets (isBuiltin=False) are never overwritten here.
            idx = next(i for i, x in enumerate(widgets) if x["id"] == wid)
            if not widgets[idx].get("isBuiltin", False):
                continue  # preserve user-edited custom widgets
            widgets[idx] = {**widgets[idx], **w, "updatedAt": now}
            _save_code(wid, code)
            seeded += 1
        else:
            entry = {
                **w,
                "id":        wid,
                "isBuiltin": True,
                "archived":  False,
                "createdAt": now,
                "updatedAt": now,
            }
            widgets.append(entry)
            existing_ids.add(wid)
            _save_code(wid, code)
            seeded += 1

    data["widgets"] = widgets
    _save_index(data)
    print(f"[widgets] seeded {seeded} built-in widget(s) to {WIDGETS_DIR}", file=sys.stderr)
    return web.json_response({"seeded": seeded}, headers=CORS_HEADERS)


async def handle_delete_widget(request: web.Request) -> web.Response:
    """
    Soft-delete (archive) a widget. The .js code file is preserved.
    No hard deletes — archived entries stay in index.json with archived=true.
    """
    widget_id = request.match_info.get("id", "")
    data = _load_index()
    widgets: list = data.get("widgets", [])

    found = False
    for w in widgets:
        if w.get("id") == widget_id:
            w["archived"]  = True
            w["updatedAt"] = _now()
            found = True
            break

    if not found:
        return web.json_response({"error": "widget not found"}, status=404, headers=CORS_HEADERS)

    data["widgets"] = widgets
    _save_index(data)
    return web.json_response({"ok": True, "archived": widget_id}, headers=CORS_HEADERS)


async def handle_sessions(request: web.Request) -> web.Response:
    """List sessions. ?cwd=<path> returns all sessions for that directory.
    Without cwd, returns one (most recent) session per working directory."""
    if not SESSIONS_DIR.exists():
        return web.json_response({"sessions": []}, headers=CORS_HEADERS)

    filter_cwd = request.query.get("cwd", "").strip()

    if filter_cwd:
        sessions = []
        for path in SESSIONS_DIR.glob("*.jsonl"):
            meta = _read_session_file(path)
            if meta and meta["workingDir"] == filter_cwd:
                sessions.append(meta)
        sessions.sort(key=lambda s: s["lastModified"], reverse=True)
    else:
        # Two passes per working directory:
        #   1. Most-recently-MODIFIED session → drives title/preview/lastModified shown on the card
        #   2. Most-recently-CONNECTED session → drives the mode badge
        #      (meta.json mtime updated on every WS connect, so it reflects the last mode opened)
        by_dir: dict[str, dict] = {}
        by_dir_mode: dict[str, tuple[float, str]] = {}  # wd → (meta_mtime, mode)

        for path in SESSIONS_DIR.glob("*.jsonl"):
            meta = _read_session_file(path)
            if meta is None:
                continue
            wd = meta["workingDir"]
            sid = meta["sessionId"]

            # Track representative session (highest JSONL mtime)
            existing = by_dir.get(wd)
            if existing is None or meta["lastModified"] > existing["lastModified"]:
                by_dir[wd] = meta

            # Track most-recently-connected mode via meta.json mtime
            meta_file = SESSIONS_DIR / sid / "meta.json"
            if meta_file.exists():
                try:
                    meta_mtime = meta_file.stat().st_mtime
                    prev_mtime, _ = by_dir_mode.get(wd, (0.0, "general"))
                    if meta_mtime > prev_mtime:
                        session_mode = json.loads(meta_file.read_text()).get("mode", "general")
                        by_dir_mode[wd] = (meta_mtime, session_mode)
                except Exception:
                    pass

        # Inject the latest-connected mode into each representative session
        for wd, session in by_dir.items():
            if wd in by_dir_mode:
                session["mode"] = by_dir_mode[wd][1]

        sessions = sorted(by_dir.values(), key=lambda s: s["lastModified"], reverse=True)

    # Annotate with live connection, running status, and default session
    defaults = _load_defaults()
    for s in sessions:
        wd = s["workingDir"]
        s["isActive"]         = wd in _active_cwds
        s["isRunning"]        = wd in _running_cwds
        s["isDefault"]        = defaults.get(wd) == s["sessionId"]
        s["defaultSessionId"] = defaults.get(wd)   # only meaningful in global listing

    return web.json_response({"sessions": sessions}, headers=CORS_HEADERS)


async def handle_set_default_session(request: web.Request) -> web.Response:
    """POST /sessions/default { cwd, sessionId } — pin a conversation as the default for a cwd.
    Omit sessionId (or send empty string) to clear the default."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid body"}, status=400, headers=CORS_HEADERS)
    cwd        = str(body.get("cwd",       "")).strip()
    session_id = str(body.get("sessionId", "")).strip()
    if not cwd:
        return web.json_response({"error": "cwd required"}, status=400, headers=CORS_HEADERS)
    if session_id:
        _save_default(cwd, session_id)
    else:
        _clear_default(cwd)
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


async def handle_update_session_title(request: web.Request) -> web.Response:
    session_id = request.match_info.get("sessionId", "")
    if not session_id or "/" in session_id or ".." in session_id:
        return web.json_response({"error": "invalid sessionId"}, status=400, headers=CORS_HEADERS)
    try:
        body  = await request.json()
        title = str(body.get("title", "")).strip()[:100]
    except Exception:
        return web.json_response({"error": "invalid body"}, status=400, headers=CORS_HEADERS)
    if not title:
        return web.json_response({"error": "title required"}, status=400, headers=CORS_HEADERS)
    _save_title(session_id, title)
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


async def handle_delete_session(request: web.Request) -> web.Response:
    session_id = request.match_info.get("sessionId", "")
    # Sanitize — no path traversal
    if not session_id or "/" in session_id or ".." in session_id:
        return web.json_response({"error": "invalid sessionId"}, status=400, headers=CORS_HEADERS)
    path = SESSIONS_DIR / f"{session_id}.jsonl"
    if path.exists():
        path.unlink()
        return web.json_response({"ok": True}, headers=CORS_HEADERS)
    return web.json_response({"error": "not found"}, status=404, headers=CORS_HEADERS)


async def handle_search(request: web.Request) -> web.Response:
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)

    q       = request.rel_url.query.get("q", "").strip()
    api_key = request.rel_url.query.get("key", "").strip()
    num     = int(request.rel_url.query.get("num", "10"))

    if not q:
        return web.json_response({"error": "q is required"}, status=400, headers=CORS_HEADERS)
    if not api_key:
        return web.json_response({"error": "key is required"}, status=400, headers=CORS_HEADERS)

    params = {"engine": "google", "q": q, "api_key": api_key, "num": num, "hl": "en", "gl": "us"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("https://serpapi.com/search.json", params=params) as resp:
                body = await resp.json(content_type=None)
                if not resp.ok:
                    error = body.get("error", f"SerpAPI returned {resp.status}")
                    return web.json_response({"error": error}, status=resp.status, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=502, headers=CORS_HEADERS)

    organic = body.get("organic_results", [])
    results = [
        {
            "title":       r.get("title", ""),
            "link":        r.get("link", ""),
            "displayLink": r.get("displayed_link", r.get("link", "")),
            "snippet":     r.get("snippet", ""),
            "favicon":     r.get("favicon", ""),
            "position":    r.get("position", i + 1),
        }
        for i, r in enumerate(organic)
    ]
    meta = {
        "total_results":   body.get("search_information", {}).get("total_results"),
        "time_taken":      body.get("search_information", {}).get("time_taken_displayed"),
        "query_displayed": body.get("search_information", {}).get("query_displayed", q),
    }
    return web.json_response({"results": results, "meta": meta}, headers=CORS_HEADERS)


# ── WhatsApp integration (Twilio) ────────────────────────────────────────────
#
# Setup:
#   1. Create a Twilio account and activate the WhatsApp Sandbox.
#   2. Add these credentials via POST /credentials:
#        TWILIO_ACCOUNT_SID   your-account-sid
#        TWILIO_AUTH_TOKEN    your-auth-token
#        TWILIO_FROM          whatsapp:+14155238886   (sandbox number)
#   3. Set the sandbox webhook URL to:
#        http://YOUR_VM_IP:5081/whatsapp/incoming
#   4. Send a message from your phone → bzcode replies in the {cwd}/whatsapp/ dir.

# One persistent bzcode process per WhatsApp phone number.
_whatsapp_sessions: dict = {}
_whatsapp_lock = asyncio.Lock()


class _WASess:
    """Persistent bzcode process for one WhatsApp contact."""

    def __init__(self, phone: str, bzcode_path: str, cwd: str):
        self.phone      = phone
        self.bzcode_path = bzcode_path
        self.cwd        = cwd
        self.proc: Optional[asyncio.subprocess.Process] = None
        self._buf: list  = []
        self._done       = asyncio.Event()
        self._msg_lock   = asyncio.Lock()

    async def _start(self) -> None:
        """Spawn (or restart) the bzcode process."""
        self.proc = await asyncio.create_subprocess_exec(
            self.bzcode_path, "--stdio", "--continue",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.cwd,
            env={**os.environ},
            limit=16 * 1024 * 1024,
        )
        asyncio.create_task(self._read_loop())
        # Drain the session message and switch to yolo so tools auto-approve
        await asyncio.sleep(0.3)
        self.proc.stdin.write(b'{"type":"setMode","mode":"yolo"}\n')
        await self.proc.stdin.drain()
        await asyncio.sleep(0.2)

    async def _read_loop(self) -> None:
        assert self.proc and self.proc.stdout
        while True:
            line = await self.proc.stdout.readline()
            if not line:
                break
            raw = line.decode().strip()
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            t = msg.get("type")
            if t == "assistant":
                for block in msg.get("content", []):
                    if block.get("type") == "text" and block.get("text"):
                        self._buf.append(block["text"])
            elif t == "result" and msg.get("output"):
                self._buf.append(msg["output"])
            elif t == "status" and msg.get("status") == "idle":
                self._done.set()

    async def chat(self, text: str, timeout: int = 90) -> str:
        """Send a message and wait for the full response."""
        async with self._msg_lock:
            if self.proc is None or self.proc.returncode is not None:
                await self._start()
            self._buf.clear()
            self._done.clear()
            payload = json.dumps({"type": "user", "content": text}) + "\n"
            self.proc.stdin.write(payload.encode())
            await self.proc.stdin.drain()
            try:
                await asyncio.wait_for(self._done.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                return "⏱ Response timed out. Try again."
            return "\n\n".join(self._buf).strip() or "✓ Done."


async def _send_whatsapp(to: str, body: str, creds: dict) -> None:
    """Send a WhatsApp message back via Twilio REST API."""
    sid   = creds.get("TWILIO_ACCOUNT_SID", "")
    token = creds.get("TWILIO_AUTH_TOKEN",  "")
    from_ = creds.get("TWILIO_FROM",        "")
    if not (sid and token and from_):
        print("[whatsapp] missing Twilio credentials", file=sys.stderr)
        return
    url  = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    data = {"From": from_, "To": to, "Body": body[:1500]}   # WhatsApp 1600-char limit
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        async with session.post(url, data=data, auth=aiohttp.BasicAuth(sid, token)) as resp:
            if resp.status not in (200, 201):
                text = await resp.text()
                print(f"[whatsapp] Twilio error {resp.status}: {text}", file=sys.stderr)


async def handle_whatsapp_incoming(request: web.Request) -> web.Response:
    """
    Twilio webhook — receives inbound WhatsApp messages.
    Set this URL as the sandbox webhook: POST /whatsapp/incoming
    """
    data    = await request.post()
    from_   = data.get("From",   "").strip()   # e.g. "whatsapp:+447700900000"
    body    = data.get("Body",   "").strip()
    if not from_ or not body:
        return web.Response(text="<Response/>", content_type="text/xml")

    print(f"[whatsapp] {from_}: {body[:60]}", file=sys.stderr)

    # Credentials
    creds = _load_creds()

    # Resolve the WhatsApp working directory
    bzcode_path  = request.app["bzcode_path"]
    default_cwd  = request.app["default_cwd"]
    whatsapp_dir = Path(default_cwd) / "whatsapp"
    whatsapp_dir.mkdir(parents=True, exist_ok=True)

    # Get or create a session for this phone number
    async with _whatsapp_lock:
        if from_ not in _whatsapp_sessions:
            _whatsapp_sessions[from_] = _WASess(from_, bzcode_path, str(whatsapp_dir))
        sess = _whatsapp_sessions[from_]

    # Process asynchronously so Twilio doesn't time out waiting
    async def _process() -> None:
        reply = await sess.chat(body)
        await _send_whatsapp(from_, reply, creds)

    asyncio.create_task(_process())

    # Return empty TwiML immediately so Twilio doesn't retry
    return web.Response(text="<Response/>", content_type="text/xml")


async def handle_whatsapp_status(request: web.Request) -> web.Response:
    """Twilio delivery status callback — log only."""
    data   = await request.post()
    status = data.get("MessageStatus", "unknown")
    sid    = data.get("MessageSid",    "")
    print(f"[whatsapp] delivery {sid}: {status}", file=sys.stderr)
    return web.Response(text="<Response/>", content_type="text/xml")


# ── BoltzHub integration ──────────────────────────────────────────────────────

BOLTZHUB_API   = "https://boltzhub.com/bz-appstore-api"
BOLTZHUB_AUTH  = "https://boltzhub.com"
# Matches what the VS Code plugin excludes — build output (dist/) is intentionally included
_PUSH_EXCLUDE  = {".git", "node_modules", ".bzhub", "__pycache__", ".venv", "venv"}


def _boltzhub_token() -> Optional[str]:
    try:
        import json as _json
        creds = _json.loads((Path.home() / ".boltzbit" / "credentials.json").read_text())
        return creds.get(BOLTZHUB_AUTH, {}).get("accessToken")
    except Exception:
        return None


def _read_app_config(cwd: str) -> Optional[dict]:
    try:
        return json.loads((Path(cwd) / ".bzhub" / "app_config.json").read_text())
    except Exception:
        return None


def _write_app_config(cwd: str, config: dict) -> None:
    bzhub = Path(cwd) / ".bzhub"
    bzhub.mkdir(parents=True, exist_ok=True)
    (bzhub / "app_config.json").write_text(json.dumps(config, indent=2))


def _bz_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def handle_boltzhub_check(request: web.Request) -> web.Response:
    cwd         = request.query.get("cwd", request.app["default_cwd"])
    token       = _boltzhub_token()
    cfg         = _read_app_config(cwd)
    bzhub_dir   = Path(cwd) / ".bzhub"
    config_path = str(bzhub_dir / "app_config.json")
    dir_name    = Path(cwd).name
    return web.json_response({
        "isLoggedIn":   bool(token),
        "hasAppConfig": bool(cfg),
        "appConfig":    cfg,
        "hasBzhubDir":  bzhub_dir.is_dir(),
        "configPath":   config_path,
        "dirName":      dir_name,
        "cwd":          cwd,
    }, headers={"Access-Control-Allow-Origin": "*"})


async def handle_boltzhub_create_app(request: web.Request) -> web.Response:
    data  = await request.json()
    cwd   = data.get("cwd", request.app["default_cwd"])
    token = _boltzhub_token()
    if not token:
        return web.json_response({"error": "Not logged in to BoltzHub"}, status=401,
                                 headers={"Access-Control-Allow-Origin": "*"})
    api_body = {"name": data["name"], "visibility": data.get("visibility", "private")}
    if data.get("description"):  api_body["description"] = data["description"]
    if data.get("priceMonthly"): api_body["priceMonthly"] = data["priceMonthly"]

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as sess:
        async with sess.post(f"{BOLTZHUB_API}/v1/creator/apps",
                             json=api_body, headers=_bz_headers(token)) as resp:
            if resp.status not in (200, 201):
                err = await resp.text()
                return web.json_response({"error": err}, status=resp.status,
                                         headers={"Access-Control-Allow-Origin": "*"})
            result = await resp.json()

    cfg = {
        "id": result["id"], "name": result["name"],
        "description": result.get("description"), "visibility": result.get("visibility", "private"),
        "buildCommand": data.get("buildCommand"), "createdAt": result.get("createdAt"),
    }
    _write_app_config(cwd, cfg)
    return web.json_response({"ok": True, "appConfig": cfg},
                             headers={"Access-Control-Allow-Origin": "*"})


async def handle_boltzhub_push(request: web.Request) -> web.StreamResponse:
    import io, zipfile as zf

    data          = await request.json()
    cwd           = data.get("cwd", request.app["default_cwd"])
    release_notes = data.get("releaseNotes")
    version_num   = data.get("versionNumber", "1.0.0")
    token         = _boltzhub_token()

    resp = web.StreamResponse(headers={
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
    })
    await resp.prepare(request)

    async def emit(step: str, message: str, **kw):
        payload = json.dumps({"step": step, "message": message, **kw})
        await resp.write(f"data: {payload}\n\n".encode())

    try:
        if not token:
            await emit("error", "Not logged in to BoltzHub"); return resp
        cfg = _read_app_config(cwd)
        if not cfg:
            await emit("error", "No .bzhub/app_config.json found"); return resp

        app_id = cfg["id"]
        build_cmd = cfg.get("buildCommand") or "pnpm build"

        # build
        await emit("build", f"Running: {build_cmd}")
        proc = await asyncio.create_subprocess_shell(
            build_cmd, cwd=cwd,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            await emit("error", f"Build failed: {stderr.decode()[:300]}"); return resp

        # archive — use system zip matching VS Code plugin exactly:
        #   zip -r .bzhub/project.zip . -x "node_modules/*" ".bzhub/*" ".git/*"
        await emit("archive", "Archiving project…")
        bzhub_dir = Path(cwd) / ".bzhub"
        bzhub_dir.mkdir(parents=True, exist_ok=True)
        zip_path  = bzhub_dir / "project.zip"
        if zip_path.exists():
            zip_path.unlink()
        zip_cmd = (
            f'cd "{cwd}" && '
            f'zip -r "{zip_path}" . -x "node_modules/*" ".bzhub/*" ".git/*"'
        )
        proc = await asyncio.create_subprocess_shell(
            zip_cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, zip_err = await proc.communicate()
        if proc.returncode not in (0, 12):   # zip exits 12 for "nothing to do" (ok)
            await emit("error", f"Archive failed: {zip_err.decode()[:300]}"); return resp
        zip_bytes = zip_path.read_bytes()

        # use one session for all remaining API calls to avoid connector-closed errors
        auth = {"Authorization": f"Bearer {token}"}
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as sess:

            # upload — field name 'archiveFile' (matches appStoreClient.ts)
            await emit("upload", f"Uploading {len(zip_bytes)//1024} KB…")
            form = aiohttp.FormData()
            form.add_field("archiveFile", zip_bytes, filename="project.zip", content_type="application/zip")
            async with sess.post(f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/code",
                                 data=form, headers=auth) as r:
                if r.status not in (200, 201):
                    await emit("error", f"Upload failed ({r.status}): {await r.text()}"); return resp

            # deploy
            await emit("deploy", "Deploying…")
            async with sess.put(f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/deploy",
                                headers=auth) as r:
                if r.status not in (200, 201):
                    await emit("error", f"Deploy trigger failed ({r.status}): {await r.text()}"); return resp

            # poll deployment status
            service_url = None
            for attempt in range(60):
                if attempt: await asyncio.sleep(5)
                async with sess.get(f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/status",
                                    headers=auth) as r:
                    if r.status != 200: continue
                    st          = await r.json()
                    service_url = st.get("serviceUrl")
                    dep_status  = st.get("status")
                    await emit("deploy", st.get("stepMessage", f"Deploying… ({attempt*5}s)"))
                    if dep_status == "deployed": break
                    if dep_status == "failed":
                        await emit("error", "Deployment failed"); return resp

            # publish version (if release notes provided)
            await emit("publish", "Publishing version…")
            if release_notes:
                async with sess.post(
                    f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
                    json={"releaseNotes": release_notes, "versionNumber": version_num},
                    headers=auth,
                ) as r:
                    pass  # non-fatal if this fails

        await emit("done", "Deployed!", serviceUrl=service_url or "", appId=app_id)
    except Exception as exc:
        await emit("error", str(exc))

    return resp


async def handle_boltzhub_sync(request: web.Request) -> web.StreamResponse:
    import io, zipfile as zf

    data   = await request.json()
    cwd    = data.get("cwd", request.app["default_cwd"])
    app_id = data.get("appId")
    token  = _boltzhub_token()

    resp = web.StreamResponse(headers={
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
    })
    await resp.prepare(request)

    async def emit(step: str, message: str, **kw):
        payload = json.dumps({"step": step, "message": message, **kw})
        await resp.write(f"data: {payload}\n\n".encode())

    try:
        if not token:
            await emit("error", "Not logged in to BoltzHub"); return resp
        if not app_id:
            cfg = _read_app_config(cwd)
            if not cfg:
                await emit("error", "No .bzhub/app_config.json found"); return resp
            app_id = cfg["id"]

        connector = aiohttp.TCPConnector(ssl=False)

        # download
        await emit("download", "Downloading project…")
        async with aiohttp.ClientSession(connector=connector) as sess:
            async with sess.get(
                f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/code",
                headers={"Authorization": f"Bearer {token}"},
            ) as r:
                if r.status != 200:
                    await emit("error", f"Download failed ({r.status})"); return resp
                zip_bytes = await r.read()

        # extract
        await emit("extract", "Extracting files…")
        buf = io.BytesIO(zip_bytes)
        with zf.ZipFile(buf) as z:
            z.extractall(cwd)

        # install
        await emit("install", "Installing dependencies…")
        lock_pnpm = (Path(cwd) / "pnpm-lock.yaml").exists()
        install_cmd = "pnpm install" if lock_pnpm else "npm install"
        if (Path(cwd) / "package.json").exists():
            proc = await asyncio.create_subprocess_shell(
                install_cmd, cwd=cwd,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await proc.wait()

        await emit("done", "Project synced successfully!")
    except Exception as exc:
        await emit("error", str(exc))

    return resp


async def handle_boltzhub_create_version(request: web.Request) -> web.Response:
    """POST /versions — create a versioned release with release notes (used during push)."""
    data          = await request.json()
    app_id        = data.get("appId")
    release_notes = data.get("releaseNotes", "")
    version_num   = data.get("versionNumber", "1.0.0")
    token         = _boltzhub_token()
    if not token:
        return web.json_response({"error": "Not logged in"}, status=401,
                                 headers={"Access-Control-Allow-Origin": "*"})
    if not app_id:
        return web.json_response({"error": "appId required"}, status=400,
                                 headers={"Access-Control-Allow-Origin": "*"})
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as sess:
        async with sess.post(
            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
            json={"releaseNotes": release_notes, "versionNumber": version_num},
            headers={"Authorization": f"Bearer {token}"},
        ) as r:
            result = await r.json() if r.content_type == "application/json" else {"status": r.status}
            return web.json_response(result, status=r.status,
                                     headers={"Access-Control-Allow-Origin": "*"})


async def handle_boltzhub_publish(request: web.Request) -> web.Response:
    """PUT /publish — publish the deployed app (matches publishApp in appStoreClient.ts)."""
    data   = await request.json()
    app_id = data.get("appId")
    token  = _boltzhub_token()
    if not token:
        return web.json_response({"error": "Not logged in"}, status=401,
                                 headers={"Access-Control-Allow-Origin": "*"})
    if not app_id:
        return web.json_response({"error": "appId required"}, status=400,
                                 headers={"Access-Control-Allow-Origin": "*"})
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as sess:
        async with sess.put(
            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/publish",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        ) as r:
            result = await r.json() if r.content_type == "application/json" else {"status": r.status}
            return web.json_response(result, status=r.status,
                                     headers={"Access-Control-Allow-Origin": "*"})


async def handle_boltzhub_apps(request: web.Request) -> web.Response:
    token = _boltzhub_token()
    if not token:
        return web.json_response({"error": "Not logged in"}, status=401,
                                 headers={"Access-Control-Allow-Origin": "*"})
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as sess:
        async with sess.get(f"{BOLTZHUB_API}/v1/creator/apps",
                            headers={"Authorization": f"Bearer {token}"}) as r:
            if r.status != 200:
                return web.json_response({"error": await r.text()}, status=r.status,
                                         headers={"Access-Control-Allow-Origin": "*"})
            result = await r.json()
    return web.json_response(result, headers={"Access-Control-Allow-Origin": "*"})


async def handle_boltzhub_versions(request: web.Request) -> web.Response:
    app_id = request.query.get("appId")
    token  = _boltzhub_token()
    if not token:
        return web.json_response({"error": "Not logged in"}, status=401,
                                 headers={"Access-Control-Allow-Origin": "*"})
    if not app_id:
        return web.json_response({"error": "appId required"}, status=400,
                                 headers={"Access-Control-Allow-Origin": "*"})
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as sess:
        async with sess.get(
            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
            headers={"Authorization": f"Bearer {token}"},
        ) as r:
            if r.status != 200:
                return web.json_response({"error": await r.text()}, status=r.status,
                                         headers={"Access-Control-Allow-Origin": "*"})
            data = await r.json()
            items = data if isinstance(data, list) else data.get("items", [])
            # Sort newest first, suggest next patch version
            items.sort(key=lambda v: v.get("createdAt", ""), reverse=True)
            latest = items[0]["versionNumber"] if items else "0.0.0"
            parts  = latest.split(".")
            try:
                suggested = f"{parts[0]}.{parts[1]}.{int(parts[2]) + 1}"
            except Exception:
                suggested = "1.0.0"
            return web.json_response({"versions": items, "suggestedNext": suggested},
                                     headers={"Access-Control-Allow-Origin": "*"})


async def handle_boltzhub_token_usage(request: web.Request) -> web.Response:
    token  = _boltzhub_token()
    period = request.query.get("period", "30d")
    if not token:
        return web.json_response({"error": "Not logged in"}, status=401,
                                 headers={"Access-Control-Allow-Origin": "*"})
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as sess:
        async with sess.get(
            f"{BOLTZHUB_API}/v1/creator/tokens/usage/history?period={period}&limit=100",
            headers={"Authorization": f"Bearer {token}"},
        ) as r:
            if r.status != 200:
                return web.json_response({"error": await r.text()}, status=r.status,
                                         headers={"Access-Control-Allow-Origin": "*"})
            result = await r.json()
    return web.json_response(result, headers={"Access-Control-Allow-Origin": "*"})


# ── Background batch execution ────────────────────────────────────────────────

import uuid as _uuid_mod

_batch_store: dict = {}   # batchId -> {"items": [...], "created": float}


class _BatchItem:
    """Runs a single bzcode process in YOLO mode and collects the response."""

    def __init__(self, cwd: str, bzcode_path: str, resume_session_id: str = "") -> None:
        self.cwd                = cwd
        self.dir_name           = Path(cwd).name
        self.bzcode_path        = bzcode_path
        self.resume_session_id  = resume_session_id  # if set, resume this session
        self.status             = "pending"   # pending | running | done | error
        self.output             = ""
        self.error_msg          = ""
        self.session_id         = resume_session_id  # filled/confirmed from bzcode's session message
        self._buf: list         = []
        self._done              = asyncio.Event()
        self._proc              = None
        self._msg_sent          = False       # True once the user message has been written to stdin

    def to_dict(self) -> dict:
        return {
            "cwd":       self.cwd,
            "dirName":   self.dir_name,
            "status":    self.status,
            "output":    self.output,
            "error":     self.error_msg,
            "sessionId": self.session_id,
        }

    async def run(self, message: str) -> None:
        self.status = "running"
        _running_cwds.add(self.cwd)
        try:
            cmd = [self.bzcode_path, "--stdio"]
            if self.resume_session_id:
                cmd += ["--resume", self.resume_session_id]
            self._proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                cwd=self.cwd,
                env={**os.environ},
                limit=16 * 1024 * 1024,
            )
            asyncio.create_task(self._read_loop())
            # Allow bzcode to send its session/ready message
            await asyncio.sleep(0.8)
            # YOLO mode — auto-approve all tool permissions
            self._proc.stdin.write(b'{"type":"setMode","mode":"yolo"}\n')
            await self._proc.stdin.drain()
            await asyncio.sleep(0.1)
            # Send the user message
            payload = json.dumps({"type": "user", "content": message}) + "\n"
            self._proc.stdin.write(payload.encode())
            await self._proc.stdin.drain()
            self._msg_sent = True      # now it's safe to honour status: idle
            # Wait up to 3 minutes for completion
            await asyncio.wait_for(self._done.wait(), timeout=180)
            self.output = "\n\n".join(self._buf).strip()
            self.status = "done"
            # Give bzcode a moment to finish writing the session file to disk
            await asyncio.sleep(0.5)
        except asyncio.TimeoutError:
            self.status    = "error"
            self.error_msg = "Timed out after 3 minutes"
        except Exception as exc:
            self.status    = "error"
            self.error_msg = str(exc)
        finally:
            _running_cwds.discard(self.cwd)
            if self._proc:
                try:
                    # Close stdin gracefully — signals bzcode to save session and exit
                    if self._proc.stdin:
                        self._proc.stdin.close()
                    await asyncio.wait_for(self._proc.wait(), timeout=8)
                except asyncio.TimeoutError:
                    self._proc.kill()
                except Exception:
                    try: self._proc.kill()
                    except Exception: pass

    async def _read_loop(self) -> None:
        assert self._proc and self._proc.stdout
        while True:
            line = await self._proc.stdout.readline()
            if not line:
                break
            raw = line.decode().strip()
            if not raw:
                continue
            try:
                msg = json.loads(raw)
                t   = msg.get("type")
                if t == "session":
                    self.session_id = msg.get("sessionId", "")
                elif t == "assistant":
                    for block in msg.get("content", []):
                        if block.get("type") == "text" and block.get("text"):
                            self._buf.append(block["text"])
                elif t == "result":
                    if msg.get("output"):
                        self._buf.append(msg["output"])
                    if msg.get("usage"):
                        _add_tokens(msg["usage"])
                elif t == "status" and msg.get("status") == "idle":
                    # Only complete after the user message has been sent —
                    # ignores startup auto-run idle that arrives before our message
                    if self._msg_sent:
                        self._done.set()
            except Exception:
                pass


async def handle_token_stats(request: web.Request) -> web.Response:
    """GET /token-stats — accumulated token usage since server start."""
    return web.json_response(_token_stats, headers=CORS_HEADERS)


# ── Settings ──────────────────────────────────────────────────────────────────

async def handle_settings_resources(request: web.Request) -> web.Response:
    """GET /settings/resources — disk usage for sessions and server data."""
    import shutil as _shutil

    session_count = 0
    session_bytes = 0
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
        disk = _shutil.disk_usage(Path.home())
        disk_info = {"total": disk.total, "used": disk.used, "free": disk.free}
    except Exception:
        disk_info = {"total": 0, "used": 0, "free": 0}

    return web.json_response({
        "sessions": {"count": session_count, "bytes": session_bytes},
        "serverData": {"bytes": server_data_bytes},
        "disk": disk_info,
    }, headers=CORS_HEADERS)


async def handle_settings_clear_sessions(request: web.Request) -> web.Response:
    """DELETE /settings/sessions/clear?olderThanDays=N — remove old session files."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    days = max(1, int(request.query.get("olderThanDays", "30")))
    cutoff = __import__("time").time() - days * 86_400
    deleted = 0
    if SESSIONS_DIR.exists():
        for f in SESSIONS_DIR.glob("*.jsonl"):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    deleted += 1
            except Exception:
                pass
    return web.json_response({"deleted": deleted}, headers=CORS_HEADERS)


# ── Database health ───────────────────────────────────────────────────────────

async def handle_db_health(request: web.Request) -> web.Response:
    """GET /db/health — ping the Postgres pool; returns connection status."""
    pool = request.app.get("db")
    if pool is None:
        return web.json_response(
            {"ok": False, "error": "asyncpg not installed or DB disabled"},
            status=503, headers=CORS_HEADERS,
        )
    try:
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
        return web.json_response({"ok": True, "version": version}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response(
            {"ok": False, "error": str(exc)}, status=503, headers=CORS_HEADERS,
        )


# ── Widget data (file-based) ──────────────────────────────────────────────────
# Each widget placement stores its records in a single JSON file.
# Complex queries are handled by executing a Python snippet server-side —
# this is intentional: widgets are vibe-coded through bzcode, not hand-injected.
#
# File location: server_data/widget_data/{canvasId}.json
# File format:   { "_next_id": N, "records": [{id, created_at, ...}, ...] }

import re as _re
import threading as _threading

_CANVAS_ID_RE = _re.compile(r'^[a-z0-9][a-z0-9-]{3,63}$')
WIDGET_DATA_DIR = SERVER_DATA_DIR / "widget_data"
_widget_locks: dict = {}   # per-canvasId write locks
_widget_locks_meta = _threading.Lock()


def _widget_lock(canvas_id: str) -> _threading.Lock:
    with _widget_locks_meta:
        if canvas_id not in _widget_locks:
            _widget_locks[canvas_id] = _threading.Lock()
        return _widget_locks[canvas_id]


def _widget_path(canvas_id: str) -> Path:
    if not _CANVAS_ID_RE.match(canvas_id):
        raise ValueError(f"Invalid canvasId: {canvas_id!r}")
    WIDGET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    return WIDGET_DATA_DIR / f"{canvas_id}.json"


def _widget_load(canvas_id: str) -> dict:
    p = _widget_path(canvas_id)
    if not p.exists():
        return {"_next_id": 1, "records": []}
    with open(p) as f:
        return json.load(f)


def _widget_save(canvas_id: str, data: dict) -> None:
    p = _widget_path(canvas_id)
    with open(p, "w") as f:
        json.dump(data, f, indent=2, default=str)


_WIDGET_CORS = {"Access-Control-Allow-Origin": "*"}


def _wj(data: object, status: int = 200) -> web.Response:
    return web.Response(
        text=json.dumps(data, default=str),
        status=status,
        content_type="application/json",
        headers=_WIDGET_CORS,
    )


async def handle_widget_query(request: web.Request) -> web.Response:
    """GET /db/widget/{canvasId}/rows — return all records, optional sort/limit."""
    try:
        cid     = request.match_info["canvasId"]
        data    = _widget_load(cid)
        records = data["records"]
        order   = request.query.get("order", "id")
        desc    = request.query.get("dir", "asc").upper() == "DESC"
        limit   = min(int(request.query.get("limit", "1000")), 10000)
        offset  = int(request.query.get("offset", "0"))
        for f in request.query.getall("filter", []):
            if "=" not in f: continue
            k, _, v = f.partition("=")
            records = [r for r in records if str(r.get(k, "")) == v]
        records = sorted(records, key=lambda r: r.get(order, 0), reverse=desc)
        page    = records[offset: offset + limit]
        return _wj({"rows": page, "total": len(records), "limit": limit, "offset": offset})
    except Exception as exc:
        return _wj({"error": str(exc)}, 400)


async def handle_widget_insert(request: web.Request) -> web.Response:
    """POST /db/widget/{canvasId}/rows  Body: { row } or { rows: [...] }"""
    if request.method == "OPTIONS":
        return web.Response(headers={**_WIDGET_CORS,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"})
    try:
        import datetime as _dt
        cid  = request.match_info["canvasId"]
        body = await request.json()
        rows = body.get("rows") or ([body["row"]] if "row" in body else [])
        if not rows:
            return _wj({"error": "Provide 'row' or 'rows'"}, 400)
        with _widget_lock(cid):
            data = _widget_load(cid)
            inserted = []
            for row in rows:
                row = {k: v for k, v in row.items() if k not in ("id", "created_at")}
                row["id"] = data["_next_id"]
                row["created_at"] = _dt.datetime.utcnow().isoformat() + "Z"
                data["_next_id"] += 1
                data["records"].append(row)
                inserted.append(row)
            _widget_save(cid, data)
        return _wj({"inserted": inserted})
    except Exception as exc:
        return _wj({"error": str(exc)}, 400)


async def handle_widget_update(request: web.Request) -> web.Response:
    """PUT /db/widget/{canvasId}/rows/{id}  Body: { data: {...} }"""
    if request.method == "OPTIONS":
        return web.Response(headers={**_WIDGET_CORS,
            "Access-Control-Allow-Methods": "PUT, OPTIONS",
            "Access-Control-Allow-Headers": "*"})
    try:
        cid    = request.match_info["canvasId"]
        row_id = int(request.match_info["id"])
        body   = await request.json()
        patch  = {k: v for k, v in body.get("data", {}).items()
                  if k not in ("id", "created_at")}
        if not patch:
            return _wj({"error": "'data' required"}, 400)
        with _widget_lock(cid):
            data = _widget_load(cid)
            for r in data["records"]:
                if r.get("id") == row_id:
                    r.update(patch)
                    _widget_save(cid, data)
                    return _wj({"updated": r})
        return _wj({"error": "Row not found"}, 404)
    except Exception as exc:
        return _wj({"error": str(exc)}, 400)


async def handle_widget_delete(request: web.Request) -> web.Response:
    """DELETE /db/widget/{canvasId}/rows/{id}"""
    try:
        cid    = request.match_info["canvasId"]
        row_id = int(request.match_info["id"])
        with _widget_lock(cid):
            data    = _widget_load(cid)
            before  = len(data["records"])
            data["records"] = [r for r in data["records"] if r.get("id") != row_id]
            if len(data["records"]) == before:
                return _wj({"error": "Row not found"}, 404)
            _widget_save(cid, data)
        return _wj({"deleted": row_id})
    except Exception as exc:
        return _wj({"error": str(exc)}, 400)


async def handle_widget_exec(request: web.Request) -> web.Response:
    """
    POST /db/widget/{canvasId}/exec
    Body: { "code": "python snippet" }

    The snippet runs with `records` (list of dicts) in scope.
    Set `result` to whatever you want returned.

    Example:
        total = sum(r['value'] for r in records)
        result = {'total': total, 'avg': total / len(records) if records else 0}
    """
    if request.method == "OPTIONS":
        return web.Response(headers={**_WIDGET_CORS,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"})
    try:
        cid  = request.match_info["canvasId"]
        body = await request.json()
        code = body.get("code", "").strip()
        if not code:
            return _wj({"error": "'code' is required"}, 400)
        data    = _widget_load(cid)
        ns      = {"records": data["records"], "result": None}
        exec(compile(code, "<widget-exec>", "exec"), ns)  # nosec — intentional by design
        return _wj({"result": ns.get("result")})
    except Exception as exc:
        return _wj({"error": str(exc)}, 400)


# ── Agent mode + file endpoints ───────────────────────────────────────────────

async def handle_agent_modes(request: web.Request) -> web.Response:
    """GET /agent-modes — return the full mode config so the frontend can read labels/descriptions."""
    return web.json_response(_load_mode_config(), headers=CORS_HEADERS)


async def handle_read_file(request: web.Request) -> web.Response:
    """GET /api/file?path=<abs> — read a file's content as text."""
    path_str = request.query.get("path", "").strip()
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    p = Path(path_str)
    if not p.exists() or not p.is_file():
        return web.json_response({"error": "file not found"}, status=404, headers=CORS_HEADERS)
    try:
        content = p.read_text(errors="replace")
        return web.json_response({"path": str(p), "content": content}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_write_file(request: web.Request) -> web.Response:
    """PUT /api/file { path, content } — write text content to a file."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body     = await request.json()
        path_str = str(body.get("path", "")).strip()
        content  = str(body.get("content", ""))
        if not path_str:
            return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
        p = Path(path_str)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return web.json_response({"ok": True, "path": str(p)}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_batch_run(request: web.Request) -> web.Response:
    """POST /batch  { cwds: [str], message: str, sessions?: {cwd: sessionId} }
    Starts bzcode in YOLO mode for each directory concurrently.
    If sessions[cwd] is provided, resumes that session instead of starting fresh.
    Returns { batchId } for polling."""
    body = await request.json()
    cwds     = body.get("cwds", [])
    message  = body.get("message", "").strip()
    sessions = body.get("sessions", {})  # optional: cwd -> sessionId to resume
    if not cwds or not message:
        return web.json_response({"error": "cwds and message required"}, status=400, headers=CORS_HEADERS)

    bzcode_path = request.app["bzcode_path"]
    batch_id    = _uuid_mod.uuid4().hex[:12]
    items       = [_BatchItem(cwd, bzcode_path, resume_session_id=sessions.get(cwd, "")) for cwd in cwds]
    _batch_store[batch_id] = {"items": items, "created": __import__("time").time()}

    # Fire and forget — run all items concurrently
    async def _run_all():
        await asyncio.gather(*[item.run(message) for item in items], return_exceptions=True)

    asyncio.create_task(_run_all())
    return web.json_response({"batchId": batch_id}, headers=CORS_HEADERS)


async def handle_batch_status(request: web.Request) -> web.Response:
    """GET /batch/{batchId}  — returns current state of all items."""
    batch_id = request.match_info.get("batchId", "")
    batch    = _batch_store.get(batch_id)
    if not batch:
        return web.json_response({"error": "not found"}, status=404, headers=CORS_HEADERS)
    items = [item.to_dict() for item in batch["items"]]
    done  = all(i["status"] in ("done", "error") for i in items)
    return web.json_response({"batchId": batch_id, "done": done, "items": items}, headers=CORS_HEADERS)


def make_http_app(bzcode_path: str = "", default_cwd: str = "",
                  port: int = 18789) -> web.Application:
    app = web.Application()
    app["bzcode_path"] = bzcode_path
    app["default_cwd"] = default_cwd
    app["port"]        = port
    app["db"] = None  # filled by on_startup if asyncpg is available

    # ── bzcode WebSocket bridge at /ws ────────────────────────────────────────
    async def _ws_handler(request: web.Request) -> web.WebSocketResponse:
        return await handle_ws_client(request, bzcode_path, default_cwd)
    app.router.add_get("/ws", _ws_handler)

    # ── DB pool lifecycle ─────────────────────────────────────────────────────
    async def _on_startup(application: web.Application) -> None:
        if asyncpg is None:
            print("[db] asyncpg not installed — Postgres disabled", file=sys.stderr)
            return
        try:
            pool = await asyncpg.create_pool(**DB_CONFIG, min_size=2, max_size=10)
            application["db"] = pool
            print(
                f"[db] connected  host={DB_CONFIG['host']}:{DB_CONFIG['port']}"
                f"  db={DB_CONFIG['database']}",
                file=sys.stderr,
            )
        except Exception as exc:
            print(f"[db] connection failed (server continues without DB): {exc}", file=sys.stderr)

    async def _on_shutdown(application: web.Application) -> None:
        pool = application.get("db")
        if pool is not None:
            await pool.close()
            print("[db] pool closed", file=sys.stderr)

    app.on_startup.append(_on_startup)
    app.on_shutdown.append(_on_shutdown)

    # WhatsApp (Twilio webhook)
    app.router.add_post("/whatsapp/incoming",  handle_whatsapp_incoming)
    app.router.add_post("/whatsapp/status",    handle_whatsapp_status)
    # Auth
    app.router.add_post("/auth",                   handle_auth)
    app.router.add_route("OPTIONS", "/auth",         handle_options)
    # Widgets
    app.router.add_get(   "/widgets",                handle_get_widgets)
    app.router.add_post(  "/widgets",                handle_post_widget)
    app.router.add_post(  "/widgets/seed",           handle_seed_widgets)
    app.router.add_get(   "/widgets/{id}",           handle_get_widget)
    app.router.add_delete("/widgets/{id}",           handle_delete_widget)
    app.router.add_route("OPTIONS", "/widgets",       handle_options)
    app.router.add_route("OPTIONS", "/widgets/seed",  handle_options)
    app.router.add_route("OPTIONS", "/widgets/{id}",  handle_options)
    # Credential-injecting proxy (widgets call this with {{KEY}} placeholders)
    app.router.add_post(  "/proxy",                    handle_proxy)
    app.router.add_route("OPTIONS", "/proxy",            handle_options)
    # Credential management (keys only — values never returned to frontend)
    app.router.add_get(   "/credentials",              handle_get_credential_keys)
    app.router.add_post(  "/credentials",              handle_post_credential)
    app.router.add_delete("/credentials/{key}",        handle_delete_credential)
    app.router.add_route("OPTIONS", "/credentials",       handle_options)
    app.router.add_route("OPTIONS", "/credentials/{key}", handle_options)
    # Agent modes config
    app.router.add_get( "/agent-modes",             handle_agent_modes)
    app.router.add_route("OPTIONS", "/agent-modes",   handle_options)
    # Shell + Files
    app.router.add_get( "/shell",                  handle_shell)
    app.router.add_route("OPTIONS", "/shell",         handle_options)
    app.router.add_get( "/files",                  handle_files)
    app.router.add_post("/files/mkdir",            handle_mkdir)
    app.router.add_route("OPTIONS", "/files",         handle_options)
    app.router.add_route("OPTIONS", "/files/mkdir",   handle_options)
    # File read / write (for worker + coder editor panel)
    app.router.add_get( "/api/file",               handle_read_file)
    app.router.add_put( "/api/file",               handle_write_file)
    app.router.add_route("OPTIONS", "/api/file",    handle_options)
    # Canvas
    app.router.add_get( "/canvas",                 handle_get_canvas)
    app.router.add_post("/canvas",                 handle_post_canvas)
    app.router.add_post("/canvas/deploy-widget",   handle_deploy_widget)
    app.router.add_route("OPTIONS", "/canvas",             handle_options)
    app.router.add_route("OPTIONS", "/canvas/deploy-widget", handle_options)
    # Per-instance custom widget code (edited via the </>  button on the canvas)
    app.router.add_get(   "/custom-widgets/{canvasId}", handle_get_custom_widget)
    app.router.add_put(   "/custom-widgets/{canvasId}", handle_put_custom_widget)
    app.router.add_delete("/custom-widgets/{canvasId}", handle_delete_custom_widget)
    app.router.add_route("OPTIONS", "/custom-widgets/{canvasId}", handle_options)
    # Database
    app.router.add_get(   "/db/health",                      handle_db_health)
    app.router.add_route("OPTIONS", "/db/health",             handle_options)
    # Widget-scoped database (one table per canvas widget placement)
    app.router.add_get(   "/db/widget/{canvasId}/rows",           handle_widget_query)
    app.router.add_post(  "/db/widget/{canvasId}/rows",           handle_widget_insert)
    app.router.add_put(   "/db/widget/{canvasId}/rows/{id}",      handle_widget_update)
    app.router.add_delete("/db/widget/{canvasId}/rows/{id}",      handle_widget_delete)
    app.router.add_post(  "/db/widget/{canvasId}/exec",           handle_widget_exec)
    for _wp in ("/db/widget/{canvasId}/rows", "/db/widget/{canvasId}/rows/{id}",
                "/db/widget/{canvasId}/exec"):
        app.router.add_route("OPTIONS", _wp, handle_options)
    # Batch background execution
    app.router.add_get(   "/token-stats",                    handle_token_stats)
    app.router.add_get(   "/settings/resources",             handle_settings_resources)
    app.router.add_delete("/settings/sessions/clear",        handle_settings_clear_sessions)
    app.router.add_route("OPTIONS", "/settings/resources",          handle_options)
    app.router.add_route("OPTIONS", "/settings/sessions/clear",     handle_options)
    app.router.add_post(  "/batch",                  handle_batch_run)
    app.router.add_get(   "/batch/{batchId}",        handle_batch_status)
    app.router.add_route("OPTIONS", "/batch",          handle_options)
    app.router.add_route("OPTIONS", "/batch/{batchId}", handle_options)
    # Sessions & Search
    app.router.add_get(   "/sessions",                    handle_sessions)
    app.router.add_delete("/sessions/{sessionId}",         handle_delete_session)
    app.router.add_post(  "/sessions/{sessionId}/title",   handle_update_session_title)
    app.router.add_post(  "/session-default",              handle_set_default_session)
    app.router.add_route("OPTIONS", "/sessions",                   handle_options)
    app.router.add_route("OPTIONS", "/sessions/{sessionId}",       handle_options)
    app.router.add_route("OPTIONS", "/sessions/{sessionId}/title", handle_options)
    app.router.add_route("OPTIONS", "/session-default",            handle_options)
    app.router.add_get("/search",                  handle_search)
    app.router.add_route("OPTIONS", "/search",       handle_options)
    # BoltzHub integration
    app.router.add_get(  "/boltzhub/check",        handle_boltzhub_check)
    app.router.add_post( "/boltzhub/create-app",   handle_boltzhub_create_app)
    app.router.add_post( "/boltzhub/push",         handle_boltzhub_push)
    app.router.add_post( "/boltzhub/sync",         handle_boltzhub_sync)
    app.router.add_post( "/boltzhub/create-version", handle_boltzhub_create_version)
    app.router.add_post( "/boltzhub/publish",         handle_boltzhub_publish)
    app.router.add_get(  "/boltzhub/apps",           handle_boltzhub_apps)
    app.router.add_get(  "/boltzhub/versions",      handle_boltzhub_versions)
    app.router.add_get(  "/boltzhub/token-usage",  handle_boltzhub_token_usage)
    for path in ("/boltzhub/check", "/boltzhub/create-app", "/boltzhub/push",
                 "/boltzhub/sync", "/boltzhub/apps", "/boltzhub/token-usage",
                 "/boltzhub/create-version", "/boltzhub/publish",
                 "/boltzhub/versions", "/boltzhub/token-usage"):
        app.router.add_route("OPTIONS", path, handle_options)
    return app


def _add_frontend(app: web.Application, dist_dir: Path) -> None:
    """Mount a Vite production build so the Python server also serves the SPA.

    Route priority (registered in this order so API always wins):
      1. All existing API routes (already registered above)
      2. /assets/* and other static asset files from dist/
      3. Catch-all → dist/index.html (client-side routing / SPA fallback)
    """
    if not dist_dir.is_dir():
        print(f"[frontend] dist dir not found: {dist_dir} — skipping static serving",
              file=sys.stderr)
        return

    index_html = dist_dir / "index.html"
    if not index_html.exists():
        print(f"[frontend] index.html not found in {dist_dir} — run 'pnpm build' first",
              file=sys.stderr)
        return

    # Serve /assets and any other top-level static directories
    for entry in dist_dir.iterdir():
        if entry.is_dir():
            app.router.add_static(f"/{entry.name}", entry, show_index=False)

    # Serve root-level static files (favicon.ico, manifest etc.)
    async def handle_static_file(request: web.Request) -> web.Response:
        filepath = dist_dir / request.match_info["filename"]
        if filepath.is_file():
            return web.FileResponse(filepath)
        # Not a known file → SPA fallback
        return web.FileResponse(index_html)

    app.router.add_get("/{filename:[^/]+\\.[^/]+}", handle_static_file)  # e.g. favicon.ico

    # SPA catch-all: every unmatched route returns index.html
    async def handle_spa(request: web.Request) -> web.Response:
        return web.FileResponse(index_html)

    app.router.add_get("/",         handle_spa)
    app.router.add_get("/{path:.*}", handle_spa)

    print(f"[frontend] serving {dist_dir}", file=sys.stderr)


# ── bzcode WebSocket bridge ───────────────────────────────────────────────────

async def read_bzcode_stdout(
    proc: asyncio.subprocess.Process,
    out_queue: asyncio.Queue,
    ready_event: asyncio.Event,
    cwd: str = "",
    mode: str = "general",
) -> None:
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            raw = line.decode().rstrip("\n")
            if not raw:
                continue
            await out_queue.put(raw)
            if raw[0] == "{":
                try:
                    msg     = json.loads(raw)
                    mtype   = msg.get("type")
                    mstatus = msg.get("status")
                    if mtype == "status" and mstatus == "running":
                        ready_event.clear()
                        if cwd: _running_cwds.add(cwd)
                    elif mtype == "status" and mstatus == "idle":
                        ready_event.set()
                        if cwd: _running_cwds.discard(cwd)
                    elif mtype == "result":
                        ready_event.set()
                        if cwd: _running_cwds.discard(cwd)
                        if msg.get("usage"):
                            _add_tokens(msg["usage"])
                except Exception:
                    pass
    finally:
        await out_queue.put(None)
        ready_event.set()
        if cwd: _running_cwds.discard(cwd)


async def send_to_client(queue: asyncio.Queue, ws: "web.WebSocketResponse") -> None:
    while True:
        raw = await queue.get()
        if raw is None:
            break
        if raw and raw[0] == "{":
            try:
                await ws.send_str(raw)
            except Exception:
                # Socket already closing — stop sending
                break


async def drain_bzcode_stderr(proc: asyncio.subprocess.Process) -> None:
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        print(f"[bzcode] {line.decode().rstrip()}", file=sys.stderr)


async def relay_client_messages(
    proc: asyncio.subprocess.Process,
    ws: "web.WebSocketResponse",
    ready_event: asyncio.Event,
) -> None:
    async for msg in ws:
        if msg.type == aiohttp.WSMsgType.TEXT:
            raw: str = msg.data
            if not raw.endswith("\n"):
                raw += "\n"
            proc.stdin.write(raw.encode())
            await proc.stdin.drain()
        elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
            break


async def handle_ws_client(request: web.Request, bzcode_path: str, default_cwd: str) -> web.WebSocketResponse:
    """aiohttp WebSocket handler — mounted at GET /ws."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    params = request.rel_url.query

    req_session_id = params.get("sessionId") or None
    req_cwd        = params.get("cwd") or default_cwd

    # Validate cwd; fall back to default if the path doesn't exist
    effective_cwd = req_cwd if os.path.isdir(req_cwd) else default_cwd

    # Determine mode.
    req_mode = params.get("mode") or _load_mode_config().get("default", "general")

    # Validate any requested session ID — if its .jsonl is missing, treat as new.
    if req_session_id:
        session_file = SESSIONS_DIR / f"{req_session_id}.jsonl"
        if not session_file.exists():
            print(
                f"[ws] session file not found for {req_session_id!r} — starting fresh",
                file=sys.stderr,
            )
            req_session_id = None

    # If no session ID, generate one now (before spawning) so we can write the
    # config directory first.  bzcode starts a fresh session when it sees no
    # existing .jsonl, but it DOES load the config directory — so the identity
    # and tool settings take effect from the very first message.
    if not req_session_id:
        import secrets as _secrets
        req_session_id = f"bz-{_secrets.token_hex(6)}"
        print(f"[ws] generated new sessionId={req_session_id}", file=sys.stderr)

    # Write IDENTITY.md, SOUL.md, settings.json, meta.json into the session config dir.
    # Done before spawning so bzcode picks them up on first startup.
    _write_session_config(req_session_id, req_mode, working_dir=effective_cwd)

    # Always use --resume so bzcode loads the session config directory.
    # If no .jsonl exists yet, bzcode starts a fresh conversation with this ID.
    cmd = [bzcode_path, "--stdio", "--resume", req_session_id]

    print(f"[ws] connect  cwd={effective_cwd}  sessionId={req_session_id}  mode={req_mode}", file=sys.stderr)
    _active_cwds.add(effective_cwd)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=effective_cwd,
            env={**os.environ},
            limit=16 * 1024 * 1024,  # 16 MB — large sessions can emit long lines
        )
    except FileNotFoundError:
        await ws.send_str(json.dumps({
            "type": "result", "status": "error",
            "error": f"bzcode not found: {bzcode_path}",
        }))
        await ws.close()
        return ws

    out_queue   = asyncio.Queue()
    ready_event = asyncio.Event()
    try:
        await asyncio.gather(
            read_bzcode_stdout(proc, out_queue, ready_event,
                               cwd=effective_cwd, mode=req_mode),
            send_to_client(out_queue, ws),
            drain_bzcode_stderr(proc),
            relay_client_messages(proc, ws, ready_event),
        )
    except (BrokenPipeError, ConnectionResetError, asyncio.CancelledError):
        pass
    finally:
        _active_cwds.discard(effective_cwd)
        print(f"[ws] disconnect  pid={proc.pid}", file=sys.stderr)
        # Process may have already exited (e.g. crashed) — ignore lookup errors
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
    return ws


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="bzcode bridge + search/session server")
    parser.add_argument("--bzcode", default="./bzcode")
    parser.add_argument("--host",   default="localhost")
    parser.add_argument("--port",   type=int, default=18789)
    parser.add_argument("--cwd",    default=os.getcwd())
    parser.add_argument(
        "--dist",
        default="",
        metavar="DIR",
        help="Path to the Vite production build (dist/) to serve as the frontend. "
             "When set, the HTTP server also serves the SPA on the same port.",
    )
    args = parser.parse_args()

    bzcode_path = os.path.abspath(args.bzcode)
    default_cwd = os.path.abspath(args.cwd)
    port        = args.port   # single port for everything

    async def run() -> None:
        http_app = make_http_app(bzcode_path, default_cwd, port=port)

        # Optionally mount the built frontend
        if args.dist:
            _add_frontend(http_app, Path(args.dist).resolve())

        http_runner = web.AppRunner(http_app)
        await http_runner.setup()
        await web.TCPSite(http_runner, args.host, port).start()

        whatsapp_dir = Path(default_cwd) / "whatsapp"
        whatsapp_dir.mkdir(parents=True, exist_ok=True)

        print(f"bzcode bridge : ws://{args.host}:{port}/ws?cwd=<dir>  or  ?sessionId=<id>", flush=True)
        print(f"HTTP API      : http://{args.host}:{port}/widgets  |  /sessions  |  /search", flush=True)
        if args.dist:
            print(f"Frontend      : http://{args.host}:{port}/", flush=True)
        print(f"WhatsApp hook : http://{args.host}:{port}/whatsapp/incoming", flush=True)
        print(f"bzcode        : {bzcode_path}", flush=True)
        print(f"default cwd   : {default_cwd}", flush=True)
        print(f"whatsapp cwd  : {whatsapp_dir}", flush=True)

        try:
            await asyncio.Future()
        finally:
            await http_runner.cleanup()

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n[server] shutting down", file=sys.stderr)


if __name__ == "__main__":
    main()
