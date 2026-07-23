"""Serve the built frontend SPA.

In production the backend serves the compiled `frontend/dist` so the whole app is
one origin (no CORS, no separate frontend host). In dev this is a no-op — the
frontend runs on its own vite port and proxies `/api` back here.

A catch-all GET returns `index.html` for any non-API path so client-side routes
(`/agent`, `/settings`, …) deep-link correctly; real files under `dist` (hashed
JS/CSS chunks, favicon) are served directly. API, docs, and health paths are never
shadowed — they're matched by their routers first, and guarded here as a backstop.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from workspace_backend.logging import get_logger

log = get_logger(__name__)

# Path prefixes owned by the API — never served the SPA shell.
# Includes non-/api/v1 backend routes (boltzhub, canvas, widgets, db, proxy, search).
_RESERVED = (
    "api/",  # covers /api/v1/* including canvas, widgets, custom-widgets, db, proxy, search
    "healthz",
    "docs",
    "redoc",
    "openapi.json",
    "boltzhub/",  # kept at old prefix, not under /api/v1/
    "proxy",  # widget iframe helper, kept at old prefix
    "search",  # widget iframe helper, kept at old prefix
)


def mount_spa(app: FastAPI, dist: Path) -> None:
    """Mount an SPA catch-all if a built `dist` with an index.html is present."""
    index = dist / "index.html"
    if not index.is_file():
        log.info("[spa] no build at %s — SPA not mounted (dev mode)", dist)
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:  # noqa: RUF029  (FastAPI handler)
        if full_path.startswith(_RESERVED) or full_path in _RESERVED:
            raise HTTPException(status_code=404, detail="Not found")
        candidate = dist / full_path
        # Serve a real built file (asset chunk, favicon); else fall back to the shell.
        if full_path and candidate.is_file() and _is_within(dist, candidate):
            return FileResponse(candidate)
        return FileResponse(index)

    log.info("[spa] serving frontend from %s", dist)


def _is_within(root: Path, target: Path) -> bool:
    """Guard against path traversal — `target` must resolve inside `root`."""
    try:
        target.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False
