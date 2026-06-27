#!/usr/bin/env python3
"""
Unified server:
  ws://localhost:8765?cwd=/path   — start a fresh bzcode session in that dir
  ws://localhost:8765?sessionId=X — resume an existing session
  http://localhost:8766/sessions  — list sessions (one per directory)
  http://localhost:8766/search    — SerpAPI proxy
"""

BACKEND_VERSION = "0.1.0"

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

# ══════════════════════════════════════════════════════════════════════════════
# § 3 · MODE CONFIG
# ══════════════════════════════════════════════════════════════════════════════
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


# ══════════════════════════════════════════════════════════════════════════════
# § 4 · SESSION MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# § 1 · CONFIGURATION & CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════
# Override any of these with environment variables:
#   export BZ_DB_HOST=localhost BZ_DB_PORT=5432 BZ_DB_NAME=bz_agent ...
DB_CONFIG = {
    "host":     os.environ.get("BZ_DB_HOST",     "localhost"),
    "port":     int(os.environ.get("BZ_DB_PORT", "5432")),
    "database": os.environ.get("BZ_DB_NAME",     "bz_agent"),
    "user":     os.environ.get("BZ_DB_USER",     "bz_agent"),
    "password": os.environ.get("BZ_DB_PASSWORD", "bz_agent_secret"),
}

# ══════════════════════════════════════════════════════════════════════════════
# § 2 · IN-MEMORY STATE
# ══════════════════════════════════════════════════════════════════════════════

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

# ══════════════════════════════════════════════════════════════════════════════
# § 10 · CANVAS & CUSTOM WIDGETS
# ══════════════════════════════════════════════════════════════════════════════
# Canvas-edited widget code lives here, keyed by canvasId.
# Separate from server_data/widgets/ (toolbar templates) so edited instances
# don't pollute the template list.
CUSTOM_WIDGETS_DIR = SERVER_DATA_DIR / "custom_widgets"


def _custom_widgets_dir(session_id: str) -> Path:
    """Return the custom_widgets directory for a session (or global fallback)."""
    if session_id:
        return SESSIONS_DIR / session_id / "custom_widgets"
    return CUSTOM_WIDGETS_DIR


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


# ══════════════════════════════════════════════════════════════════════════════
# § 5 · AUTHENTICATION & CREDENTIALS
# ══════════════════════════════════════════════════════════════════════════════

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


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


# ══════════════════════════════════════════════════════════════════════════════
# § 11 · WIDGET SYSTEM
# ══════════════════════════════════════════════════════════════════════════════
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


# ══════════════════════════════════════════════════════════════════════════════
# § 6 · FILE SYSTEM
# ══════════════════════════════════════════════════════════════════════════════


def _canvas_file(session_id: str, cwd: str) -> Path:
    """Return the .bzcanvas.json path — session dir preferred, cwd as fallback."""
    if session_id:
        return SESSIONS_DIR / session_id / ".bzcanvas.json"
    return Path(cwd) / ".bzcanvas.json"


# ══════════════════════════════════════════════════════════════════════════════
# § 14 · WHATSAPP
# ══════════════════════════════════════════════════════════════════════════════
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


# ══════════════════════════════════════════════════════════════════════════════
# § 13 · BOLTZHUB INTEGRATION
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# § 15 · BATCH EXECUTION
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# § 18 · MISC / UTILITY ROUTES
# ══════════════════════════════════════════════════════════════════════════════


# ── Settings ──────────────────────────────────────────────────────────────────


# ── Database health ───────────────────────────────────────────────────────────


# ══════════════════════════════════════════════════════════════════════════════
# § 12 · DATABASE — WIDGET DATA
# ══════════════════════════════════════════════════════════════════════════════
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


# ── Agent mode + file endpoints ───────────────────────────────────────────────


# ══════════════════════════════════════════════════════════════════════════════
# § 7 · DOCUMENT PARSING
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# § 8 · EXCEL
# ══════════════════════════════════════════════════════════════════════════════


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


# ══════════════════════════════════════════════════════════════════════════════
# § 9 · POWERPOINT
# ══════════════════════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════════════
# § 16 · DEV SERVER
# ══════════════════════════════════════════════════════════════════════════════
# Runs `pnpm dev` (or npm/yarn) in the project cwd and exposes the URL.
# Only one dev server per cwd is tracked; a second start call returns the URL.

import asyncio as _asyncio
_dev_servers: dict = {}   # cwd → { proc, url }

async def _find_free_port() -> int:
    import socket as _socket
    with _socket.socket() as s:
        s.bind(('', 0))
        return s.getsockname()[1]


# ══════════════════════════════════════════════════════════════════════════════
# § 17 · AGENT WEBSOCKET BRIDGE
# ══════════════════════════════════════════════════════════════════════════════

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


if __name__ == "__main__":
    main()
