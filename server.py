#!/usr/bin/env python3
"""
Unified server:
  ws://localhost:8765?cwd=/path   — start a fresh bzcode session in that dir
  ws://localhost:8765?sessionId=X — resume an existing session
  http://localhost:8766/sessions  — list sessions (one per directory)
  http://localhost:8766/search    — SerpAPI proxy
"""

BACKEND_VERSION = "0.0.3"

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
    _OWNED_NAMES = {"meta.json", "IDENTITY.md", "SOUL.md", "AGENTS.md", "settings.json", "skills", "scripts",
                    "custom_widgets", "widget_data", ".bzcanvas.json"}
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

    # Copy agent scripts into the session config dir so the agent can reference
    # them by a stable, deployment-agnostic path rather than an absolute one.
    # The session config dir is always at ~/.boltzbit/sessions/{id}/ regardless
    # of where bz-agent is installed.
    _server_dir = Path(__file__).resolve().parent
    src_scripts = _server_dir / "bzcode" / "scripts"
    # Fallback: also check CWD/bzcode/scripts in case server.py is run from a
    # different directory than where it lives (e.g. some workspace deployments).
    if not src_scripts.is_dir():
        _cwd_candidate = Path.cwd() / "bzcode" / "scripts"
        if _cwd_candidate.is_dir():
            src_scripts = _cwd_candidate
        else:
            print(
                f"[session] WARNING: bzcode/scripts not found at {src_scripts} "
                f"or {_cwd_candidate} — agent scripts will be unavailable",
                file=sys.stderr,
            )
    dst_scripts = cfg_dir / "scripts"
    dst_scripts.mkdir(exist_ok=True)
    import shutil as _sh
    for script in src_scripts.glob("*.py"):
        dest = dst_scripts / script.name
        # Only overwrite if source is newer (avoids redundant I/O on every reconnect)
        if not dest.exists() or script.stat().st_mtime > dest.stat().st_mtime:
            _sh.copy2(script, dest)
    print(f"[session] scripts: {src_scripts} → {dst_scripts} ({len(list(dst_scripts.glob('*.py')))} files)", file=sys.stderr)

    # {scripts_path} resolves to the session-local scripts directory.
    # Using the session config dir means no absolute paths leak into templates.
    _session_scripts = str(dst_scripts)

    def _resolve(text: str) -> str:
        return (text
            .replace("{server_data_path}", str(SERVER_DATA_DIR))
            .replace("{scripts_path}",     _session_scripts)
            .replace("{session_dir}",      str(cfg_dir))
            .replace("{working_dir}",      working_dir)
            .replace("{widget_template_table}", _build_widget_template_table())
        )

    # AGENTS.md — workflow instructions with all placeholders resolved.
    agents_md = entry.get("agents_md")
    if agents_md:
        (cfg_dir / "AGENTS.md").write_text(_resolve(agents_md), encoding="utf-8")
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
        skill_path = skills_dir / skill_name / "SKILL.md"
        skill_path.parent.mkdir(parents=True, exist_ok=True)
        skill_path.write_text(_resolve(skill_content), encoding="utf-8")


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

# Per-file cursor positions: abs_path -> {selStart, selEnd}
# Stored in-memory (survives tab switches, cleared on server restart).
_cursor_store: dict = {}

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


def _custom_widgets_dir(session_id: str) -> Path:
    """Return the custom_widgets directory for a session (or global fallback)."""
    if session_id:
        return SESSIONS_DIR / session_id / "custom_widgets"
    return CUSTOM_WIDGETS_DIR


async def handle_get_custom_widget(request: web.Request) -> web.Response:
    """GET /custom-widgets/{canvasId}?sessionId= — read saved code for a canvas widget instance."""
    canvas_id  = request.match_info.get("canvasId", "")
    session_id = request.rel_url.query.get("sessionId", "").strip()
    cwd_dir    = _custom_widgets_dir(session_id)
    p = cwd_dir / f"{canvas_id}.js"
    # Fallback to global store for older widgets
    if not p.exists() and session_id:
        p = CUSTOM_WIDGETS_DIR / f"{canvas_id}.js"
    if not p.exists():
        return web.json_response({"error": "not found"}, status=404, headers=CORS_HEADERS)
    return web.json_response({"canvasId": canvas_id, "code": p.read_text(encoding="utf-8")},
                             headers=CORS_HEADERS)


async def handle_put_custom_widget(request: web.Request) -> web.Response:
    """PUT /custom-widgets/{canvasId}?sessionId= { code } — save edited code."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    canvas_id  = request.match_info.get("canvasId", "")
    session_id = request.rel_url.query.get("sessionId", "").strip()
    if not canvas_id:
        return web.json_response({"error": "canvasId required"}, status=400, headers=CORS_HEADERS)
    try:
        body = await request.json()
        code = str(body.get("code", ""))
        dest = _custom_widgets_dir(session_id)
        dest.mkdir(parents=True, exist_ok=True)
        (dest / f"{canvas_id}.js").write_text(code, encoding="utf-8")
        return web.json_response({"ok": True, "canvasId": canvas_id}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_delete_custom_widget(request: web.Request) -> web.Response:
    """DELETE /custom-widgets/{canvasId}?sessionId= — remove saved custom code."""
    canvas_id  = request.match_info.get("canvasId", "")
    session_id = request.rel_url.query.get("sessionId", "").strip()
    for d in [_custom_widgets_dir(session_id), CUSTOM_WIDGETS_DIR]:
        p = d / f"{canvas_id}.js"
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


def _write_bzcode_credentials(
    access_token: str,
    refresh_token: str = "",
    expires_at=None,
    auth_url: str = "https://boltzhub.com",
) -> None:
    """Write access token to ~/.boltzbit/credentials.json in the format bzcode expects."""
    creds_dir  = Path.home() / ".boltzbit"
    creds_file = creds_dir / "credentials.json"
    creds_dir.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if creds_file.exists():
        try:
            with open(creds_file) as f:
                existing = json.load(f)
        except Exception:
            pass
    prev_entry: dict = existing.get(auth_url, {})
    entry: dict = {"accessToken": access_token}
    # Preserve the existing refreshToken when the caller doesn't supply one.
    resolved_refresh = refresh_token or prev_entry.get("refreshToken", "")
    if resolved_refresh:
        entry["refreshToken"] = resolved_refresh
    # bzcode expects expiresAt in milliseconds. If the caller didn't supply it,
    # parse the exp claim from the JWT itself so we always write a valid expiry.
    if expires_at is None:
        try:
            import base64 as _b64
            seg = access_token.split(".")[1]
            seg += "=" * (4 - len(seg) % 4)
            payload = json.loads(_b64.b64decode(seg.replace("-", "+").replace("_", "/")))
            exp = payload.get("exp")
            if exp:
                expires_at = exp * 1000  # seconds → milliseconds
        except Exception:
            pass
    if expires_at is None:
        # Preserve whatever was there before rather than dropping it.
        expires_at = prev_entry.get("expiresAt")
    if expires_at is not None:
        ms_val = int(expires_at)
        if ms_val < 10_000_000_000:  # looks like seconds → convert
            ms_val *= 1000
        entry["expiresAt"] = ms_val
    existing[auth_url] = entry
    with open(creds_file, "w") as f:
        json.dump(existing, f, indent=2)
    print(f"[auth] credentials written for {auth_url}", file=sys.stderr)


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
    expires_at    = body.get("expiresAt")
    auth_url      = body.get("authUrl", "https://boltzhub.com")

    if not access_token:
        return web.json_response({"error": "accessToken is required"}, status=400, headers=CORS_HEADERS)

    _write_bzcode_credentials(access_token, refresh_token, expires_at, auth_url)
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


async def handle_logout(request: web.Request) -> web.Response:
    """POST /auth/logout — remove stored credentials so the user must re-authenticate."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        body = {}
    auth_url  = body.get("authUrl", "https://boltzhub.com")
    creds_file = Path.home() / ".boltzbit" / "credentials.json"
    try:
        if creds_file.exists():
            existing: dict = {}
            with open(creds_file) as f:
                existing = json.load(f)
            existing.pop(auth_url, None)   # remove expired entry
            with open(creds_file, "w") as f:
                json.dump(existing, f, indent=2)
        print(f"[auth] credentials cleared for {auth_url}", file=sys.stderr)
    except Exception as exc:
        print(f"[auth] logout error: {exc}", file=sys.stderr)
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
    default_cwd = request.app.get("default_cwd", os.getcwd())
    path_str = request.rel_url.query.get("path", default_cwd).strip() or default_cwd
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
    # Verify parent exists and is writable before attempting mkdir
    parent_path = Path(parent)
    if not parent_path.exists() or not parent_path.is_dir():
        return web.json_response({"error": f"parent directory not found: {parent}"}, status=400, headers=CORS_HEADERS)
    if not os.access(parent_path, os.W_OK):
        return web.json_response({"error": f"no write permission on {parent} — check server process user and directory ownership"}, status=403, headers=CORS_HEADERS)
    try:
        new_dir.mkdir(parents=False, exist_ok=False)
        return web.json_response({"path": str(new_dir)}, headers=CORS_HEADERS)
    except FileExistsError:
        return web.json_response({"error": "folder already exists"}, status=409, headers=CORS_HEADERS)
    except PermissionError as exc:
        return web.json_response({"error": f"permission denied: {exc} — ensure the server process has write access to {parent}"}, status=403, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


def _canvas_file(session_id: str, cwd: str) -> Path:
    """Return the .bzcanvas.json path — session dir preferred, cwd as fallback."""
    if session_id:
        return SESSIONS_DIR / session_id / ".bzcanvas.json"
    return Path(cwd) / ".bzcanvas.json"


async def handle_get_canvas(request: web.Request) -> web.Response:
    """Load canvas layout. Prefers session dir; falls back to cwd."""
    session_id = request.rel_url.query.get("sessionId", "").strip()
    cwd        = request.rel_url.query.get("cwd", "").strip()
    canvas_file = _canvas_file(session_id, cwd)
    if not canvas_file.exists():
        return web.json_response({"widgets": []}, headers=CORS_HEADERS)
    try:
        with open(canvas_file, encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response(data, headers=CORS_HEADERS)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500, headers=CORS_HEADERS)


async def handle_post_canvas(request: web.Request) -> web.Response:
    """Save canvas layout. Writes to session dir when sessionId is provided."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    session_id = request.rel_url.query.get("sessionId", "").strip()
    cwd        = request.rel_url.query.get("cwd", "").strip()
    if not session_id and (not cwd or not os.path.isdir(cwd)):
        return web.json_response({"error": "sessionId or valid cwd required"}, status=400, headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    canvas_file = _canvas_file(session_id, cwd)
    canvas_file.parent.mkdir(parents=True, exist_ok=True)
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

    session_id   = str(body.get("sessionId", "")).strip()
    cwd   = str(body.get("cwd", "")).strip()
    title = str(body.get("title", "Widget")).strip()
    code  = str(body.get("code", "")).strip()
    w     = int(body.get("w", 380))
    h     = int(body.get("h", 280))
    x     = body.get("x")
    y     = body.get("y")
    initial_data = body.get("initialData") or []

    if not session_id and (not cwd or not os.path.isdir(cwd)):
        return web.json_response({"error": "sessionId or valid cwd required"}, status=400, headers=CORS_HEADERS)
    if not code:
        return web.json_response({"error": "code is required"}, status=400, headers=CORS_HEADERS)

    # ── 1. Generate a stable canvas ID ───────────────────────────────────────
    import secrets as _sec
    canvas_id = _sec.token_hex(5)

    # ── 2. Save widget code to session/custom_widgets/{canvasId}.js ──────────
    widget_code_dir = _custom_widgets_dir(session_id)
    widget_code_dir.mkdir(parents=True, exist_ok=True)
    (widget_code_dir / f"{canvas_id}.js").write_text(code, encoding="utf-8")

    # ── 3. Seed initial data rows if provided ─────────────────────────────────
    if initial_data:
        import datetime as _dt
        widget_data_dir = (SESSIONS_DIR / session_id / "widget_data") if session_id else (SERVER_DATA_DIR / "widget_data")
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

    # ── 4. Update .bzcanvas.json in session dir ───────────────────────────────
    canvas_file = _canvas_file(session_id, cwd)
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


async def handle_get_widget_template(request: web.Request) -> web.Response:
    """GET /widgets/template?name=pie — return the raw JS of a built-in template."""
    name = request.rel_url.query.get("name", "").strip()
    if not name:
        return web.json_response({"error": "name required"}, status=400, headers=CORS_HEADERS)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    path = WIDGETS_DIR / f"{safe}.js"
    if not path.exists():
        return web.json_response({"error": f"template not found: {name}"}, status=404, headers=CORS_HEADERS)
    return web.Response(text=path.read_text(encoding="utf-8"),
                        content_type="application/javascript", headers=CORS_HEADERS)


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
        by_dir_mode: dict = {}  # wd → (meta_mtime, mode)

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
            env={**os.environ, "BZ_PYTHON": sys.executable},
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
                env={**os.environ, "BZ_PYTHON": sys.executable},
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


async def handle_version(request: web.Request) -> web.Response:
    """GET /api/version — server and protocol version info."""
    return web.json_response({"backend": BACKEND_VERSION}, headers=CORS_HEADERS)


async def handle_home(request: web.Request) -> web.Response:
    """GET /api/home — return the server's home directory and default working directory.

    Mobile / external clients use this instead of hardcoding '/home/user' so they
    always get a valid starting directory even if the workspace layout differs.
    """
    default_cwd = request.app.get("default_cwd", os.getcwd())
    home = str(Path.home())
    return web.json_response({
        "home":       home,
        "defaultCwd": default_cwd if os.path.isdir(default_cwd) else home,
    }, headers=CORS_HEADERS)


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


def _widget_path(canvas_id: str, session_id: str = "") -> Path:
    if not _CANVAS_ID_RE.match(canvas_id):
        raise ValueError(f"Invalid canvasId: {canvas_id!r}")
    # Prefer session-scoped widget_data when a session owns this widget
    if session_id:
        session_dir = SESSIONS_DIR / session_id / "widget_data"
        p = session_dir / f"{canvas_id}.json"
        if p.exists() or not (WIDGET_DATA_DIR / f"{canvas_id}.json").exists():
            session_dir.mkdir(parents=True, exist_ok=True)
            return p
    WIDGET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    return WIDGET_DATA_DIR / f"{canvas_id}.json"


def _widget_load(canvas_id: str, session_id: str = "") -> dict:
    p = _widget_path(canvas_id, session_id)
    if not p.exists():
        return {"_next_id": 1, "records": []}
    with open(p) as f:
        return json.load(f)


def _widget_save(canvas_id: str, data: dict, session_id: str = "") -> None:
    p = _widget_path(canvas_id, session_id)
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
        sid     = request.query.get("sessionId", "").strip()
        data    = _widget_load(cid, sid)
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
        sid  = request.query.get("sessionId", "").strip()
        body = await request.json()
        rows = body.get("rows") or ([body["row"]] if "row" in body else [])
        if not rows:
            return _wj({"error": "Provide 'row' or 'rows'"}, 400)
        with _widget_lock(cid):
            data = _widget_load(cid, sid)
            inserted = []
            for row in rows:
                row = {k: v for k, v in row.items() if k not in ("id", "created_at")}
                row["id"] = data["_next_id"]
                row["created_at"] = _dt.datetime.utcnow().isoformat() + "Z"
                data["_next_id"] += 1
                data["records"].append(row)
                inserted.append(row)
            _widget_save(cid, data, sid)
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
        sid    = request.query.get("sessionId", "").strip()
        row_id = int(request.match_info["id"])
        body   = await request.json()
        patch  = {k: v for k, v in body.get("data", {}).items()
                  if k not in ("id", "created_at")}
        if not patch:
            return _wj({"error": "'data' required"}, 400)
        with _widget_lock(cid):
            data = _widget_load(cid, sid)
            for r in data["records"]:
                if r.get("id") == row_id:
                    r.update(patch)
                    _widget_save(cid, data, sid)
                    return _wj({"updated": r})
        return _wj({"error": "Row not found"}, 404)
    except Exception as exc:
        return _wj({"error": str(exc)}, 400)


async def handle_widget_delete(request: web.Request) -> web.Response:
    """DELETE /db/widget/{canvasId}/rows/{id}"""
    try:
        cid    = request.match_info["canvasId"]
        sid    = request.query.get("sessionId", "").strip()
        row_id = int(request.match_info["id"])
        with _widget_lock(cid):
            data    = _widget_load(cid, sid)
            before  = len(data["records"])
            data["records"] = [r for r in data["records"] if r.get("id") != row_id]
            if len(data["records"]) == before:
                return _wj({"error": "Row not found"}, 404)
            _widget_save(cid, data, sid)
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
        sid  = request.query.get("sessionId", "").strip()
        body = await request.json()
        code = body.get("code", "").strip()
        if not code:
            return _wj({"error": "'code' is required"}, 400)
        data    = _widget_load(cid, sid)
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


# ── Document parsing ─────────────────────────────────────────────────────────

_MAX_DOC_CHARS = 80_000
_MAX_DOC_BYTES = 50 * 1024 * 1024  # 50 MB

# ── DOCX ↔ Block JSON conversion (bz-office format) ─────────────────────────

def _docx_to_blocks(data: bytes) -> list:
    """Convert DOCX binary → Block[] in bz-office JSON format."""
    import docx as _docx
    import io, secrets
    from docx.oxml.ns import qn

    doc = _docx.Document(io.BytesIO(data))
    blocks = []

    def _run_styles(para) -> list:
        styles, pos = [], 0
        for run in para.runs:
            n = len(run.text)
            if not n:
                pos += n; continue
            sr = {"start": pos, "end": pos + n}
            if run.bold:        sr["isBold"] = True
            if run.italic:      sr["isItalic"] = True
            if run.underline:   sr["isUnderlined"] = True
            if getattr(run.font, "strike", None): sr["isStrikethrough"] = True
            if run.font.size:   sr["fontSize"] = int(run.font.size.pt)
            if run.font.color and run.font.color.type is not None:
                try: sr["textColor"] = f"#{run.font.color.rgb}"
                except Exception: pass
            if len(sr) > 2: styles.append(sr)
            pos += n
        return styles

    def _heading_size(style_name: str):
        for level, size in (("1", 24), ("2", 20), ("3", 18), ("4", 16)):
            if style_name == f"Heading {level}":
                return size
        return None

    def _para_to_block(para) -> dict:
        text   = para.text
        styles = _run_styles(para)
        block  = {"text": text, "styles": styles}

        # Heading → override styles with bold + large font
        sname = para.style.name if para.style else ""
        size  = _heading_size(sname)
        if size:
            block["styles"] = [{"start": 0, "end": len(text), "fontSize": size, "isBold": True}]

        # Bullet / numbered list
        try:
            numPr = para._p.pPr.numPr if para._p.pPr is not None else None
            if numPr is not None:
                block["prefix"] = "•"
                ilvl = numPr.ilvl
                block["indent"] = int(ilvl.val) + 1 if ilvl is not None else 1
        except Exception:
            pass

        return block

    for child in doc.element.body.iterchildren():
        tag = child.tag.split("}")[-1]

        if tag == "p":
            try:
                from docx.text.paragraph import Paragraph
                para  = Paragraph(child, doc)
                block = _para_to_block(para)
                if block["text"].strip() or not blocks:
                    blocks.append(block)
            except Exception:
                pass

        elif tag == "tbl":
            try:
                from docx.table import Table
                table  = Table(child, doc)
                tid    = secrets.token_hex(8)
                n_rows = len(table.rows)
                n_cols = max((len(r.cells) for r in table.rows), default=0)
                for r_idx, row in enumerate(table.rows):
                    for c_idx, cell in enumerate(row.cells):
                        blocks.append({
                            "text":            cell.text,
                            "styles":          [],
                            "isTableCell":     True,
                            "tableId":         tid,
                            "rowIndex":        r_idx,
                            "columnIndex":     c_idx,
                            "numberOfRows":    n_rows,
                            "numberOfColumns": n_cols,
                        })
            except Exception:
                pass

    return blocks


def _blocks_to_docx(blocks: list) -> bytes:
    """Convert Block[] (bz-office format) → DOCX binary."""
    import docx as _docx
    import io
    from docx.shared import Pt, RGBColor

    doc = _docx.Document()

    # Group consecutive table cells by tableId
    i = 0
    while i < len(blocks):
        b = blocks[i]

        if b.get("isTableCell"):
            tid = b.get("tableId")
            cells = [c for c in blocks if c.get("tableId") == tid]
            n_rows = b.get("numberOfRows", 1)
            n_cols = b.get("numberOfColumns", 1)
            tbl = doc.add_table(rows=n_rows, cols=n_cols)
            tbl.style = "Table Grid"
            for cell in cells:
                r, c = cell.get("rowIndex", 0), cell.get("columnIndex", 0)
                try:
                    tbl.rows[r].cells[c].text = cell.get("text", "")
                    if r == 0:
                        for run in tbl.rows[r].cells[c].paragraphs[0].runs:
                            run.bold = True
                except Exception:
                    pass
            # Skip all cells belonging to this table
            while i < len(blocks) and blocks[i].get("tableId") == tid:
                i += 1
            continue

        # Regular paragraph
        text   = b.get("text", "")
        styles = b.get("styles", [])
        prefix = b.get("prefix", "")
        indent = b.get("indent", 0)

        # Detect heading via fontSize
        heading_size = None
        for sr in styles:
            if sr.get("isBold") and sr.get("start", 0) == 0 and sr.get("end", 0) == len(text):
                fs = sr.get("fontSize", 0)
                if fs >= 24: heading_size = 1
                elif fs >= 20: heading_size = 2
                elif fs >= 18: heading_size = 3

        if heading_size:
            para = doc.add_heading(text, level=heading_size)
        elif prefix == "•":
            para = doc.add_paragraph(style="List Bullet")
            para.add_run(text)
        else:
            para = doc.add_paragraph()
            if not styles:
                para.add_run(text)
            else:
                # Apply style ranges
                cursor = 0
                for sr in sorted(styles, key=lambda s: s.get("start", 0)):
                    s, e = sr.get("start", 0), sr.get("end", len(text))
                    if cursor < s:
                        para.add_run(text[cursor:s])
                    run = para.add_run(text[s:e])
                    run.bold        = sr.get("isBold", False)
                    run.italic      = sr.get("isItalic", False)
                    run.underline   = sr.get("isUnderlined", False)
                    if sr.get("fontSize"):
                        run.font.size = Pt(sr["fontSize"])
                    if sr.get("textColor"):
                        try:
                            hex_c = sr["textColor"].lstrip("#")
                            run.font.color.rgb = RGBColor(
                                int(hex_c[0:2], 16), int(hex_c[2:4], 16), int(hex_c[4:6], 16)
                            )
                        except Exception:
                            pass
                    cursor = e
                if cursor < len(text):
                    para.add_run(text[cursor:])

        if indent and not heading_size:
            from docx.shared import Inches
            para.paragraph_format.left_indent = Inches(indent * 0.25)

        i += 1

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _parse_pdf(data: bytes) :
    import pypdf
    import io
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = len(reader.pages)
    parts = []
    for i, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        if text.strip():
            parts.append(f"# Page {i}\n\n{text.strip()}")
    return pages, "\n\n".join(parts)

def _parse_docx(data: bytes) :
    import docx
    import io
    doc = docx.Document(io.BytesIO(data))
    parts = []
    heading_map = {1: "#", 2: "##", 3: "###", 4: "####"}
    for para in doc.paragraphs:
        style = para.style.name if para.style else ""
        text  = para.text.strip()
        if not text:
            continue
        level = next((int(s) for s in ("1","2","3","4") if style == f"Heading {s}"), None)
        if level:
            parts.append(f"{heading_map[level]} {text}")
        else:
            parts.append(text)
    for table in doc.tables:
        rows = []
        for i, row in enumerate(table.rows):
            cells = [c.text.strip() for c in row.cells]
            rows.append("| " + " | ".join(cells) + " |")
            if i == 0:
                rows.append("| " + " | ".join(["---"] * len(cells)) + " |")
        parts.append("\n".join(rows))
    page_count = max(1, len(parts) // 10)  # approximate
    return page_count, "\n\n".join(parts)

def _parse_xlsx(data: bytes) :
    import openpyxl
    import io
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    parts = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        # Drop fully-empty rows
        rows = [r for r in rows if any(c is not None for c in r)]
        if not rows:
            continue
        rows = rows[:1000]  # cap at 1000 rows
        parts.append(f"## Sheet: {sheet_name}")
        header = rows[0]
        parts.append("| " + " | ".join(str(c) if c is not None else "" for c in header) + " |")
        parts.append("| " + " | ".join(["---"] * len(header)) + " |")
        for row in rows[1:]:
            parts.append("| " + " | ".join(str(c) if c is not None else "" for c in row) + " |")
    return len(wb.sheetnames), "\n\n".join(parts)

def _parse_pptx(data: bytes) :
    from pptx import Presentation
    import io
    prs = Presentation(io.BytesIO(data))
    parts = []
    for i, slide in enumerate(prs.slides, 1):
        title_text = ""
        body_lines = []
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            text = shape.text_frame.text.strip()
            if not text:
                continue
            if shape.shape_type == 13:  # picture
                continue
            if not title_text and hasattr(shape, "placeholder_format") and shape.placeholder_format:
                title_text = text
            else:
                for para in shape.text_frame.paragraphs:
                    pt = para.text.strip()
                    if pt:
                        body_lines.append(f"- {pt}")
        header = f"## Slide {i}: {title_text}" if title_text else f"## Slide {i}"
        parts.append(header + ("\n" + "\n".join(body_lines) if body_lines else ""))
    return len(prs.slides), "\n\n".join(parts)

_DOCX_EXTS = {".docx", ".doc"}

def _detect_and_parse(filename: str, data: bytes) -> dict:
    ext = Path(filename).suffix.lower()
    fmt = ext.lstrip(".")
    if fmt in ("doc", "xls", "ppt"):
        fmt = {"doc": "docx", "xls": "xlsx", "ppt": "pptx"}[fmt]

    # DOCX/DOC → return Block[] (bz-office format); other formats → markdown text
    if ext in _DOCX_EXTS:
        blocks     = _docx_to_blocks(data)
        word_count = sum(len(b.get("text", "").split()) for b in blocks)
        return {
            "filename":  filename,
            "type":      fmt,
            "pages":     max(1, len([b for b in blocks if not b.get("isTableCell")]) // 30),
            "wordCount": word_count,
            "truncated": False,
            "blocks":    blocks,
        }

    parsers = {
        ".pdf":  _parse_pdf,
        ".xlsx": _parse_xlsx,
        ".xls":  _parse_xlsx,
        ".pptx": _parse_pptx,
        ".ppt":  _parse_pptx,
    }
    if ext not in parsers:
        raise ValueError(f"unsupported format: {ext or '(no extension)'}")
    pages, content = parsers[ext](data)
    truncated = len(content) > _MAX_DOC_CHARS
    if truncated:
        content = content[:_MAX_DOC_CHARS]
    return {
        "filename":  filename,
        "type":      fmt,
        "pages":     pages,
        "wordCount": len(content.split()),
        "truncated": truncated,
        "content":   content,
    }

async def handle_parse_doc(request: web.Request) -> web.Response:
    """POST /api/doc/parse — parse PDF/DOCX/XLSX/PPTX.
    Accepts JSON { path } for files on disk, or multipart form with a 'file' field."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        ct = request.content_type or ""
        if "multipart" in ct:
            reader = await request.multipart()
            field  = await reader.next()
            if field is None or field.name != "file":
                return web.json_response({"error": "expected field 'file'"}, status=400, headers=CORS_HEADERS)
            filename = field.filename or "upload"
            data = await field.read()
        else:
            body = await request.json()
            path_str = str(body.get("path", "")).strip()
            if not path_str:
                return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
            p = Path(path_str)
            if not p.exists():
                return web.json_response({"error": "file not found"}, status=404, headers=CORS_HEADERS)
            if p.stat().st_size > _MAX_DOC_BYTES:
                return web.json_response({"error": "file too large (max 50 MB)"}, status=413, headers=CORS_HEADERS)
            data     = p.read_bytes()
            filename = p.name
        result = _detect_and_parse(filename, data)
        return web.json_response(result, headers=CORS_HEADERS)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": f"could not parse: {exc}"}, status=422, headers=CORS_HEADERS)


async def handle_save_doc(request: web.Request) -> web.Response:
    """PUT /api/doc/save { path, blocks } — convert Block[] (bz-office format) → DOCX and save."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)

    path_str = str(body.get("path", "")).strip()
    blocks   = body.get("blocks")
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    if not isinstance(blocks, list):
        return web.json_response({"error": "blocks (array) required"}, status=400, headers=CORS_HEADERS)

    p = Path(path_str)
    if p.suffix.lower() not in (".docx", ".doc"):
        return web.json_response({"error": "only DOCX files can be saved"}, status=400, headers=CORS_HEADERS)

    try:
        docx_bytes = _blocks_to_docx(blocks)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(docx_bytes)
        word_count = sum(len(b.get("text", "").split()) for b in blocks)
        return web.json_response({"ok": True, "path": str(p), "wordCount": word_count}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": f"could not save: {exc}"}, status=500, headers=CORS_HEADERS)


async def handle_excel_load(request: web.Request) -> web.Response:
    """GET /api/excel/load?path=<abs> — parse XLSX → bz-office cell JSON format."""
    path_str = request.rel_url.query.get("path", "").strip()
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    p = Path(path_str)
    if not p.exists():
        return web.json_response({"error": "file not found"}, status=404, headers=CORS_HEADERS)
    try:
        import openpyxl

        wb_vals  = openpyxl.load_workbook(p, data_only=True)   # cached computed values
        wb_forms = openpyxl.load_workbook(p, data_only=False)  # raw formula strings

        # ── Step 1: extract every formula string keyed by (sheet_title, cell_id) ──
        formula_strs: dict = {}  # {sheet_title: {cell_id: "=..."}}
        for ws in wb_forms.worksheets:
            fm = {}
            for row in ws.iter_rows():
                for cell in row:
                    v = cell.value
                    if isinstance(v, str) and v.startswith('='):
                        col_letter = openpyxl.utils.get_column_letter(cell.column)
                        fm[f"{col_letter}{cell.row}"] = v
            formula_strs[ws.title] = fm

        # ── Step 2: evaluate all formulas with the `formulas` library ──
        # Result: {sheet_title: {cell_id: numeric_or_string_value}}
        formula_vals: dict = {}
        try:
            import formulas
            xl_model = formulas.ExcelModel().loads(str(p)).finish()
            xl_inputs = xl_model.calculate()
            for ref, result in xl_inputs.items():
                try:
                    val = result.value
                    # Unwrap numpy arrays / nested iterables up to 4 levels
                    for _ in range(4):
                        if hasattr(val, '__iter__') and not isinstance(val, str):
                            inner = list(val)
                            val = inner[0] if len(inner) == 1 else inner
                        else:
                            break
                    if val is None or str(val) in ('nan', 'None', '', 'ERROR'):
                        continue
                    stored = float(val) if isinstance(val, (int, float)) else str(val)
                    # ref is like "Sheet1!B12" or "'Sheet 1'!B12"
                    ref_str = str(ref)
                    if '!' in ref_str:
                        sheet_part, cell_part = ref_str.split('!', 1)
                        sheet_part = sheet_part.strip("'")
                    else:
                        sheet_part = wb_forms.worksheets[0].title
                        cell_part = ref_str
                    cell_part = cell_part.upper()
                    # match sheet name case-insensitively
                    for ws in wb_forms.worksheets:
                        if ws.title.upper() == sheet_part.upper():
                            formula_vals.setdefault(ws.title, {})[cell_part] = stored
                            break
                except Exception:
                    pass
        except Exception:
            pass  # formulas lib unavailable — fall back to openpyxl cached values

        # ── Step 3: build cell data ──
        sheets = []
        for ws in wb_vals.worksheets:
            cells = {}
            col_widths, row_heights = {}, {}
            sheet_fmstrs = formula_strs.get(ws.title, {})
            sheet_fmvals = formula_vals.get(ws.title, {})
            max_row = max(ws.max_row or 0, 1)
            max_col = max(ws.max_column or 0, 1)

            for row in ws.iter_rows(max_row=min(max_row, 1000), max_col=min(max_col, 702)):
                for cell in row:
                    col_letter = openpyxl.utils.get_column_letter(cell.column)
                    cell_id = f"{col_letter}{cell.row}"
                    formula = sheet_fmstrs.get(cell_id)

                    if formula:
                        # Formula cell: prefer evaluated value, then openpyxl cached value
                        v = sheet_fmvals.get(cell_id.upper()) or sheet_fmvals.get(cell_id)
                        if v is None:
                            v = cell.value  # cached by Excel (None if saved by openpyxl)
                    else:
                        v = cell.value

                    # Skip entirely empty, unstyled, non-formula cells
                    if v is None and not cell.has_style and not formula:
                        continue

                    cd: dict = {}
                    if formula:
                        cd["formula"] = formula
                    if v is not None:
                        cd["value"] = v if isinstance(v, (int, float)) else str(v)

                    # ── Formatting ──
                    try:
                        if cell.font:
                            if cell.font.bold:   cd["fontBold"] = True
                            if cell.font.italic: cd["fontItalic"] = True
                            if cell.font.name:   cd["fontFamily"] = cell.font.name
                            if cell.font.size:   cd["fontSize"] = int(cell.font.size * 20)
                            if cell.font.color:
                                try:
                                    rgb = str(cell.font.color.rgb)
                                    # Validate: openpyxl returns error msg string for theme colors
                                    if rgb and len(rgb) in (6, 8) and all(c in '0123456789ABCDEFabcdef' for c in rgb):
                                        cd["fontColor"] = rgb
                                except Exception:
                                    pass
                        if cell.fill and cell.fill.fgColor:
                            try:
                                rgb = str(cell.fill.fgColor.rgb)
                                if rgb and len(rgb) in (6, 8) and all(c in '0123456789ABCDEFabcdef' for c in rgb) and rgb not in ("00000000", "000000"):
                                    cd["bgColor"] = rgb
                            except Exception:
                                pass
                        if cell.alignment:
                            h  = (cell.alignment.horizontal or "").upper()
                            v2 = (cell.alignment.vertical   or "").upper()
                            if h or v2:
                                cd["align"] = f"{h};{v2}"
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

            sheets.append({
                "sheetName": ws.title,
                "cells": cells,
                "images": [],
                "columnIndexToWidth": col_widths,
                "rowIndexToHeight": row_heights,
                "hiddenColIndices": [],
                "hiddenRowIndices": [],
                "mergedCellIndices": [],
            })

        result = {"id": p.stem, "name": p.stem, "sheets": sheets, "sources": []}
        return web.Response(
            text=json.dumps(result, default=str),
            content_type="application/json",
            headers=CORS_HEADERS,
        )
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


def _eval_excel_formula(formula: str, cells: dict) -> object:
    """Evaluate common Excel formulas against a cell dict {cell_id: {value: ...}}."""
    import re as _re
    if not formula.startswith('='):
        return None
    expr = formula[1:].strip()

    def cell_val(cid):
        cid = cid.upper()
        cd = cells.get(cid, {})
        v = cd.get("value")
        if v is None: return 0
        try: return float(v)
        except: return 0

    def expand_range(r):
        """Expand A1:A10 to list of cell ids."""
        m = _re.match(r'^([A-Z]+)(\d+):([A-Z]+)(\d+)$', r.upper())
        if not m: return [r.upper()]
        import openpyxl.utils as _ou
        c1 = _ou.column_index_from_string(m.group(1))
        r1 = int(m.group(2))
        c2 = _ou.column_index_from_string(m.group(3))
        r2 = int(m.group(4))
        return [f"{_ou.get_column_letter(c)}{r}" for r in range(r1, r2+1) for c in range(c1, c2+1)]

    try:
        # Handle SUM(range)
        m = _re.fullmatch(r'SUM\(([^)]+)\)', expr, _re.I)
        if m:
            vals = [cell_val(cid) for cid in expand_range(m.group(1).strip())]
            return sum(vals)

        # Handle AVERAGE(range)
        m = _re.fullmatch(r'AVERAGE\(([^)]+)\)', expr, _re.I)
        if m:
            vals = [cell_val(cid) for cid in expand_range(m.group(1).strip())]
            return sum(vals)/len(vals) if vals else 0

        # Handle COUNT(range)
        m = _re.fullmatch(r'COUNT\(([^)]+)\)', expr, _re.I)
        if m:
            vals = [1 for cid in expand_range(m.group(1).strip()) if cells.get(cid.upper(), {}).get("value") not in (None, '')]
            return sum(vals)

        # Handle MIN/MAX(range)
        m = _re.fullmatch(r'(MIN|MAX)\(([^)]+)\)', expr, _re.I)
        if m:
            vals = [cell_val(cid) for cid in expand_range(m.group(2).strip())]
            return min(vals) if m.group(1).upper() == 'MIN' else max(vals)

        # Replace cell references in arithmetic expression (e.g. A1+B2*C3)
        def repl_cell(m2):
            return str(cell_val(m2.group(0)))
        arith = _re.sub(r'[A-Z]+\d+', repl_cell, expr.upper())
        # Only evaluate if it's a simple arithmetic expression
        if _re.fullmatch(r'[\d\s\.\+\-\*\/\(\)]+', arith):
            result = eval(arith, {"__builtins__": {}})  # nosec — restricted input
            return result
    except Exception:
        pass
    return None


async def handle_excel_save(request: web.Request) -> web.Response:
    """PUT /api/excel/save { path, sheets } — save cell data back to XLSX."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    path_str = str(body.get("path", "")).strip()
    sheets_data = body.get("sheets", [])
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        for sheet in sheets_data:
            ws = wb.create_sheet(title=sheet.get("sheetName", "Sheet"))
            cells = sheet.get("cells", {})
            for cell_id, cd in cells.items():
                try:
                    cell = ws[cell_id]
                    formula = cd.get("formula")
                    v = cd.get("value")
                    if formula and isinstance(formula, str) and formula.startswith('='):
                        cell.value = formula  # preserve formula so Excel recalculates
                    elif v is not None:
                        try: cell.value = float(v) if isinstance(v, str) and v.replace('.','',1).lstrip('-').isdigit() else v
                        except: cell.value = v
                    font_kw = {}
                    if cd.get("fontBold"):   font_kw["bold"] = True
                    if cd.get("fontItalic"): font_kw["italic"] = True
                    if cd.get("fontFamily"): font_kw["name"] = cd["fontFamily"]
                    if cd.get("fontSize"):   font_kw["size"] = cd["fontSize"] / 20
                    if font_kw: cell.font = Font(**font_kw)
                except Exception:
                    pass
        p = Path(path_str)
        p.parent.mkdir(parents=True, exist_ok=True)
        wb.save(p)
        return web.json_response({"ok": True, "path": str(p)}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_ppt_load(request: web.Request) -> web.Response:
    """GET /api/ppt/load?path=<abs> — parse PPTX → slide JSON."""
    path_str = request.rel_url.query.get("path", "").strip()
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    p = Path(path_str)
    if not p.exists():
        return web.json_response({"error": "file not found"}, status=404, headers=CORS_HEADERS)
    try:
        from pptx import Presentation
        from pptx.util import Pt
        from pptx.enum.text import PP_ALIGN
        import base64, io

        prs = Presentation(str(p))
        sw = prs.slide_width   # EMU
        sh = prs.slide_height  # EMU
        CW, CH = 896, 504       # canvas pixels

        def emu_to_canvas(emu_x, emu_y, emu_w, emu_h):
            return (
                round(emu_x / sw * CW, 2),
                round(emu_y / sh * CH, 2),
                round(emu_w / sw * CW, 2),
                round(emu_h / sh * CH, 2),
            )

        def rgb_to_hex(rgb):
            if rgb is None:
                return None
            try:
                return f"#{rgb.r:02x}{rgb.g:02x}{rgb.b:02x}"
            except Exception:
                return None

        slides_out = []
        for slide in prs.slides:
            # Background color
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
                    x, y, w, h = emu_to_canvas(shape.left, shape.top, shape.width, shape.height)
                    box_id = str(shape.shape_id)

                    # Image shape
                    if shape.shape_type == 13:  # MSO_SHAPE_TYPE.PICTURE
                        try:
                            img_bytes = shape.image.blob
                            mime = shape.image.content_type or "image/png"
                            b64 = base64.b64encode(img_bytes).decode()
                            boxes.append({
                                "id": box_id, "x": x, "y": y, "w": w, "h": h,
                                "text": f"data:{mime};base64,{b64}",
                                "styles": [], "boxStyle": {"bgColor": "transparent"},
                            })
                        except Exception:
                            pass
                        continue

                    # Text box or auto-shape with text
                    if shape.has_text_frame:
                        full_text = ""
                        styles = []
                        char_offset = 0
                        box_style = {"bgColor": "transparent", "fontSize": 16, "fontWeight": 400, "color": "#000000"}

                        for para in shape.text_frame.paragraphs:
                            for run in para.runs:
                                rt = run.text
                                if not rt:
                                    continue
                                style_entry = {"start": char_offset, "end": char_offset + len(rt) - 1}
                                rf = run.font
                                if rf.bold:       style_entry["fontWeight"] = "bold"
                                if rf.italic:     style_entry["fontStyle"] = "italic"
                                if rf.underline:  style_entry["textDecoration"] = "underline"
                                if rf.size:       style_entry["fontSize"] = round(rf.size / 12700)  # EMU→pt
                                try:
                                    c = rf.color.rgb; style_entry["color"] = f"#{c.r:02x}{c.g:02x}{c.b:02x}"
                                except Exception:
                                    pass
                                styles.append(style_entry)
                                full_text += rt
                                char_offset += len(rt)
                            if para != shape.text_frame.paragraphs[-1]:
                                full_text += "\n"; char_offset += 1

                        # Box-level font from first run
                        try:
                            first_run = shape.text_frame.paragraphs[0].runs[0] if shape.text_frame.paragraphs[0].runs else None
                            if first_run:
                                if first_run.font.size:       box_style["fontSize"] = round(first_run.font.size / 12700)
                                if first_run.font.bold:       box_style["fontWeight"] = "bold"
                                try:
                                    c = first_run.font.color.rgb; box_style["color"] = f"#{c.r:02x}{c.g:02x}{c.b:02x}"
                                except Exception:
                                    pass
                        except Exception:
                            pass

                        # Shape background fill
                        try:
                            fill = shape.fill
                            if fill.type is not None:
                                c = fill.fore_color.rgb; box_style["bgColor"] = f"#{c.r:02x}{c.g:02x}{c.b:02x}"
                        except Exception:
                            pass

                        boxes.append({
                            "id": box_id, "x": x, "y": y, "w": w, "h": h,
                            "text": full_text, "styles": styles, "boxStyle": box_style,
                        })
                except Exception:
                    pass

            slides_out.append({"bgColor": bg_color, "boxes": boxes})

        result = {"slides": slides_out}
        return web.Response(text=json.dumps(result, default=str), content_type="application/json", headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_ppt_save(request: web.Request) -> web.Response:
    """PUT /api/ppt/save { path, slides } — save slide JSON → PPTX."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    path_str = str(body.get("path", "")).strip()
    slides_data = body.get("slides", [])
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    try:
        from pptx import Presentation
        from pptx.util import Emu, Pt
        from pptx.dml.color import RGBColor
        import base64, io, re

        CW, CH = 896, 504

        # Try to preserve original slide dimensions if file exists
        p = Path(path_str)
        if p.exists():
            prs = Presentation(str(p))
        else:
            prs = Presentation()
        sw = prs.slide_width
        sh = prs.slide_height

        def canvas_to_emu(cx, cy, cw, ch):
            return (
                int(cx / CW * sw), int(cy / CH * sh),
                int(cw / CW * sw), int(ch / CH * sh),
            )

        def hex_to_rgb(hex_str):
            hex_str = (hex_str or "").lstrip("#")
            if len(hex_str) == 6:
                return RGBColor(int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))
            return None

        # Remove all existing slides
        xml_slides = prs.slides._sldIdLst
        for _ in range(len(prs.slides)):
            rId = prs.slides._sldIdLst[0].get("r:id")
            prs.part.drop_rel(rId)
            del prs.slides._sldIdLst[0]

        slide_layout = prs.slide_layouts[6]  # blank layout

        for slide_data in slides_data:
            slide = prs.slides.add_slide(slide_layout)

            # Background
            bg_color_str = slide_data.get("bgColor", "#ffffff")
            try:
                rgb = hex_to_rgb(bg_color_str)
                if rgb:
                    bg = slide.background.fill
                    bg.solid(); bg.fore_color.rgb = rgb
            except Exception:
                pass

            for box in slide_data.get("boxes", []):
                x_e, y_e, w_e, h_e = canvas_to_emu(box["x"], box["y"], box["w"], box["h"])
                text_val = box.get("text", "")

                # Image box
                if isinstance(text_val, str) and text_val.startswith("data:image"):
                    try:
                        header, data = text_val.split(",", 1)
                        img_bytes = base64.b64decode(data)
                        ext = re.search(r"data:image/(\w+)", header)
                        suffix = f".{ext.group(1)}" if ext else ".png"
                        buf = io.BytesIO(img_bytes)
                        slide.shapes.add_picture(buf, x_e, y_e, w_e, h_e)
                    except Exception:
                        pass
                    continue

                # Shape
                if isinstance(text_val, str) and text_val.startswith("shape:"):
                    try:
                        import json as _json
                        sc = _json.loads(text_val[6:])
                        from pptx.enum.shapes import MSO_SHAPE_TYPE
                        from pptx.util import Emu as _Emu
                        shape_type = 9 if sc.get("type") == "circle" else 1  # oval=9, rectangle=1
                        sp = slide.shapes.add_shape(shape_type, x_e, y_e, w_e, h_e)
                        fill = sp.fill; fill.solid()
                        rgb = hex_to_rgb(sc.get("bgColor", "#1473df"))
                        if rgb: fill.fore_color.rgb = rgb
                        line = sp.line
                        br = hex_to_rgb(sc.get("borderColor", "#0d5bb5"))
                        if br: line.color.rgb = br
                        line.width = Pt(sc.get("borderWidth", 2))
                    except Exception:
                        pass
                    continue

                # Text box
                try:
                    txBox = slide.shapes.add_textbox(x_e, y_e, w_e, h_e)
                    tf = txBox.text_frame
                    tf.word_wrap = True
                    box_style = box.get("boxStyle", {})
                    styles = box.get("styles", [])

                    # Fill background
                    bg_hex = box_style.get("bgColor")
                    if bg_hex and bg_hex != "transparent":
                        rgb = hex_to_rgb(bg_hex)
                        if rgb:
                            txBox.fill.solid(); txBox.fill.fore_color.rgb = rgb

                    # Write text with run-level styles
                    lines = text_val.split("\n")
                    for li, line in enumerate(lines):
                        para = tf.paragraphs[0] if li == 0 else tf.add_paragraph()
                        ci = sum(len(l) + 1 for l in lines[:li])  # char index of line start
                        if not line:
                            continue
                        # Find runs based on style changes
                        run = para.add_run()
                        run.text = line
                        # Apply box-level style
                        fs = box_style.get("fontSize", 16)
                        run.font.size = Pt(fs)
                        if box_style.get("fontWeight") == "bold":   run.font.bold = True
                        if box_style.get("fontStyle") == "italic":  run.font.italic = True
                        color_hex = box_style.get("color", "#000000")
                        rgb = hex_to_rgb(color_hex)
                        if rgb: run.font.color.rgb = rgb
                        # Override with char-level styles for this line
                        for s in styles:
                            if s.get("end", -1) >= ci and s.get("start", 999) < ci + len(line):
                                if s.get("fontWeight") == "bold":   run.font.bold = True
                                if s.get("fontStyle") == "italic":  run.font.italic = True
                                if s.get("fontSize"): run.font.size = Pt(s["fontSize"])
                                if s.get("color"):
                                    rgb2 = hex_to_rgb(s["color"])
                                    if rgb2: run.font.color.rgb = rgb2
                except Exception:
                    pass

        p.parent.mkdir(parents=True, exist_ok=True)
        prs.save(str(p))
        return web.json_response({"ok": True, "path": str(p)}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


# ── Dev-server manager ───────────────────────────────────────────────────────
# Runs `pnpm dev` (or npm/yarn) in the project cwd and exposes the URL.
# Only one dev server per cwd is tracked; a second start call returns the URL.

import asyncio as _asyncio
_dev_servers: dict = {}   # cwd → { proc, url }

async def _find_free_port() -> int:
    import socket as _socket
    with _socket.socket() as s:
        s.bind(('', 0))
        return s.getsockname()[1]

async def handle_dev_server_start(request: web.Request) -> web.Response:
    """POST /api/dev-server/start { cwd } — start pnpm dev and return the URL."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    cwd = str(body.get("cwd", "")).strip()
    if not cwd or not Path(cwd).is_dir():
        return web.json_response({"error": "invalid cwd"}, status=400, headers=CORS_HEADERS)

    # Return existing server if already running
    if cwd in _dev_servers:
        entry = _dev_servers[cwd]
        if entry["proc"].returncode is None:  # still running
            return web.json_response({"url": entry["url"]}, headers=CORS_HEADERS)

    # Pick a free port
    port = await _find_free_port()

    # Detect remote environment via Host header.
    # Gateway routes ws_abc123-{port}.workspaces.boltzhub.com → container:18789
    # with X-Target-Port:{port}, so the browser-visible URL uses the subdomain.
    host = request.headers.get("Host", "")
    if ".workspaces.boltzhub.com" in host:
        workspace_id = host.split(".")[0]  # e.g. "ws_abc123"
        url = f"https://{workspace_id}-{port}.workspaces.boltzhub.com"
    else:
        url = f"http://localhost:{port}"

    # Detect package manager and start command.
    # Bind to 0.0.0.0 so the X-Target-Port proxy (loopback → target) can reach it;
    # Vite's --host flag controls the listening address.
    pkg_dir = Path(cwd)
    if (pkg_dir / "pnpm-lock.yaml").exists():
        cmd = ["pnpm", "dev", "--port", str(port), "--host", "0.0.0.0"]
    elif (pkg_dir / "yarn.lock").exists():
        cmd = ["yarn", "dev", "--port", str(port), "--host", "0.0.0.0"]
    else:
        cmd = ["npm", "run", "dev", "--", "--port", str(port), "--host", "0.0.0.0"]

    try:
        proc = await _asyncio.create_subprocess_exec(
            *cmd, cwd=cwd,
            stdout=_asyncio.subprocess.DEVNULL,
            stderr=_asyncio.subprocess.DEVNULL,
        )
    except FileNotFoundError as e:
        return web.json_response({"error": f"command not found: {e}"}, status=500, headers=CORS_HEADERS)

    _dev_servers[cwd] = {"proc": proc, "url": url}
    # Give the server a moment to start
    await _asyncio.sleep(2)
    if proc.returncode is not None:
        return web.json_response({"error": "dev server exited immediately — check package.json"}, status=500, headers=CORS_HEADERS)

    print(f"[dev-server] started pid={proc.pid} url={url} cwd={cwd}", file=sys.stderr)
    return web.json_response({"url": url, "pid": proc.pid}, headers=CORS_HEADERS)


async def handle_dev_server_stop(request: web.Request) -> web.Response:
    """POST /api/dev-server/stop { cwd } — stop the dev server for this cwd."""
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    cwd = str(body.get("cwd", "")).strip()
    entry = _dev_servers.pop(cwd, None)
    if entry:
        try:
            entry["proc"].terminate()
            print(f"[dev-server] stopped pid={entry['proc'].pid}", file=sys.stderr)
        except Exception:
            pass
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


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


async def handle_file_rename(request: web.Request) -> web.Response:
    """POST /api/file/rename { path, newName } — rename a file or directory."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    path_str = str(body.get("path", "")).strip()
    new_name = str(body.get("newName", "")).strip()
    if not path_str or not new_name:
        return web.json_response({"error": "path and newName required"}, status=400, headers=CORS_HEADERS)
    p = Path(path_str)
    if not p.exists():
        return web.json_response({"error": "path not found"}, status=404, headers=CORS_HEADERS)
    dest = p.parent / new_name
    if dest.exists():
        return web.json_response({"error": "destination already exists"}, status=409, headers=CORS_HEADERS)
    try:
        p.rename(dest)
        return web.json_response({"ok": True, "path": str(dest)}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_file_duplicate(request: web.Request) -> web.Response:
    """POST /api/file/duplicate { path } — duplicate a file with a unique name."""
    import shutil
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    path_str = str(body.get("path", "")).strip()
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    p = Path(path_str)
    if not p.exists():
        return web.json_response({"error": "path not found"}, status=404, headers=CORS_HEADERS)
    if p.is_dir():
        return web.json_response({"error": "directory duplication not supported"}, status=400, headers=CORS_HEADERS)
    stem, suffix = p.stem, p.suffix
    # Find a unique name: "file copy.ext", "file copy 2.ext", …
    dest = p.parent / f"{stem} copy{suffix}"
    n = 2
    while dest.exists():
        dest = p.parent / f"{stem} copy {n}{suffix}"
        n += 1
    try:
        shutil.copy2(str(p), str(dest))
        return web.json_response({"ok": True, "path": str(dest)}, headers=CORS_HEADERS)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500, headers=CORS_HEADERS)


async def handle_file_download(request: web.Request) -> web.Response:
    """GET /api/file/download?path=<abs> — serve a file as a binary download."""
    path_str = request.rel_url.query.get("path", "").strip()
    if not path_str:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    p = Path(path_str)
    if not p.exists() or p.is_dir():
        return web.json_response({"error": "file not found"}, status=404, headers=CORS_HEADERS)
    import mimetypes
    mime, _ = mimetypes.guess_type(str(p))
    mime = mime or "application/octet-stream"
    headers = dict(CORS_HEADERS)
    headers["Content-Disposition"] = f'attachment; filename="{p.name}"'
    headers["Content-Type"] = mime
    return web.Response(body=p.read_bytes(), headers=headers)


async def handle_get_cursor(request: web.Request) -> web.Response:
    """GET /api/doc/cursor?path=<abs> — return saved cursor position for a file."""
    path = request.rel_url.query.get("path", "").strip()
    if not path:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    cursor = _cursor_store.get(path, {"selStart": 0, "selEnd": 0})
    return web.json_response(cursor, headers=CORS_HEADERS)


async def handle_put_cursor(request: web.Request) -> web.Response:
    """PUT /api/doc/cursor { path, selStart, selEnd } — save cursor position for a file."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400, headers=CORS_HEADERS)
    path = str(body.get("path", "")).strip()
    if not path:
        return web.json_response({"error": "path required"}, status=400, headers=CORS_HEADERS)
    _cursor_store[path] = {
        "selStart": int(body.get("selStart", 0)),
        "selEnd":   int(body.get("selEnd",   0)),
    }
    return web.json_response({"ok": True}, headers=CORS_HEADERS)


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


async def _target_port_middleware(app: web.Application, handler):
    """
    Middleware: if the request carries X-Target-Port, reverse-proxy it to
    localhost:{port} instead of handling it as an API call.
    This is how the FlowInfra gateway routes subdomain traffic like
    ws_abc123-3000.workspaces.boltzhub.com → port 18789 with X-Target-Port: 3000.
    """
    async def middleware(request: web.Request) -> web.StreamResponse:
        target_port_hdr = request.headers.get("X-Target-Port", "").strip()
        if not target_port_hdr:
            return await handler(request)

        try:
            target_port = int(target_port_hdr)
        except ValueError:
            return await handler(request)

        target_base = f"http://localhost:{target_port}"

        # ── WebSocket upgrade → proxy as WebSocket ────────────────────────────
        if (request.headers.get("Upgrade", "").lower() == "websocket" or
                request.headers.get("Connection", "").lower().find("upgrade") >= 0):
            ws_client = web.WebSocketResponse()
            await ws_client.prepare(request)
            import aiohttp as _aio
            target_url = target_base.replace("http://", "ws://") + str(request.rel_url)
            forward_headers = {
                k: v for k, v in request.headers.items()
                if k.lower() not in ("host", "x-target-port")
            }
            try:
                async with _aio.ClientSession() as sess:
                    async with sess.ws_connect(target_url, headers=forward_headers) as ws_target:
                        async def _fwd_to_target():
                            async for msg in ws_client:
                                if msg.type == _aio.WSMsgType.TEXT:
                                    await ws_target.send_str(msg.data)
                                elif msg.type == _aio.WSMsgType.BINARY:
                                    await ws_target.send_bytes(msg.data)
                                elif msg.type in (_aio.WSMsgType.CLOSE, _aio.WSMsgType.ERROR):
                                    break
                        async def _fwd_to_client():
                            async for msg in ws_target:
                                if msg.type == _aio.WSMsgType.TEXT:
                                    await ws_client.send_str(msg.data)
                                elif msg.type == _aio.WSMsgType.BINARY:
                                    await ws_client.send_bytes(msg.data)
                                elif msg.type in (_aio.WSMsgType.CLOSE, _aio.WSMsgType.ERROR):
                                    break
                        import asyncio as _aio2
                        done, pending = await _aio2.wait(
                            [_aio2.ensure_future(_fwd_to_target()),
                             _aio2.ensure_future(_fwd_to_client())],
                            return_when=_aio2.FIRST_COMPLETED,
                        )
                        for t in pending:
                            t.cancel()
            except Exception as exc:
                print(f"[proxy-ws] error: {exc}", file=sys.stderr)
            return ws_client

        # ── Regular HTTP → reverse-proxy ─────────────────────────────────────
        target_url = target_base + str(request.rel_url)
        forward_headers = {
            k: v for k, v in request.headers.items()
            if k.lower() not in ("host", "x-target-port", "transfer-encoding")
        }
        body = await request.read()
        import aiohttp as _aio
        try:
            async with _aio.ClientSession() as sess:
                resp = await sess.request(
                    request.method, target_url,
                    headers=forward_headers,
                    data=body or None,
                    allow_redirects=False,
                )
                resp_headers = {
                    k: v for k, v in resp.headers.items()
                    if k.lower() not in ("transfer-encoding", "content-encoding")
                }
                resp_headers["Access-Control-Allow-Origin"] = "*"
                content = await resp.read()
                return web.Response(
                    status=resp.status,
                    headers=resp_headers,
                    body=content,
                )
        except Exception as exc:
            print(f"[proxy-http] error proxying to {target_url}: {exc}", file=sys.stderr)
            return web.Response(status=502, text=f"Bad Gateway: {exc}")

    return middleware


def make_http_app(bzcode_path: str = "", default_cwd: str = "",
                  port: int = 18789) -> web.Application:
    app = web.Application(middlewares=[_target_port_middleware])
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
    app.router.add_post("/auth/logout",            handle_logout)
    app.router.add_route("OPTIONS", "/auth",         handle_options)
    app.router.add_route("OPTIONS", "/auth/logout",  handle_options)
    # Widgets
    app.router.add_get(   "/widgets",                handle_get_widgets)
    app.router.add_get(   "/widgets/template",       handle_get_widget_template)
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
    app.router.add_get(  "/api/file",               handle_read_file)
    app.router.add_put(  "/api/file",               handle_write_file)
    app.router.add_post( "/api/dev-server/start",   handle_dev_server_start)
    app.router.add_post( "/api/dev-server/stop",    handle_dev_server_stop)
    app.router.add_route("OPTIONS", "/api/dev-server/start", handle_options)
    app.router.add_route("OPTIONS", "/api/dev-server/stop",  handle_options)
    app.router.add_post( "/api/file/rename",        handle_file_rename)
    app.router.add_post( "/api/file/duplicate",     handle_file_duplicate)
    app.router.add_get(  "/api/file/download",      handle_file_download)
    app.router.add_get(  "/api/doc/cursor",          handle_get_cursor)
    app.router.add_put(  "/api/doc/cursor",          handle_put_cursor)
    app.router.add_route("OPTIONS", "/api/doc/cursor", handle_options)
    app.router.add_post("/api/doc/parse",            handle_parse_doc)
    app.router.add_put( "/api/doc/save",             handle_save_doc)
    app.router.add_route("OPTIONS", "/api/file",     handle_options)
    app.router.add_route("OPTIONS", "/api/doc/parse",handle_options)
    app.router.add_route("OPTIONS", "/api/doc/save", handle_options)
    app.router.add_get( "/api/excel/load",           handle_excel_load)
    app.router.add_put( "/api/excel/save",           handle_excel_save)
    app.router.add_get( "/api/ppt/load",             handle_ppt_load)
    app.router.add_put( "/api/ppt/save",             handle_ppt_save)
    app.router.add_route("OPTIONS", "/api/excel/load", handle_options)
    app.router.add_route("OPTIONS", "/api/excel/save", handle_options)
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
    app.router.add_get(   "/api/version",                    handle_version)
    app.router.add_get(   "/api/home",                       handle_home)
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


async def drain_bzcode_stderr(
    proc: asyncio.subprocess.Process,
    out_queue: "asyncio.Queue | None" = None,
) -> None:
    """Read bzcode stderr, log it, and forward auth errors to the client."""
    _AUTH_KEYWORDS = ("token is expired", "Token refresh failed", "invalid authentication token",
                      "invalid_token", "unauthorized", "401")
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        text = line.decode().rstrip()
        print(f"[bzcode] {text}", file=sys.stderr)
        # Forward authentication errors so the frontend can prompt re-login
        if out_queue and any(k.lower() in text.lower() for k in _AUTH_KEYWORDS):
            msg = json.dumps({
                "type":    "system",
                "event":   "auth-error",
                "message": "Your authentication token has expired. Please sign in again.",
            })
            try:
                out_queue.put_nowait(msg)
            except Exception:
                pass


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
            env={**os.environ, "BZ_PYTHON": sys.executable},
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
            drain_bzcode_stderr(proc, out_queue),
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
    def _default_bzcode() -> str:
        """Find the bzcode binary: env var → common install locations → ./bzcode fallback."""
        import shutil as _sh
        env_val = os.environ.get("BZCODE_PATH", "")
        if env_val:
            return env_val
        # Common install locations
        for candidate in [
            Path.home() / ".local" / "bin" / "bzcode",
            Path("/usr/local/bin/bzcode"),
            Path("/opt/boltzagent/bzcode"),
        ]:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
        found = _sh.which("bzcode")
        if found:
            return found
        return "./bzcode"  # last resort (may be a directory — will fail with a clear error)

    parser.add_argument("--bzcode", default=_default_bzcode())
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
    if not os.path.isfile(bzcode_path) or not os.access(bzcode_path, os.X_OK):
        print(
            f"\n⚠️  bzcode not found or not executable at: {bzcode_path}\n"
            f"   Pass the correct path with --bzcode or set BZCODE_PATH env var.\n"
            f"   Example: BZCODE_PATH=~/.local/bin/bzcode .venv/bin/python server.py\n",
            file=sys.stderr,
        )
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
