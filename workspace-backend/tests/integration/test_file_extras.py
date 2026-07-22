"""Tests for file-extra endpoints: rename, duplicate, upload, download, view, settings."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest_asyncio

from workspace_backend.app import create_app
from workspace_backend.config import Settings


@pytest_asyncio.fixture
async def client(settings: Settings) -> httpx.AsyncClient:
    from httpx import ASGITransport

    app = create_app(settings)
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            yield ac


# ── File extras ───────────────────────────────────────────────────────────────


async def test_rename(client: httpx.AsyncClient, settings: Settings) -> None:
    cwd = str(settings.bzcode_cwd)
    # create a file to rename
    await client.put("/api/v1/files", json={"path": f"{cwd}/rename_me.txt", "content": "hi"})
    r = await client.post("/api/v1/files/rename", json={"path": f"{cwd}/rename_me.txt", "new_name": "renamed.txt"})
    assert r.status_code == 200
    assert r.json()["path"].endswith("renamed.txt")
    assert not Path(f"{cwd}/rename_me.txt").exists()  # noqa: ASYNC240
    assert Path(r.json()["path"]).exists()  # noqa: ASYNC240


async def test_rename_collision_returns_400(client: httpx.AsyncClient, settings: Settings) -> None:
    cwd = str(settings.bzcode_cwd)
    await client.put("/api/v1/files", json={"path": f"{cwd}/a.txt", "content": "a"})
    await client.put("/api/v1/files", json={"path": f"{cwd}/b.txt", "content": "b"})
    r = await client.post("/api/v1/files/rename", json={"path": f"{cwd}/a.txt", "new_name": "b.txt"})
    assert r.status_code == 400


async def test_duplicate(client: httpx.AsyncClient, settings: Settings) -> None:
    cwd = str(settings.bzcode_cwd)
    await client.put("/api/v1/files", json={"path": f"{cwd}/orig.txt", "content": "hello"})
    r = await client.post("/api/v1/files/duplicate", json={"path": f"{cwd}/orig.txt"})
    assert r.status_code == 200
    copy_path = r.json()["path"]
    assert "copy" in copy_path
    assert Path(copy_path).read_text() == "hello"  # noqa: ASYNC240


async def test_upload(client: httpx.AsyncClient, settings: Settings) -> None:
    cwd = str(settings.bzcode_cwd)
    r = await client.post(
        "/api/v1/files/upload",
        files={"file": ("hello.txt", b"uploaded content", "text/plain")},
        params={"dir": cwd},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "hello.txt"
    assert Path(r.json()["path"]).read_bytes() == b"uploaded content"  # noqa: ASYNC240


async def test_download(client: httpx.AsyncClient, settings: Settings) -> None:
    cwd = str(settings.bzcode_cwd)
    await client.put("/api/v1/files", json={"path": f"{cwd}/dl.txt", "content": "dl me"})
    r = await client.get("/api/v1/files/download", params={"path": f"{cwd}/dl.txt"})
    assert r.status_code == 200
    assert "attachment" in r.headers.get("content-disposition", "")
    assert r.content == b"dl me"


async def test_view(client: httpx.AsyncClient, settings: Settings) -> None:
    cwd = str(settings.bzcode_cwd)
    await client.put("/api/v1/files", json={"path": f"{cwd}/view.txt", "content": "view me"})
    r = await client.get("/api/v1/files/view", params={"path": f"{cwd}/view.txt"})
    assert r.status_code == 200
    assert "inline" in r.headers.get("content-disposition", "")


# ── Settings ──────────────────────────────────────────────────────────────────


async def test_resources(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/settings/resources")
    assert r.status_code == 200
    body = r.json()
    assert "sessions" in body
    assert "disk" in body
    assert body["disk"]["total"] > 0


async def test_clear_sessions(client: httpx.AsyncClient) -> None:
    r = await client.delete("/api/v1/settings/sessions/clear?olderThanDays=365")
    assert r.status_code == 200
    assert "deleted" in r.json()


async def test_server_log(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/settings/log?lines=10")
    assert r.status_code == 200
    body = r.json()
    assert "lines" in body
    assert isinstance(body["lines"], list)
