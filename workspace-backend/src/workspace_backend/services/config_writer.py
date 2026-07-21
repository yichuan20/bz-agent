"""Config writer — the I/O half of session-config generation.

Pairs with :class:`ModeService` (the pure compile step). Given an agent id + mode +
model, it: compiles the config, copies helper scripts/templates into the agent's dir,
re-resolves the ``{scripts_path}`` token against the *actual* copied scripts dir, and
writes every file via the :class:`AgentStore`. bzcode reads these on startup and on
every ``--resume``.

Asset variant (boltzbit vs generic) is chosen by model name, matching ModeService.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from workspace_backend.domain.ports import AgentStore
from workspace_backend.logging import get_logger
from workspace_backend.services.mode_service import CompiledConfig, ModeService

log = get_logger(__name__)

# A zero-arg callable returning the widget-template markdown table (injected so the
# writer doesn't depend on the widget subsystem directly).
WidgetTableProvider = Callable[[], str]


class ConfigWriter:
    """Compiles a mode and writes the resulting config into an agent's dir."""

    def __init__(
        self,
        mode_service: ModeService,
        agent_store: AgentStore,
        *,
        assets_root: Path,
        server_data_dir: Path,
        widget_table_provider: WidgetTableProvider | None = None,
    ) -> None:
        self._modes = mode_service
        self._store = agent_store
        self._assets_root = assets_root  # dir containing scripts[/_generic] + templates[...]
        self._server_data_dir = server_data_dir
        self._widget_table = widget_table_provider

    async def write(
        self,
        agent_id: str,
        mode: str,
        *,
        working_dir: str,
        model_name: str = "",
    ) -> CompiledConfig:
        """Generate and persist the session config for ``agent_id``. Returns it."""
        is_boltzbit = not model_name or model_name.lower().startswith("boltzbit")
        suffix = "" if is_boltzbit else "_generic"
        scripts_src = self._resolve_asset_dir("scripts", suffix)
        templates_src = self._resolve_asset_dir("templates", suffix)

        # Copy assets first so we know the real scripts path for token resolution.
        session_scripts = await self._store.copy_assets(agent_id, str(scripts_src), str(templates_src))

        widget_table = self._widget_table() if self._widget_table is not None else ""
        tokens = {
            "scripts_path": session_scripts,
            "server_data_path": str(self._server_data_dir),
            "widget_template_table": widget_table,
        }
        compiled = await self._modes.compile_config(
            agent_id, mode, working_dir=working_dir, model_name=model_name, tokens=tokens
        )
        await self._store.write_config_files(agent_id, compiled.files)
        log.info("[config] wrote config for %s (mode=%s, boltzbit=%s)", agent_id, mode, is_boltzbit)
        return compiled

    def _resolve_asset_dir(self, kind: str, suffix: str) -> Path:
        """Return the asset source dir, falling back from the variant to the base."""
        variant = self._assets_root / f"{kind}{suffix}"
        if variant.is_dir():
            return variant
        return self._assets_root / kind
