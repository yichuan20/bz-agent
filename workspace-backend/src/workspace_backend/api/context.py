"""Application context assembly.

Builds the full object graph — httpx client, filesystem stores, services, and the
AgentPool — from :class:`Settings`. Kept separate from ``app.py`` so the wiring is in
one readable place and the lifespan stays a thin start/stop shell.
"""

from __future__ import annotations

import asyncio
import shutil

import httpx

from workspace_backend.api.deps import AppContext
from workspace_backend.config import Settings
from workspace_backend.infra.process import asyncio_spawn, build_env
from workspace_backend.infra.storage.filesystem.agents import (
    FsAgentStore,
    FsDefaultsStore,
    FsTitleStore,
    FsTranscriptStore,
)
from workspace_backend.infra.storage.filesystem.credentials import FsApiKeyStore, FsSecretStore
from workspace_backend.infra.storage.filesystem.modes import FsModeConfigStore
from workspace_backend.infra.storage.filesystem.paths import Paths
from workspace_backend.logging import get_logger
from workspace_backend.runtime_state import RuntimeState
from workspace_backend.services.agent_pool.pool import AgentPool
from workspace_backend.services.agent_service import AgentService
from workspace_backend.services.config_writer import ConfigWriter
from workspace_backend.services.credential_service import CredentialService
from workspace_backend.services.file_service import FileService
from workspace_backend.services.mode_service import ModeService
from workspace_backend.services.model_service import ModelService
from workspace_backend.services.widget_catalog import WidgetCatalog

log = get_logger(__name__)


async def build_context(settings: Settings) -> AppContext:
    """Assemble all singletons for the app from ``settings``."""
    http_client = httpx.AsyncClient()

    data_root = settings.data_root
    server_data = data_root / "server_data"
    assets_root = data_root / "bzcode_assets"
    modes_file = data_root / "agent_modes.json"

    paths = Paths(bz_home=settings.bz_home, server_data=server_data)
    title_store = FsTitleStore(paths)
    agent_store = FsAgentStore(paths, title_store)
    transcript_store = FsTranscriptStore(paths)
    defaults_store = FsDefaultsStore(paths)
    api_key_store = FsApiKeyStore(paths)
    secret_store = FsSecretStore(paths)
    mode_config_store = FsModeConfigStore(modes_file)

    runtime_state = RuntimeState()

    widget_catalog = WidgetCatalog(server_data / "widgets" / "index.json")
    mode_service = ModeService(mode_config_store, http_client)
    config_writer = ConfigWriter(
        mode_service,
        agent_store,
        assets_root=assets_root,
        server_data_dir=server_data,
        widget_table_provider=widget_catalog.template_table,
    )
    agent_service = AgentService(
        agent_store,
        transcript_store,
        title_store,
        defaults_store,
        config_writer,
        runtime_state,
        default_cwd=settings.bzcode_cwd,
    )
    credential_service = CredentialService(api_key_store, secret_store)
    model_service = ModelService(http_client, now=lambda: asyncio.get_event_loop().time())
    file_service = FileService(settings.bzcode_cwd)

    pool = _build_pool(settings, api_key_store, runtime_state)

    return AppContext(
        settings=settings,
        http_client=http_client,
        runtime_state=runtime_state,
        pool=pool,
        agent_service=agent_service,
        credential_service=credential_service,
        mode_service=mode_service,
        model_service=model_service,
        file_service=file_service,
    )


def _build_pool(
    settings: Settings,
    api_key_store: FsApiKeyStore,
    runtime_state: RuntimeState,
) -> AgentPool:
    """Construct the AgentPool with command/env builders bound to settings.

    The bzcode runtime mode (yolo/plan) is passed per-spawn by the connect route
    (computed from the compiled config), so the pool needs no mode lookup itself.
    """
    bzcode = shutil.which(settings.bzcode_path) or settings.bzcode_path

    def build_command(agent_id: str) -> list[str]:
        return [bzcode, "--stdio", "--resume", agent_id]

    async def build_agent_env() -> dict[str, str]:
        api_key = await api_key_store.get_api_key() or ""
        return build_env(api_key, settings.bz_home)

    return AgentPool(
        spawn=asyncio_spawn,
        build_command=build_command,
        build_env=build_agent_env,
        idle_timeout=settings.agent_idle_timeout,
        on_usage=runtime_state.add_tokens,
    )


async def close_context(ctx: AppContext) -> None:
    """Tear down singletons on shutdown."""
    await ctx.pool.stop()
    await ctx.http_client.aclose()
