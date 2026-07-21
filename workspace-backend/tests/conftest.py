"""Shared pytest fixtures.

Phase 1 provides a tmp ``BZ_HOME`` and an ``httpx.AsyncClient`` bound to the app via
ASGI transport (no network). Later phases add a fake bzcode stub and in-memory stores.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from workspace_backend.app import create_app
from workspace_backend.config import Settings


@pytest.fixture
def bz_home(tmp_path: Path) -> Path:
    """A writable, isolated BZ_HOME for a test."""
    home = tmp_path / "boltzbit"
    home.mkdir(parents=True, exist_ok=True)
    return home


@pytest.fixture
def settings(tmp_path: Path, bz_home: Path) -> Settings:
    """Settings pointed at tmp dirs so tests never touch the real filesystem."""
    cwd = tmp_path / "workspace"
    cwd.mkdir(parents=True, exist_ok=True)
    return Settings(BZCODE_CWD=str(cwd), BZ_HOME=str(bz_home), BZCODE_PATH="bzcode")


@pytest_asyncio.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    """An ASGI-bound async client with the app's lifespan run."""
    app = create_app(settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Run startup/shutdown so app.state.ctx is assembled.
        async with app.router.lifespan_context(app):
            yield ac
