"""Tests for the health and version endpoints."""

from __future__ import annotations

from httpx import AsyncClient


async def test_healthz(client: AsyncClient) -> None:
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_version(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/version")
    assert resp.status_code == 200
    assert resp.json()["backend"] == "0.1.0"


async def test_openapi_routes_documented(client: AsyncClient) -> None:
    """Every route carries a summary + description so the schema is self-documenting."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            assert op.get("summary"), f"{method.upper()} {path} missing summary"
            assert op.get("description"), f"{method.upper()} {path} missing description"
