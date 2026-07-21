"""Agent service — durable agent records and their working-directory resolution.

Owns the non-runtime side of an agent: listing, creating (id minting + config write),
deleting, titling, defaults, and the load-bearing ``resolve_cwd`` logic ported from
the original ``/api/pool/connect`` handler. The live process is the pool's concern;
this service never spawns anything.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Any

from workspace_backend.domain.models import Agent
from workspace_backend.domain.ports import AgentStore, DefaultsStore, TitleStore, TranscriptStore
from workspace_backend.runtime_state import RuntimeState
from workspace_backend.services.config_writer import ConfigWriter

_ID_PREFIX = "bz-"


def _new_agent_id() -> str:
    """Mint a fresh agent id (``bz-<hex>``), matching the original scheme."""
    return f"{_ID_PREFIX}{secrets.token_hex(6)}"


class AgentService:
    """Durable agent records: list/get/create/delete/title/default + cwd resolution."""

    def __init__(
        self,
        agent_store: AgentStore,
        transcript_store: TranscriptStore,
        title_store: TitleStore,
        defaults_store: DefaultsStore,
        config_writer: ConfigWriter,
        runtime_state: RuntimeState,
        *,
        default_cwd: Path,
    ) -> None:
        self._agents = agent_store
        self._transcripts = transcript_store
        self._titles = title_store
        self._defaults = defaults_store
        self._config = config_writer
        self._state = runtime_state
        self._default_cwd = default_cwd

    async def list_all(self, cwd: str | None = None) -> list[Agent]:
        """List agent records (newest first). Defaults are read via :meth:`default_marker`."""
        return await self._agents.list_all(cwd)

    async def get(self, agent_id: str) -> Agent | None:
        return await self._agents.get(agent_id)

    async def exists(self, agent_id: str) -> bool:
        return await self._agents.exists(agent_id)

    async def create(
        self,
        *,
        cwd: str = "",
        mode: str,
        model_name: str = "",
    ) -> str:
        """Mint a new agent id, write its config, and return the id.

        Does not spawn a runtime — the caller connects separately. ``cwd`` is resolved
        against the default working dir when blank/relative.
        """
        agent_id = _new_agent_id()
        effective_cwd = self.resolve_cwd(cwd)
        await self._config.write(agent_id, mode, working_dir=effective_cwd, model_name=model_name)
        return agent_id

    async def delete(self, agent_id: str) -> bool:
        return await self._agents.delete(agent_id)

    async def set_title(self, agent_id: str, title: str) -> None:
        await self._titles.set(agent_id, title[:100])

    async def set_default(self, cwd: str, agent_id: str) -> None:
        await self._defaults.set(cwd, agent_id)

    async def clear_default(self, cwd: str) -> None:
        await self._defaults.clear(cwd)

    async def load_transcript(self, agent_id: str) -> list[dict[str, Any]]:
        return await self._transcripts.load_transcript(agent_id)

    def resolve_cwd(self, requested: str) -> str:
        """Resolve a requested cwd (pure; ported from ``/api/pool/connect``).

        - absolute path that exists → use it;
        - relative path (server stripped the prefix) → rebuild against the parent of
          the default cwd, if that exists;
        - otherwise → the default cwd.
        """
        default = str(self._default_cwd)
        if requested and Path(requested).is_absolute() and Path(requested).is_dir():
            return requested
        if requested and not Path(requested).is_absolute() and default:
            rebuilt = self._default_cwd.parent / requested
            if rebuilt.is_dir():
                return str(rebuilt)
        return default

    async def resolve_connect_cwd(self, agent_id: str, requested: str) -> str:
        """Resolve cwd for a connect, honoring a valid stored workingDir.

        For an existing agent, prefer the stored ``workingDir`` when it still exists on
        disk (the folder wasn't renamed); otherwise fall back to the client-resolved
        path. Mirrors the original connect handler.
        """
        effective = self.resolve_cwd(requested)
        meta = await self._agents.read_meta(agent_id)
        if meta:
            stored = meta.get("workingDir")
            # A single quick existence check; not worth offloading to a thread.
            if stored and Path(stored).is_dir():  # noqa: ASYNC240
                return str(stored)
        return effective

    async def default_marker(self, cwd: str) -> str | None:
        """Return the default agent id for a cwd, or ``None``."""
        return (await self._defaults.get_all()).get(cwd)
