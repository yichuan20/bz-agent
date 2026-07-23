"""Storage ports (hexagonal interfaces).

These ``typing.Protocol`` classes are the contract the domain owns. Filesystem
implementations live in ``infra/storage/filesystem/``; a future Postgres set will
implement the same protocols with zero service changes.

Methods are ``async`` so the interface never leaks whether an impl is sync or async
— the filesystem impls run synchronously inside ``async def`` (KB-sized files; the
one large read, a transcript, is wrapped in ``asyncio.to_thread``), and the eventual
Postgres impls are genuinely async. Method names are behavioral, not file-oriented,
so a non-filesystem impl can satisfy them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from workspace_backend.domain.models import Agent


@runtime_checkable
class AgentStore(Protocol):
    """Persistence for durable agent records and their per-agent config directory."""

    async def get(self, agent_id: str) -> Agent | None:
        """Return the agent record (transcript-derived + meta), or ``None``."""
        ...

    async def list_all(self, cwd: str | None = None) -> list[Agent]:
        """Return all agent records, newest first; optionally filtered by ``cwd``."""
        ...

    async def exists(self, agent_id: str) -> bool:
        """Whether a transcript exists for ``agent_id`` (i.e. it's a real session)."""
        ...

    async def delete(self, agent_id: str) -> bool:
        """Delete the agent's transcript. Return ``True`` if it existed."""
        ...

    async def read_meta(self, agent_id: str) -> dict[str, Any] | None:
        """Return the agent's ``meta.json`` contents, or ``None`` if absent."""
        ...

    async def write_config_files(self, agent_id: str, files: dict[str, str]) -> None:
        """Write a compiled config into the agent's dir.

        ``files`` maps *relative* paths (e.g. ``IDENTITY.md``, ``skills/x/SKILL.md``)
        to their contents. Paths absent from ``files`` but "owned" by us are removed,
        and files not owned by us (bzcode sub-agent leftovers) are purged, so the dir
        reflects exactly the current mode. ``meta.json`` is included by the caller.
        """
        ...

    def config_dir(self, agent_id: str) -> Path:
        """Return the absolute path of the agent's config directory ($BZ_HOME/sessions/{id}).

        Used to resolve the ``{session_dir}`` template token so skills like
        ``new-widget`` can pass ``--session-dir`` to helper scripts.
        """
        ...

    async def copy_assets(self, agent_id: str, scripts_dir: str, templates_dir: str) -> str:
        """Copy helper scripts + templates into the agent's dir.

        Returns the absolute path of the copied scripts dir (used to resolve the
        ``{scripts_path}`` template token). Scripts are copied by mtime; templates
        are replaced wholesale.
        """
        ...


@runtime_checkable
class TranscriptStore(Protocol):
    """Read access to a bzcode conversation transcript."""

    async def load_transcript(self, agent_id: str) -> list[dict[str, Any]]:
        """Return the ordered message objects for an agent (empty if none)."""
        ...


@runtime_checkable
class TitleStore(Protocol):
    """Persistence for user-assigned agent titles."""

    async def get_all(self) -> dict[str, str]:
        """Return all titles keyed by agent id."""
        ...

    async def set(self, agent_id: str, title: str) -> None:
        """Set (or overwrite) an agent's title."""
        ...


@runtime_checkable
class DefaultsStore(Protocol):
    """Persistence for the default agent id per working directory."""

    async def get_all(self) -> dict[str, str]:
        """Return the default agent id for each cwd."""
        ...

    async def set(self, cwd: str, agent_id: str) -> None:
        """Set the default agent for a cwd."""
        ...

    async def clear(self, cwd: str) -> None:
        """Remove the default for a cwd."""
        ...


@runtime_checkable
class ApiKeyStore(Protocol):
    """Persistence for the ``BZ_API_KEY`` login credential."""

    async def get_api_key(self) -> str | None:
        """Return the stored ``BZ_API_KEY``, or ``None`` if unset."""
        ...

    async def set_api_key(self, value: str) -> None:
        """Store (overwrite) the ``BZ_API_KEY``."""
        ...

    async def delete_api_key(self) -> bool:
        """Remove the stored key. Return ``True`` if one existed."""
        ...


@runtime_checkable
class SecretStore(Protocol):
    """Persistence for widget secret placeholders (e.g. ``OPENAI_API_KEY``).

    Distinct from ``ApiKeyStore``: these are substituted into widget code, not used
    to authenticate bzcode.
    """

    async def list_keys(self) -> list[str]:
        """Return the names of stored secrets (never the values)."""
        ...

    async def get_secret(self, key: str) -> str | None:
        """Return the value of a stored secret, or ``None`` if not present."""
        ...

    async def set_secret(self, key: str, value: str) -> None:
        """Store or update a secret."""
        ...

    async def delete_secret(self, key: str) -> bool:
        """Delete a secret. Return ``True`` if it existed."""
        ...


@runtime_checkable
class ModeConfigStore(Protocol):
    """Read access to the agent-modes configuration (``agent_modes.json``)."""

    async def load(self) -> dict[str, Any]:
        """Return the raw mode config: ``{"default": str, "modes": {...}}``."""
        ...
