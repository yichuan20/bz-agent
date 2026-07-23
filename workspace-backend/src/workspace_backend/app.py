"""FastAPI application factory.

Builds the app, configures logging, assembles the ``AppContext`` of process-wide
singletons in the ``lifespan``, mounts routers, and registers CORS + domain-exception
handlers. Kept small and declarative — the root cause of the old 4,182-line
``app.py`` was one factory doing everything.

Exposes a module-level ``app`` (built via :func:`create_app`) for uvicorn's import
string, matching the sibling services' convention::

    uvicorn workspace_backend.app:app --host 0.0.0.0 --port 18789

:func:`create_app` remains a factory so tests build isolated apps with tmp settings.

In Phase 1 the lifespan only holds :class:`Settings`; the AgentPool and shared httpx
client are added to it in later phases.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

from workspace_backend import __version__
from workspace_backend.api.context import build_context, close_context
from workspace_backend.api.exception_handlers import register_exception_handlers
from workspace_backend.api.preview_proxy import preview_proxy_middleware
from workspace_backend.api.routes import (
    agents,
    auth,
    boltzhub,
    canvas,
    dev_server,
    docs,
    excel,
    files,
    health,
    modes,
    ppt,
    runtime,
    user,
    version,
)
from workspace_backend.api.routes import settings as settings_routes
from workspace_backend.api.spa import mount_spa
from workspace_backend.config import Settings, get_settings
from workspace_backend.logging import configure_logging, get_logger

log = get_logger(__name__)


class _TeeWriter:
    """Write to both the original stderr stream and a persistent log file."""

    def __init__(self, stream: object, file_path: object) -> None:
        import pathlib

        self._stream = stream
        try:
            self._file = pathlib.Path(str(file_path)).open("a", buffering=1, encoding="utf-8", errors="replace")
        except Exception:
            self._file = None

    def write(self, data: str) -> int:
        if self._file:
            try:
                self._file.write(data)
            except Exception:
                pass
        return self._stream.write(data)  # type: ignore[union-attr]

    def flush(self) -> None:
        if hasattr(self._stream, "flush"):
            self._stream.flush()  # type: ignore[union-attr]
        if self._file:
            try:
                self._file.flush()
            except Exception:
                pass

    def fileno(self) -> int:
        return self._stream.fileno()  # type: ignore[union-attr]

    def __getattr__(self, name: str) -> object:
        return getattr(self._stream, name)


_DESCRIPTION = """\
Workspace backend for BoltzAgent — manages **bzcode** agent sessions.

All API routes are under **`/api/v1`**; the `/healthz` liveness probe is unprefixed.

**Auth:** send a `BZ_API_KEY` via `PUT /api/v1/auth/api-key` before starting an agent.

**Agent lifecycle:** `POST /api/v1/agents` (create) →
`POST /api/v1/agents/{id}/connect` (spawn/attach the runtime) →
`GET /api/v1/agents/{id}/events` (SSE stream of agent output) +
`POST /api/v1/agents/{id}/messages` (send). Fetch history with
`GET /api/v1/agents/{id}/messages`.

Milestone 1 covers the core agent path; document, widget, BoltzHub, and WhatsApp
endpoints are added in later milestones.
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Assemble singletons on startup, tear them down on shutdown.

    Builds the full object graph (httpx client, stores, services, pool) via
    ``build_context`` and starts the pool's idle sweeper; closes both on shutdown.
    """
    import asyncio as _asyncio
    import re as _re
    import shutil as _shutil
    import sys as _sys
    from pathlib import Path as _Path

    settings: Settings = app.state.settings

    # Tee all stderr to $BZ_HOME/server.log so the settings page can read it.
    _log_path = _Path(str(settings.bz_home)) / "server.log"
    try:
        _log_path.parent.mkdir(parents=True, exist_ok=True)
        if not isinstance(_sys.stderr, _TeeWriter):
            _sys.stderr = _TeeWriter(_sys.stderr, _log_path)  # type: ignore[assignment]
    except Exception:
        pass

    ctx = await build_context(settings)
    app.state.ctx = ctx
    await ctx.pool.start()

    # Detect installed bzcode version (non-fatal).
    app.state.bzcode_version = None
    app.state.bzcode_latest = None
    try:
        _bzc = _shutil.which(settings.bzcode_path) or settings.bzcode_path
        _vp = await _asyncio.create_subprocess_exec(
            str(_bzc),
            "--version",
            stdout=_asyncio.subprocess.PIPE,
            stderr=_asyncio.subprocess.PIPE,
        )
        _vout, _ = await _asyncio.wait_for(_vp.communicate(), timeout=10)
        _vm = _re.search(r"(\d+\.\d+[\.\d]*)", _vout.decode())
        if _vm:
            app.state.bzcode_version = _vm.group(1)
    except Exception as _ve:
        log.debug("bzcode version check failed: %s", _ve)

    # Fetch latest bzcode version from BoltzHub (non-fatal, best-effort).
    try:
        _lr = await _asyncio.wait_for(
            ctx.http_client.get("https://boltzhub.com/bz-appstore-api/v1/bzcode/latest"),
            timeout=8,
        )
        if _lr.is_success:
            _ld = _lr.json()
            _lv = str(_ld.get("version") or _ld.get("latestVersion") or _ld.get("tag") or "")
            _lm = _re.search(r"(\d+\.\d+[\.\d]*)", _lv)
            if _lm:
                app.state.bzcode_latest = _lm.group(1)
    except Exception as _le:
        log.debug("bzcode latest-version check failed: %s", _le)

    log.info(
        "workspace-backend starting: cwd=%s bz_home=%s data_root=%s bzcode=%s",
        settings.bzcode_cwd,
        settings.bz_home,
        settings.data_root,
        app.state.bzcode_version or "unknown",
    )
    try:
        yield
    finally:
        await close_context(ctx)
        log.info("workspace-backend shutting down")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and configure the FastAPI application.

    ``settings`` is injectable for tests; production passes ``None`` and reads the
    environment via :func:`get_settings`.
    """
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="BoltzAgent Workspace Backend",
        version=__version__,
        summary="Create and manage bzcode agent sessions.",
        description=_DESCRIPTION,
        lifespan=lifespan,
    )
    # Stash settings before lifespan runs so the context builder can read them.
    app.state.settings = settings

    # Reverse-proxy dev-server preview requests (X-Target-Port) to localhost:{port} inside
    # the container, before any routing. No-op pass-through when the header is absent.
    app.add_middleware(BaseHTTPMiddleware, dispatch=preview_proxy_middleware)

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(version.router)
    app.include_router(agents.router)
    app.include_router(auth.router)
    app.include_router(modes.router)
    app.include_router(files.router)
    app.include_router(settings_routes.router)
    app.include_router(canvas.router)
    app.include_router(canvas.db_router)
    app.include_router(runtime.router)
    app.include_router(docs.router)
    app.include_router(excel.router)
    app.include_router(ppt.router)
    app.include_router(dev_server.router)
    app.include_router(boltzhub.router)
    app.include_router(user.router)

    # Serve the built SPA last so its catch-all never shadows the API routers above.
    mount_spa(app, settings.frontend_dist)

    return app


# Module-level app for uvicorn's import string: `uvicorn workspace_backend.app:app`.
# create_app() stays a factory so tests build isolated apps with tmp settings.
app = create_app()
