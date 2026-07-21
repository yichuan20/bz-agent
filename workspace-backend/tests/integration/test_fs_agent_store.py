"""Tests for the filesystem AgentStore/TranscriptStore session parsing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest_asyncio

from workspace_backend.infra.storage.filesystem.agents import (
    FsAgentStore,
    FsTitleStore,
    FsTranscriptStore,
)
from workspace_backend.infra.storage.filesystem.paths import Paths


@pytest_asyncio.fixture
def paths(tmp_path: Path) -> Paths:
    return Paths(bz_home=tmp_path / "bzhome", server_data=tmp_path / "server_data")


def _write_meta(paths: Paths, agent_id: str, meta: dict) -> None:
    """Write just the agent's meta.json (the durable record, as `create` does)."""
    paths.config_dir(agent_id).mkdir(parents=True, exist_ok=True)
    paths.meta(agent_id).write_text(json.dumps(meta))


def _write_session(paths: Paths, agent_id: str, lines: list[dict], meta: dict | None = None) -> None:
    paths.sessions_dir.mkdir(parents=True, exist_ok=True)
    paths.transcript(agent_id).write_text("\n".join(json.dumps(m) for m in lines))
    if meta is not None:
        _write_meta(paths, agent_id, meta)


async def test_created_agent_without_transcript_is_listable(paths: Paths) -> None:
    """meta.json alone (create, no turn yet) makes the agent exist and listable."""
    store = FsAgentStore(paths, FsTitleStore(paths))
    _write_meta(paths, "bz-new", {"workingDir": "/ws/proj", "mode": "coder"})
    agent = await store.get("bz-new")
    assert agent is not None
    assert agent.working_dir == "/ws/proj"
    assert agent.mode == "coder"
    assert agent.message_count == 0
    assert agent.title == "(empty)"
    assert await store.exists("bz-new") is True
    assert [a.id for a in await store.list_all()] == ["bz-new"]


async def test_new_format_uses_meta_for_workingdir(paths: Paths) -> None:
    store = FsAgentStore(paths, FsTitleStore(paths))
    _write_session(
        paths,
        "bz-1",
        [{"role": "user", "content": "Fix the bug"}, {"role": "assistant", "content": "ok"}],
        meta={"workingDir": "/ws/proj", "mode": "coder", "model": "boltzbit-1"},
    )
    agent = await store.get("bz-1")
    assert agent is not None
    assert agent.working_dir == "/ws/proj"
    assert agent.mode == "coder"
    assert agent.title == "Fix the bug"
    assert agent.message_count == 1


async def test_old_format_reads_header(paths: Paths) -> None:
    store = FsAgentStore(paths, FsTitleStore(paths))
    _write_session(
        paths,
        "bz-2",
        [
            {"type": "session", "sessionId": "bz-2", "workingDir": "/ws/old", "created": "2026"},
            {"role": "user", "content": "Hello there"},
        ],
        meta={"workingDir": "/ws/old", "mode": "general"},
    )
    agent = await store.get("bz-2")
    assert agent is not None
    assert agent.working_dir == "/ws/old"
    assert agent.created_at == "2026"  # from the transcript session header
    assert agent.title == "Hello there"


async def test_handshake_noise_skipped_in_title(paths: Paths) -> None:
    store = FsAgentStore(paths, FsTitleStore(paths))
    _write_session(
        paths,
        "bz-3",
        [
            {"role": "user", "content": "Hi, hand shake, say yes"},
            {"role": "user", "content": "Real question"},
        ],
        meta={"workingDir": "/ws"},
    )
    agent = await store.get("bz-3")
    assert agent is not None
    assert agent.title == "Real question"


async def test_custom_title_overrides_derived(paths: Paths) -> None:
    titles = FsTitleStore(paths)
    store = FsAgentStore(paths, titles)
    _write_session(paths, "bz-4", [{"role": "user", "content": "auto title"}], meta={"workingDir": "/ws"})
    await titles.set("bz-4", "My Custom Title")
    agent = await store.get("bz-4")
    assert agent is not None
    assert agent.title == "My Custom Title"


async def test_list_filters_by_cwd_and_sorts(paths: Paths) -> None:
    store = FsAgentStore(paths, FsTitleStore(paths))
    _write_session(paths, "bz-a", [{"role": "user", "content": "a"}], meta={"workingDir": "/ws/x"})
    _write_session(paths, "bz-b", [{"role": "user", "content": "b"}], meta={"workingDir": "/ws/y"})
    all_agents = await store.list_all()
    assert {a.id for a in all_agents} == {"bz-a", "bz-b"}
    filtered = await store.list_all(cwd="/ws/x")
    assert [a.id for a in filtered] == ["bz-a"]


async def test_delete_transcript(paths: Paths) -> None:
    store = FsAgentStore(paths, FsTitleStore(paths))
    _write_session(paths, "bz-5", [{"role": "user", "content": "x"}], meta={"workingDir": "/ws"})
    assert await store.exists("bz-5") is True
    assert await store.delete("bz-5") is True
    assert await store.exists("bz-5") is False


async def test_transcript_store_strips_session_and_timestamp(paths: Paths) -> None:
    ts = FsTranscriptStore(paths)
    _write_session(
        paths,
        "bz-6",
        [
            {"type": "session", "sessionId": "bz-6"},
            {"role": "user", "content": "hi", "timestamp": "2026"},
        ],
        meta={"workingDir": "/ws"},
    )
    msgs = await ts.load_transcript("bz-6")
    assert len(msgs) == 1
    assert msgs[0]["role"] == "user"
    assert "timestamp" not in msgs[0]
