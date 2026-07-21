"""E2E tests for auth, secrets, modes, and files routes."""

from __future__ import annotations

import httpx

# ── Auth (BZ_API_KEY) ─────────────────────────────────────────────────────────


async def test_api_key_lifecycle(client: httpx.AsyncClient) -> None:
    status = await client.get("/api/v1/auth/api-key")
    assert status.status_code == 200
    assert status.json()["present"] is False

    put = await client.put("/api/v1/auth/api-key", json={"value": "bz_secret"})
    assert put.status_code == 200
    assert (await client.get("/api/v1/auth/api-key")).json()["present"] is True

    delete = await client.delete("/api/v1/auth/api-key")
    assert delete.status_code == 200
    assert (await client.get("/api/v1/auth/api-key")).json()["present"] is False


# ── Secrets (widget placeholders) ─────────────────────────────────────────────


async def test_secrets_lifecycle(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/secrets")).json()["keys"] == []
    await client.put("/api/v1/secrets", json={"key": "OPENWEATHERMAP_API_KEY", "value": "w-1"})
    keys = (await client.get("/api/v1/secrets")).json()["keys"]
    assert keys == ["OPENWEATHERMAP_API_KEY"]
    deleted = await client.delete("/api/v1/secrets/OPENWEATHERMAP_API_KEY")
    assert deleted.status_code == 200
    assert (await client.get("/api/v1/secrets")).json()["keys"] == []


async def test_secret_is_not_the_login_key(client: httpx.AsyncClient) -> None:
    """A widget secret named BZ_API_KEY must not satisfy the login check."""
    await client.put("/api/v1/secrets", json={"key": "BZ_API_KEY", "value": "nope"})
    assert (await client.get("/api/v1/auth/api-key")).json()["present"] is False


# ── Modes ─────────────────────────────────────────────────────────────────────


async def test_list_modes(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/modes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["default"] == "general"
    ids = {m["id"] for m in body["modes"]}
    assert "general" in ids


async def test_models_empty_without_key(client: httpx.AsyncClient) -> None:
    """No BZ_API_KEY → empty model catalog, no external call."""
    resp = await client.get("/api/v1/models")
    assert resp.status_code == 200
    assert resp.json()["models"] == []


# ── Files ─────────────────────────────────────────────────────────────────────


async def test_files_write_list_read_delete(client: httpx.AsyncClient, settings) -> None:
    cwd = str(settings.bzcode_cwd)
    write = await client.put("/api/v1/files", json={"path": f"{cwd}/note.txt", "content": "hi"})
    assert write.status_code == 200

    listed = await client.get("/api/v1/files", params={"path": cwd})
    assert listed.status_code == 200
    names = {e["name"] for e in listed.json()["entries"]}
    assert "note.txt" in names

    read = await client.get("/api/v1/files/content", params={"path": f"{cwd}/note.txt"})
    assert read.json()["content"] == "hi"

    deleted = await client.delete("/api/v1/files", params={"path": f"{cwd}/note.txt"})
    assert deleted.status_code == 200


async def test_files_mkdir(client: httpx.AsyncClient, settings) -> None:
    cwd = str(settings.bzcode_cwd)
    resp = await client.post("/api/v1/files/mkdir", json={"parent": cwd, "name": "reports"})
    assert resp.status_code == 200
    assert resp.json()["path"].endswith("/reports")


async def test_files_traversal_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/files/content", params={"path": "/etc/passwd"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_path"
