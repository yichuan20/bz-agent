"""Storage ports (hexagonal interfaces).

These ``typing.Protocol`` classes are the contract the domain owns. Filesystem
implementations live in ``infra/storage/filesystem/``; a future Postgres set will
implement the same protocols with zero service changes.

Methods are ``async`` so the interface never leaks whether an impl is sync or async
— the filesystem impls run synchronously inside ``async def`` (KB-sized files), and
the eventual Postgres impls are genuinely async. Method names are behavioral
(``load_transcript``), not file-oriented (``read_file``), so a non-filesystem impl
can satisfy them.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from workspace_backend.domain.models import Agent


@runtime_checkable
class AgentStore(Protocol):
    """Persistence for durable agent records (id, working dir, mode, title, model)."""

    async def get(self, agent_id: str) -> Agent | None:
        """Return the agent record, or ``None`` if it doesn't exist."""
        ...

    async def list(self, cwd: str | None = None) -> list[Agent]:
        """Return all agent records, newest first; optionally filtered by ``cwd``."""
        ...

    async def save(self, agent: Agent) -> None:
        """Create or update an agent record."""
        ...

    async def delete(self, agent_id: str) -> bool:
        """Delete an agent record. Return ``True`` if it existed."""
        ...


@runtime_checkable
class TranscriptStore(Protocol):
    """Read access to a bzcode conversation transcript."""

    async def load_transcript(self, agent_id: str) -> list[dict[str, Any]]:
        """Return the ordered message objects for an agent (empty if none)."""
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
