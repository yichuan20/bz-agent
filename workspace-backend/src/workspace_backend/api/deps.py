"""Dependency-injection providers for FastAPI ``Depends``.

Singletons (Settings, and later the AgentPool, stores, and httpx client) are built at
startup and stashed on a typed ``AppContext`` at ``app.state.ctx``. Providers read from
there, so routes stay decoupled from construction and tests can override via
``app.dependency_overrides``. Phase 1 only wires ``Settings``; more providers land as
their subsystems arrive.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from workspace_backend.config import Settings


@dataclass
class AppContext:
    """Typed container for process-wide singletons, held at ``app.state.ctx``."""

    settings: Settings


def get_context(request: Request) -> AppContext:
    """Return the app-wide context assembled during startup."""
    return request.app.state.ctx  # type: ignore[no-any-return]


def get_settings_dep(request: Request) -> Settings:
    """Provide the active :class:`Settings` to routes via ``Depends``."""
    return get_context(request).settings
