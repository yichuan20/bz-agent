"""End-to-end tests for the agent lifecycle over HTTP (against a fake bzcode).

Non-streaming routes use the in-process ``agent_client`` (ASGITransport). SSE
streaming can't work over ASGITransport (it buffers the whole response), so the
streaming tests use the real ``live_server`` fixture over a socket.
"""

from __future__ import annotations

import asyncio
import json

import httpx


async def _collect_turn(base: str, agent_id: str, content: str, *, timeout_s: float = 15.0) -> list[dict]:
    """Against a live server: open the SSE stream, send a message, collect the turn.

    Mirrors the real client order (stream first, then send) so the whole turn is
    observed rather than racing its completion.
    """
    collected: list[dict] = []
    started = asyncio.Event()

    async def _stream() -> None:
        async with httpx.AsyncClient(base_url=base) as ac:
            async with ac.stream("GET", f"/api/v1/agents/{agent_id}/events", timeout=timeout_s) as resp:
                assert resp.status_code == 200
                started.set()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    msg = json.loads(line[len("data: ") :])
                    collected.append(msg)
                    if msg.get("type") == "result":
                        return

    task = asyncio.create_task(_stream())
    await started.wait()
    async with httpx.AsyncClient(base_url=base) as ac:
        send = await ac.post(f"/api/v1/agents/{agent_id}/messages", json={"content": content})
        assert send.status_code == 200
    await asyncio.wait_for(task, timeout=timeout_s)
    return collected


async def test_create_connect_send_stream_flow(live_server: str) -> None:
    """The core path over a real socket: create → connect → open SSE → send → stream."""
    async with httpx.AsyncClient(base_url=live_server) as ac:
        created = await ac.post("/api/v1/agents", json={"mode": "general"})
        assert created.status_code == 200
        agent_id = created.json()["id"]
        assert agent_id.startswith("bz-")

        connected = await ac.post(f"/api/v1/agents/{agent_id}/connect", json={})
        assert connected.status_code == 200
        assert connected.json()["pid"] is not None  # runtime spawned

    # Capabilities (session) and the turn arrive on the stream: opening it replays the
    # buffered startup `session` message, then the live turn streams in.
    msgs = await _collect_turn(live_server, agent_id, "hello")
    types = [m["type"] for m in msgs]
    assert "session" in types  # bzcode's capabilities message, replayed on subscribe
    assert "user" in types  # seeded prompt streamed to the live client
    assert "assistant" in types
    assert "result" in types


async def test_reconnect_replays_turn(live_server: str) -> None:
    """The seeded user prompt is streamed to a live client during its turn."""
    async with httpx.AsyncClient(base_url=live_server) as ac:
        created = await ac.post("/api/v1/agents", json={"mode": "general"})
        agent_id = created.json()["id"]
        await ac.post(f"/api/v1/agents/{agent_id}/connect", json={})
    msgs = await _collect_turn(live_server, agent_id, "hi there")
    assert any(m.get("type") == "user" for m in msgs)


async def test_connect_without_api_key_401(agent_settings) -> None:
    """Connect is gated on BZ_API_KEY (mirrors the original behavior)."""
    from pathlib import Path

    from httpx import ASGITransport, AsyncClient

    from workspace_backend.app import create_app

    # No api_keys.json written → not authorized.
    Path(agent_settings.bz_home).mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    app = create_app(agent_settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            created = await ac.post("/api/v1/agents", json={"mode": "general"})
            agent_id = created.json()["id"]
            resp = await ac.post(f"/api/v1/agents/{agent_id}/connect", json={})
    assert resp.status_code == 401
    assert resp.json()["error"] == "credentials_missing"


async def test_transcript_endpoint_empty_for_new_agent(agent_client: httpx.AsyncClient) -> None:
    created = await agent_client.post("/api/v1/agents", json={"mode": "general"})
    agent_id = created.json()["id"]
    resp = await agent_client.get(f"/api/v1/agents/{agent_id}/messages")
    assert resp.status_code == 200
    assert resp.json()["messages"] == []


async def test_stop_runtime(agent_client: httpx.AsyncClient) -> None:
    created = await agent_client.post("/api/v1/agents", json={"mode": "general"})
    agent_id = created.json()["id"]
    await agent_client.post(f"/api/v1/agents/{agent_id}/connect", json={})
    status = await agent_client.get("/api/v1/agents/status")
    assert any(a["agentId"] == agent_id for a in status.json()["agents"])
    stopped = await agent_client.post(f"/api/v1/agents/{agent_id}/stop", json={})
    assert stopped.status_code == 200
    status2 = await agent_client.get("/api/v1/agents/status")
    assert all(a["agentId"] != agent_id for a in status2.json()["agents"])


async def test_events_before_connect_409(agent_client: httpx.AsyncClient) -> None:
    created = await agent_client.post("/api/v1/agents", json={"mode": "general"})
    agent_id = created.json()["id"]
    resp = await agent_client.get(f"/api/v1/agents/{agent_id}/events")
    assert resp.status_code == 409
    assert resp.json()["error"] == "agent_not_live"


async def test_send_before_connect_409(agent_client: httpx.AsyncClient) -> None:
    created = await agent_client.post("/api/v1/agents", json={"mode": "general"})
    agent_id = created.json()["id"]
    resp = await agent_client.post(f"/api/v1/agents/{agent_id}/messages", json={"content": "hi"})
    assert resp.status_code == 409
