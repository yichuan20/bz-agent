"""Integration tests: AgentPool driven against the fake bzcode stub.

These spawn the real ``tests/fakes/fake_bzcode.py`` through the pool's actual spawn
path, so they exercise real process I/O, stdout framing, the reader, and the
dispatch loop — deterministically, since the stub only emits in response to stdin.
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest
import pytest_asyncio

from workspace_backend.domain.models import RuntimeStatus, SessionMode
from workspace_backend.errors import ProbeSessionRejected
from workspace_backend.infra.process import asyncio_spawn
from workspace_backend.services.agent_pool.pool import AgentPool

_FAKE = Path(__file__).parent.parent / "fakes" / "fake_bzcode.py"


def _make_pool(
    tmp_path: Path,
    *,
    idle_timeout: float = 300.0,
    session_mode_for: Callable[[str], SessionMode] | None = None,
    usage_sink: list[dict] | None = None,
) -> AgentPool:
    """Build a pool that spawns the fake bzcode stub for every agent."""

    def build_command(agent_id: str) -> list[str]:
        return [sys.executable, str(_FAKE), "--stdio", "--resume", agent_id]

    async def build_env() -> dict[str, str]:
        return {}

    return AgentPool(
        spawn=asyncio_spawn,
        build_command=build_command,
        build_env=build_env,
        idle_timeout=idle_timeout,
        session_mode_for=session_mode_for,
        on_usage=(usage_sink.append if usage_sink is not None else None),
    )


async def _drain_until(
    q: asyncio.Queue[str | None], predicate: Callable[[dict], bool], *, timeout_s: float = 5.0
) -> list[dict]:
    """Collect parsed messages from a subscriber queue until ``predicate`` matches."""
    collected: list[dict] = []

    async def _loop() -> list[dict]:
        while True:
            raw = await q.get()
            if raw is None:
                return collected
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            collected.append(msg)
            if predicate(msg):
                return collected

    async with asyncio.timeout(timeout_s):
        return await _loop()


@pytest_asyncio.fixture
async def pool(tmp_path: Path) -> AsyncIterator[AgentPool]:
    p = _make_pool(tmp_path)
    await p.start()
    try:
        yield p
    finally:
        await p.stop()


async def test_get_or_create_spawns_and_reuses(pool: AgentPool, tmp_path: Path) -> None:
    rt1 = await pool.get_or_create("bz-a1", str(tmp_path), "general")
    assert rt1.pid is not None
    assert not rt1.is_dead
    rt2 = await pool.get_or_create("bz-a1", str(tmp_path), "general")
    assert rt2 is rt1  # same id → same runtime


async def test_probe_session_rejected(pool: AgentPool, tmp_path: Path) -> None:
    with pytest.raises(ProbeSessionRejected):
        await pool.get_or_create("bz-probe-xyz", str(tmp_path), "general")


async def test_full_turn_streams_to_subscriber(pool: AgentPool, tmp_path: Path) -> None:
    rt = await pool.get_or_create("bz-turn", str(tmp_path), "general")
    q = rt.subscribe()
    rt.seed_user_turn(json.dumps({"type": "user", "content": "hello"}))
    await rt.send({"type": "user", "content": "hello"})
    # Drain to the turn's result (an unambiguous end; the startup `idle` is not one).
    msgs = await _drain_until(q, lambda m: m.get("type") == "result")
    types = [m["type"] for m in msgs]
    assert "user" in types  # seeded prompt replayed to the live subscriber
    assert "assistant" in types
    assert "result" in types
    rt.unsubscribe(q)


async def test_usage_callback_fires(tmp_path: Path) -> None:
    usage: list[dict] = []
    p = _make_pool(tmp_path, usage_sink=usage)
    await p.start()
    try:
        rt = await p.get_or_create("bz-usage", str(tmp_path), "general")
        q = rt.subscribe()
        await rt.send({"type": "user", "content": "hi"})
        await _drain_until(q, lambda m: m.get("type") == "result")
        assert usage and usage[0]["outputTokens"] == 5
    finally:
        await p.stop()


async def test_yolo_auto_approves_permission(tmp_path: Path) -> None:
    p = _make_pool(tmp_path, session_mode_for=lambda _m: SessionMode.YOLO)
    await p.start()
    try:
        rt = await p.get_or_create("bz-yolo", str(tmp_path), "widget")
        # Force yolo state directly (setMode ack from the stub is fire-and-forget).
        rt.state.session_mode = SessionMode.YOLO
        q = rt.subscribe()
        await rt.send({"type": "user", "content": "/perm"})
        # The prompt must NOT reach the subscriber; the turn completes via auto-approve.
        msgs = await _drain_until(q, lambda m: m.get("type") == "result")
        assert all(m["type"] != "prompt" for m in msgs)
        assert any(m["type"] == "assistant" for m in msgs)
    finally:
        await p.stop()


async def test_permission_forwarded_in_default_mode(tmp_path: Path) -> None:
    p = _make_pool(tmp_path)
    await p.start()
    try:
        rt = await p.get_or_create("bz-perm", str(tmp_path), "general")
        q = rt.subscribe()
        await rt.send({"type": "user", "content": "/perm"})
        msgs = await _drain_until(q, lambda m: m.get("type") == "prompt")
        assert msgs[-1]["subtype"] == "permission"
        assert rt.state.status == RuntimeStatus.WAITING_PERMISSION
    finally:
        await p.stop()


async def test_reconnect_replays_turn_buffer(pool: AgentPool, tmp_path: Path) -> None:
    rt = await pool.get_or_create("bz-reco", str(tmp_path), "general")
    # Start a turn that pauses on a permission prompt (default mode → not auto-approved).
    q1 = rt.subscribe()
    rt.seed_user_turn(json.dumps({"type": "user", "content": "/perm"}))
    await rt.send({"type": "user", "content": "/perm"})
    await _drain_until(q1, lambda m: m.get("type") == "prompt")
    rt.unsubscribe(q1)

    # A fresh subscriber reconnecting mid-turn should get the seeded prompt + the
    # pending permission prompt replayed (agent is still waiting).
    q2 = rt.subscribe()
    replayed: list[dict] = []
    while not q2.empty():
        raw = q2.get_nowait()
        if raw:
            replayed.append(json.loads(raw))
    types = [m["type"] for m in replayed]
    assert "user" in types  # the seeded prompt
    assert "prompt" in types  # still-waiting permission prompt


async def test_dead_process_marks_runtime_dead(pool: AgentPool, tmp_path: Path) -> None:
    rt = await pool.get_or_create("bz-exit", str(tmp_path), "general")
    q = rt.subscribe()
    await rt.send({"type": "user", "content": "/exit"})
    # Draining ends with the None sentinel when the process exits.
    await _drain_until(q, lambda m: False)  # runs until EOF sentinel
    await asyncio.sleep(0.1)
    assert rt.is_dead


async def test_oversized_line_is_dropped_then_recovers(pool: AgentPool, tmp_path: Path) -> None:
    rt = await pool.get_or_create("bz-huge", str(tmp_path), "general")
    q = rt.subscribe()
    await rt.send({"type": "user", "content": "/huge"})
    # The >16MB line is dropped; the following normal turn still arrives (ends in result).
    msgs = await _drain_until(q, lambda m: m.get("type") == "result", timeout_s=10.0)
    assert any(m["type"] == "assistant" for m in msgs)


async def test_stderr_auth_keyword_forwards_auth_error(pool: AgentPool, tmp_path: Path) -> None:
    rt = await pool.get_or_create("bz-auth", str(tmp_path), "general")
    q = rt.subscribe()
    await rt.send({"type": "user", "content": "/authfail"})
    msgs = await _drain_until(q, lambda m: m.get("type") == "system" and m.get("event") == "auth-error")
    assert msgs[-1]["event"] == "auth-error"


async def test_idle_sweeper_reaps_clientless_idle_runtime(tmp_path: Path) -> None:
    p = _make_pool(tmp_path, idle_timeout=0.0)  # reap as soon as idle + no clients
    await p.start()
    try:
        rt = await p.get_or_create("bz-idle", str(tmp_path), "general")
        q = rt.subscribe()
        await rt.send({"type": "user", "content": "hi"})
        await _drain_until(q, lambda m: m.get("type") == "status" and m.get("status") == "idle")
        rt.unsubscribe(q)  # no clients now
        rt.state.status = RuntimeStatus.IDLE
        await asyncio.sleep(0.01)  # let last_detach_at fall behind now()
        await p._sweep_once()
        assert p.get("bz-idle") is None
    finally:
        await p.stop()


async def test_flush_all_shuts_down_everything(pool: AgentPool, tmp_path: Path) -> None:
    await pool.get_or_create("bz-f1", str(tmp_path), "general")
    await pool.get_or_create("bz-f2", str(tmp_path), "general")
    count = await pool.flush_all()
    assert count == 2
    assert pool.get("bz-f1") is None
    assert pool.get("bz-f2") is None
