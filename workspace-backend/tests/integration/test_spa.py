"""SPA serving: the backend serves the built frontend without shadowing the API."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from workspace_backend.app import create_app
from workspace_backend.config import Settings


@pytest_asyncio.fixture
async def spa_client(settings: Settings, tmp_path: Path) -> AsyncIterator[AsyncClient]:
    """A client whose app serves a tiny built SPA from a tmp dist."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text('<!doctype html><div id="app"></div>')
    (dist / "assets" / "app.js").write_text("console.log('spa')")
    app = create_app(settings.model_copy(update={"frontend_dist": dist}))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            yield ac


async def test_serves_shell_at_root(spa_client: AsyncClient) -> None:
    resp = await spa_client.get("/")
    assert resp.status_code == 200
    assert 'id="app"' in resp.text


async def test_deep_links_fall_back_to_shell(spa_client: AsyncClient) -> None:
    for path in ("/agent", "/settings", "/login"):
        resp = await spa_client.get(path)
        assert resp.status_code == 200
        assert 'id="app"' in resp.text


async def test_serves_real_asset_files(spa_client: AsyncClient) -> None:
    resp = await spa_client.get("/assets/app.js")
    assert resp.status_code == 200
    assert "spa" in resp.text


async def test_api_is_not_shadowed(spa_client: AsyncClient) -> None:
    assert (await spa_client.get("/api/v1/version")).status_code == 200
    assert (await spa_client.get("/healthz")).status_code == 200


async def test_unknown_api_path_404s(spa_client: AsyncClient) -> None:
    # An unmatched API path must 404, not fall back to the SPA shell.
    resp = await spa_client.get("/api/v1/does-not-exist")
    assert resp.status_code == 404
    assert 'id="app"' not in resp.text


async def test_no_mount_without_build(settings: Settings, tmp_path: Path) -> None:
    """With no dist, the SPA catch-all is absent and unknown paths plainly 404."""
    app = create_app(settings.model_copy(update={"frontend_dist": tmp_path / "absent"}))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            resp = await ac.get("/agent")
    assert resp.status_code == 404
