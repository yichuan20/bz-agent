"""Tests for AgentService (records, titles, defaults, cwd resolution)."""

from __future__ import annotations

from pathlib import Path

from tests.fakes.in_memory_stores import (
    InMemoryAgentStore,
    InMemoryDefaultsStore,
    InMemoryTitleStore,
    InMemoryTranscriptStore,
)
from workspace_backend.domain.models import Agent
from workspace_backend.runtime_state import RuntimeState
from workspace_backend.services.agent_service import AgentService


class _StubConfigWriter:
    """Records config writes without touching disk."""

    def __init__(self) -> None:
        self.writes: list[tuple[str, str, str]] = []

    async def write(self, agent_id, mode, *, working_dir, model_name=""):  # noqa: ANN001, ANN002
        self.writes.append((agent_id, mode, working_dir))


def _service(tmp_path: Path) -> tuple[AgentService, InMemoryAgentStore, _StubConfigWriter]:
    agents = InMemoryAgentStore()
    writer = _StubConfigWriter()
    default_cwd = tmp_path / "workspace"
    default_cwd.mkdir(parents=True, exist_ok=True)
    svc = AgentService(
        agents,
        InMemoryTranscriptStore(),
        InMemoryTitleStore(),
        InMemoryDefaultsStore(),
        writer,  # type: ignore[arg-type]
        RuntimeState(),
        default_cwd=default_cwd,
    )
    return svc, agents, writer


async def test_create_mints_id_and_writes_config(tmp_path: Path) -> None:
    svc, _, writer = _service(tmp_path)
    agent_id = await svc.create(mode="general")
    assert agent_id.startswith("bz-")
    assert len(writer.writes) == 1
    written_id, mode, _cwd = writer.writes[0]
    assert written_id == agent_id
    assert mode == "general"


async def test_list_and_get(tmp_path: Path) -> None:
    svc, agents, _ = _service(tmp_path)
    agents.agents["bz-1"] = Agent(id="bz-1", working_dir="/ws", mode="general", last_modified=1.0)
    agents.agents["bz-2"] = Agent(id="bz-2", working_dir="/ws", mode="coder", last_modified=2.0)
    listed = await svc.list_all()
    assert [a.id for a in listed] == ["bz-2", "bz-1"]  # newest first
    assert (await svc.get("bz-1")).mode == "general"


async def test_delete(tmp_path: Path) -> None:
    svc, agents, _ = _service(tmp_path)
    agents.agents["bz-1"] = Agent(id="bz-1", working_dir="/ws", mode="general")
    assert await svc.delete("bz-1") is True
    assert await svc.delete("bz-1") is False


async def test_titles_and_defaults(tmp_path: Path) -> None:
    svc, _, _ = _service(tmp_path)
    await svc.set_title("bz-1", "My session")
    await svc.set_default("/ws", "bz-1")
    assert await svc.default_marker("/ws") == "bz-1"
    await svc.clear_default("/ws")
    assert await svc.default_marker("/ws") is None


def test_resolve_cwd_absolute_existing(tmp_path: Path) -> None:
    svc, _, _ = _service(tmp_path)
    existing = tmp_path / "other"
    existing.mkdir()
    assert svc.resolve_cwd(str(existing)) == str(existing)


def test_resolve_cwd_relative_rebuilds_against_parent(tmp_path: Path) -> None:
    svc, _, _ = _service(tmp_path)
    # default_cwd is tmp_path/workspace; a sibling dir under tmp_path is reachable.
    sibling = tmp_path / "proj"
    sibling.mkdir()
    assert svc.resolve_cwd("proj") == str(sibling)


def test_resolve_cwd_falls_back_to_default(tmp_path: Path) -> None:
    svc, _, _ = _service(tmp_path)
    assert svc.resolve_cwd("/nonexistent/path") == str(tmp_path / "workspace")
    assert svc.resolve_cwd("") == str(tmp_path / "workspace")


def test_relativize_cwd_strips_base(tmp_path: Path) -> None:
    """working_dir under parent(default_cwd) is returned relative; else absolute."""
    svc, _, _ = _service(tmp_path)  # default_cwd = tmp_path/workspace, base = tmp_path
    assert svc.relativize_cwd(str(tmp_path / "workspace")) == "workspace"
    assert svc.relativize_cwd(str(tmp_path / "workspace" / "proj")) == "workspace/proj"
    assert svc.relativize_cwd(str(tmp_path / "other")) == "other"
    # Outside the base → unchanged (absolute).
    assert svc.relativize_cwd("/tmp/elsewhere") == "/tmp/elsewhere"


def test_relativize_is_inverse_of_resolve(tmp_path: Path) -> None:
    """relativize_cwd then resolve_cwd round-trips for a real in-workspace dir."""
    svc, _, _ = _service(tmp_path)
    proj = tmp_path / "proj"
    proj.mkdir()
    rel = svc.relativize_cwd(str(proj))  # "proj"
    assert rel == "proj"
    assert svc.resolve_cwd(rel) == str(proj)  # rebuilt back to absolute


async def test_resolve_connect_cwd_prefers_stored_workingdir(tmp_path: Path) -> None:
    svc, agents, _ = _service(tmp_path)
    stored = tmp_path / "stored"
    stored.mkdir()
    agents.meta["bz-1"] = {"workingDir": str(stored)}
    # Even with a blank request, the valid stored dir wins.
    assert await svc.resolve_connect_cwd("bz-1", "") == str(stored)


async def test_resolve_connect_cwd_ignores_missing_stored_dir(tmp_path: Path) -> None:
    svc, agents, _ = _service(tmp_path)
    agents.meta["bz-1"] = {"workingDir": "/gone/renamed"}
    assert await svc.resolve_connect_cwd("bz-1", "") == str(tmp_path / "workspace")
