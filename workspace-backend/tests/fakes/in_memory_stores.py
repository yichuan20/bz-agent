"""In-memory implementations of the storage ports, for fast service tests.

Each satisfies the corresponding Protocol in ``domain/ports.py`` without touching
disk. mypy verifies they conform (the services are typed against the ports).
"""

from __future__ import annotations

from typing import Any

from workspace_backend.domain.models import Agent


class InMemoryAgentStore:
    def __init__(self) -> None:
        self.agents: dict[str, Agent] = {}
        self.meta: dict[str, dict[str, Any]] = {}
        self.config_writes: dict[str, dict[str, str]] = {}
        self.asset_copies: list[tuple[str, str, str]] = []

    async def get(self, agent_id: str) -> Agent | None:
        return self.agents.get(agent_id)

    async def list_all(self, cwd: str | None = None) -> list[Agent]:
        items = list(self.agents.values())
        if cwd is not None:
            items = [a for a in items if a.working_dir == cwd]
        return sorted(items, key=lambda a: a.last_modified, reverse=True)

    async def exists(self, agent_id: str) -> bool:
        return agent_id in self.agents

    async def delete(self, agent_id: str) -> bool:
        return self.agents.pop(agent_id, None) is not None

    async def read_meta(self, agent_id: str) -> dict[str, Any] | None:
        return self.meta.get(agent_id)

    async def write_config_files(self, agent_id: str, files: dict[str, str]) -> None:
        self.config_writes[agent_id] = dict(files)

    async def copy_assets(self, agent_id: str, scripts_dir: str, templates_dir: str) -> str:
        self.asset_copies.append((agent_id, scripts_dir, templates_dir))
        return f"/sessions/{agent_id}/scripts"


class InMemoryTranscriptStore:
    def __init__(self) -> None:
        self.transcripts: dict[str, list[dict[str, Any]]] = {}

    async def load_transcript(self, agent_id: str) -> list[dict[str, Any]]:
        return self.transcripts.get(agent_id, [])


class InMemoryTitleStore:
    def __init__(self) -> None:
        self.titles: dict[str, str] = {}

    async def get_all(self) -> dict[str, str]:
        return dict(self.titles)

    async def set(self, agent_id: str, title: str) -> None:
        self.titles[agent_id] = title


class InMemoryDefaultsStore:
    def __init__(self) -> None:
        self.defaults: dict[str, str] = {}

    async def get_all(self) -> dict[str, str]:
        return dict(self.defaults)

    async def set(self, cwd: str, agent_id: str) -> None:
        self.defaults[cwd] = agent_id

    async def clear(self, cwd: str) -> None:
        self.defaults.pop(cwd, None)


class InMemoryApiKeyStore:
    def __init__(self) -> None:
        self.key: str | None = None

    async def get_api_key(self) -> str | None:
        return self.key

    async def set_api_key(self, value: str) -> None:
        self.key = value

    async def delete_api_key(self) -> bool:
        if self.key is None:
            return False
        self.key = None
        return True


class InMemorySecretStore:
    def __init__(self) -> None:
        self.secrets: dict[str, str] = {}

    async def list_keys(self) -> list[str]:
        return list(self.secrets.keys())

    async def set_secret(self, key: str, value: str) -> None:
        self.secrets[key] = value

    async def delete_secret(self, key: str) -> bool:
        return self.secrets.pop(key, None) is not None


class InMemoryModeConfigStore:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config

    async def load(self) -> dict[str, Any]:
        return self.config
