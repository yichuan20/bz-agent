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
import sys
import urllib.parse
from pathlib import Path
from typing import Optional

try:
    import websockets
    from websockets.server import serve
except ImportError:
    sys.exit("Missing dependency: pip install websockets")

try:
    import aiohttp
    from aiohttp import web
except ImportError:
    sys.exit("Missing dependency: pip install aiohttp")

SESSIONS_DIR = Path.home() / ".boltzbit" / "sessions"

# ── Session reader ────────────────────────────────────────────────────────────

def _read_session_file(path: Path) -> Optional[dict]:
    """Parse a session JSONL and return metadata. Returns None on any error."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]
        if not lines:
            return None

        header = json.loads(lines[0])
        if header.get("type") != "session":
            return None

        # Walk backwards to find the last user message for the preview
        last_preview = ""
        msg_count = 0
        for line in reversed(lines[1:]):
            try:
                msg = json.loads(line)
                msg_count += 1
                if not last_preview and msg.get("role") == "user":
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        last_preview = content[:150]
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                last_preview = block.get("text", "")[:150]
                                break
            except json.JSONDecodeError:
                pass

        stat = path.stat()
        working_dir = header.get("workingDir", "")

        return {
            "sessionId":    header.get("sessionId", path.stem),
            "workingDir":   working_dir,
            "dirName":      Path(working_dir).name if working_dir else "Unknown",
            "messageCount": msg_count,
            "lastMessage":  last_preview,
            "lastModified": stat.st_mtime,
        }
    except Exception:
        return None


# ── HTTP handlers ─────────────────────────────────────────────────────────────

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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


async def handle_sessions(request: web.Request) -> web.Response:
    """Return one session entry per working directory (the most recent)."""
    if not SESSIONS_DIR.exists():
        return web.json_response({"sessions": []}, headers=CORS_HEADERS)

    by_dir: dict[str, dict] = {}
    for path in SESSIONS_DIR.glob("*.jsonl"):
        meta = _read_session_file(path)
        if meta is None:
            continue
        wd = meta["workingDir"]
        existing = by_dir.get(wd)
        if existing is None or meta["lastModified"] > existing["lastModified"]:
            by_dir[wd] = meta

    sessions = sorted(by_dir.values(), key=lambda s: s["lastModified"], reverse=True)
    return web.json_response({"sessions": sessions}, headers=CORS_HEADERS)


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


def make_http_app() -> web.Application:
    app = web.Application()
    app.router.add_post("/auth",               handle_auth)
    app.router.add_route("OPTIONS", "/auth",     handle_options)
    app.router.add_get("/sessions",            handle_sessions)
    app.router.add_route("OPTIONS", "/sessions", handle_options)
    app.router.add_get("/search",              handle_search)
    app.router.add_route("OPTIONS", "/search",   handle_options)
    return app


# ── bzcode WebSocket bridge ───────────────────────────────────────────────────

async def read_bzcode_stdout(proc: asyncio.subprocess.Process, queue: asyncio.Queue) -> None:
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            raw = line.decode().rstrip("\n")
            if raw:
                await queue.put(raw)
    finally:
        await queue.put(None)


async def send_to_client(queue: asyncio.Queue, websocket) -> None:
    while True:
        raw = await queue.get()
        if raw is None:
            break
        if raw and raw[0] == "{":
            await websocket.send(raw)


async def drain_bzcode_stderr(proc: asyncio.subprocess.Process) -> None:
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        print(f"[bzcode] {line.decode().rstrip()}", file=sys.stderr)


async def relay_client_messages(proc: asyncio.subprocess.Process, websocket) -> None:
    async for raw in websocket:
        if isinstance(raw, bytes):
            raw = raw.decode()
        if not raw.endswith("\n"):
            raw += "\n"
        proc.stdin.write(raw.encode())
        await proc.stdin.drain()


async def handle_ws_client(websocket, bzcode_path: str, default_cwd: str) -> None:
    # Parse query params from the WebSocket upgrade URL
    try:
        path = websocket.request.path
    except AttributeError:
        path = getattr(websocket, "path", "/")

    parsed = urllib.parse.urlparse(path)
    params = urllib.parse.parse_qs(parsed.query)

    req_session_id = (params.get("sessionId") or [None])[0]
    req_cwd        = (params.get("cwd") or [default_cwd])[0]

    # Validate cwd; fall back to default if the path doesn't exist
    effective_cwd = req_cwd if os.path.isdir(req_cwd) else default_cwd

    # Build bzcode command
    cmd = [bzcode_path, "--stdio"]
    if req_session_id:
        cmd += ["--resume", req_session_id]

    print(f"[ws] connect  cwd={effective_cwd}  sessionId={req_session_id}", file=sys.stderr)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=effective_cwd,
            env={**os.environ},
        )
    except FileNotFoundError:
        await websocket.send(json.dumps({
            "type": "result", "status": "error",
            "error": f"bzcode not found: {bzcode_path}",
        }))
        return

    queue: asyncio.Queue = asyncio.Queue()
    try:
        await asyncio.gather(
            read_bzcode_stdout(proc, queue),
            send_to_client(queue, websocket),
            drain_bzcode_stderr(proc),
            relay_client_messages(proc, websocket),
        )
    except (websockets.exceptions.ConnectionClosed, BrokenPipeError):
        pass
    finally:
        print(f"[ws] disconnect  pid={proc.pid}", file=sys.stderr)
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=5)
        except (ProcessLookupError, asyncio.TimeoutError):
            proc.kill()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="bzcode bridge + search/session server")
    parser.add_argument("--bzcode", default="./bzcode")
    parser.add_argument("--host",   default="localhost")
    parser.add_argument("--port",   type=int, default=5070)
    parser.add_argument("--cwd",    default=os.getcwd())
    args = parser.parse_args()

    bzcode_path = os.path.abspath(args.bzcode)
    default_cwd = os.path.abspath(args.cwd)
    ws_port     = args.port
    http_port   = args.port + 1

    async def ws_handler(websocket):
        await handle_ws_client(websocket, bzcode_path, default_cwd)

    async def run() -> None:
        ws_server   = await serve(ws_handler, args.host, ws_port)
        http_runner = web.AppRunner(make_http_app())
        await http_runner.setup()
        await web.TCPSite(http_runner, args.host, http_port).start()

        print(f"bzcode bridge : ws://{args.host}:{ws_port}?cwd=<dir>  or  ?sessionId=<id>", flush=True)
        print(f"HTTP API      : http://{args.host}:{http_port}/sessions  |  /search", flush=True)
        print(f"bzcode        : {bzcode_path}", flush=True)
        print(f"default cwd   : {default_cwd}", flush=True)

        try:
            await asyncio.Future()
        finally:
            ws_server.close()
            await http_runner.cleanup()

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n[server] shutting down", file=sys.stderr)


if __name__ == "__main__":
    main()
