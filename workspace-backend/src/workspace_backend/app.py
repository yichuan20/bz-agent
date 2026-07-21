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
from fastapi.middleware.cors import CORSMiddleware

from workspace_backend.api.deps import AppContext
from workspace_backend.api.routes import health, version
from workspace_backend.config import Settings, get_settings
from workspace_backend.logging import configure_logging, get_logger

log = get_logger(__name__)

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

    Phase 1: only :class:`Settings`. Later phases add ``pool.start()/stop()`` and a
    shared ``httpx.AsyncClient`` here.
    """
    settings: Settings = app.state.settings
    app.state.ctx = AppContext(settings=settings)
    log.info(
        "workspace-backend starting: cwd=%s bz_home=%s port=%s",
        settings.bzcode_cwd,
        settings.bz_home,
        settings.port,
    )
    yield
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
        version="0.1.0",
        summary="Create and manage bzcode agent sessions.",
        description=_DESCRIPTION,
        lifespan=lifespan,
    )
    # Stash settings before lifespan runs so the context can read them.
    app.state.settings = settings

    # CORS: permissive for now (local-first / behind the workspace gateway). Tighten
    # when the deployment model requires it.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(version.router)

    return app


# Module-level app for uvicorn's import string: `uvicorn workspace_backend.app:app`.
# create_app() stays a factory so tests build isolated apps with tmp settings.
app = create_app()
