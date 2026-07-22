"""Dependency-injection wiring for FastAPI ``Depends``.

All singletons — settings, the shared httpx client, storage adapters, services, and
the AgentPool — are built once in the app lifespan and held on a typed
:class:`AppContext` at ``app.state.ctx``. The provider functions here read from it, so
routes stay decoupled from construction and tests can override via
``app.dependency_overrides``.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import Request

from workspace_backend.config import Settings
from workspace_backend.runtime_state import RuntimeState
from workspace_backend.services.agent_pool.pool import AgentPool
from workspace_backend.services.agent_service import AgentService
from workspace_backend.services.credential_service import CredentialService
from workspace_backend.services.file_service import FileService
from workspace_backend.services.mode_service import ModeService
from workspace_backend.services.model_service import ModelService
from workspace_backend.services.user_service import UserService


@dataclass
class AppContext:
    """Typed container for process-wide singletons, held at ``app.state.ctx``."""

    settings: Settings
    http_client: httpx.AsyncClient
    runtime_state: RuntimeState
    pool: AgentPool
    agent_service: AgentService
    credential_service: CredentialService
    mode_service: ModeService
    model_service: ModelService
    user_service: UserService
    file_service: FileService


def get_context(request: Request) -> AppContext:
    """Return the app-wide context assembled during startup."""
    return request.app.state.ctx  # type: ignore[no-any-return]


def get_settings_dep(request: Request) -> Settings:
    return get_context(request).settings


def get_pool(request: Request) -> AgentPool:
    return get_context(request).pool


def get_agent_service(request: Request) -> AgentService:
    return get_context(request).agent_service


def get_credential_service(request: Request) -> CredentialService:
    return get_context(request).credential_service


def get_mode_service(request: Request) -> ModeService:
    return get_context(request).mode_service


def get_model_service(request: Request) -> ModelService:
    return get_context(request).model_service


def get_user_service(request: Request) -> UserService:
    return get_context(request).user_service


def get_file_service(request: Request) -> FileService:
    return get_context(request).file_service
