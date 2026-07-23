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
from workspace_backend.services.boltzhub_service import BoltzHubService
from workspace_backend.services.canvas_service import CanvasService
from workspace_backend.services.credential_service import CredentialService
from workspace_backend.services.dev_server_service import DevServerService
from workspace_backend.services.doc_service import DocService
from workspace_backend.services.excel_service import ExcelService
from workspace_backend.services.file_service import FileService
from workspace_backend.services.mode_service import ModeService
from workspace_backend.services.model_service import ModelService
from workspace_backend.services.ppt_service import PptService
from workspace_backend.services.tool_config_service import ToolConfigService
from workspace_backend.services.user_service import UserService
from workspace_backend.services.widget_db_service import WidgetDbService
from workspace_backend.services.widget_service import WidgetService


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
    boltzhub_service: BoltzHubService
    canvas_service: CanvasService
    widget_service: WidgetService
    widget_db_service: WidgetDbService
    doc_service: DocService
    excel_service: ExcelService
    ppt_service: PptService
    dev_server_service: DevServerService
    tool_config_service: ToolConfigService


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


def get_boltzhub_service(request: Request) -> BoltzHubService:
    return get_context(request).boltzhub_service


def get_canvas_service(request: Request) -> CanvasService:
    return get_context(request).canvas_service


def get_widget_service(request: Request) -> WidgetService:
    return get_context(request).widget_service


def get_widget_db_service(request: Request) -> WidgetDbService:
    return get_context(request).widget_db_service


def get_doc_service(request: Request) -> DocService:
    return get_context(request).doc_service


def get_excel_service(request: Request) -> ExcelService:
    return get_context(request).excel_service


def get_ppt_service(request: Request) -> PptService:
    return get_context(request).ppt_service


def get_dev_server_service(request: Request) -> DevServerService:
    return get_context(request).dev_server_service


def get_file_service(request: Request) -> FileService:
    return get_context(request).file_service


def get_tool_config_service(request: Request) -> ToolConfigService:
    return get_context(request).tool_config_service
