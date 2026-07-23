"""Shared pytest fixtures.

Provides tmp-dir Settings and ASGI-bound clients. ``client`` uses the real
``data_root`` (repo agent_modes.json + assets) but can't spawn bzcode; ``agent_client``
wires a fake bzcode stub + a minimal tmp ``data_root`` for full agent-flow e2e tests.
"""

from __future__ import annotations

import asyncio
import json
import os
import stat
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from workspace_backend.app import create_app
from workspace_backend.config import Settings

_FAKE_BZCODE = Path(__file__).parent / "fakes" / "fake_bzcode.py"


@pytest.fixture
def bz_home(tmp_path: Path) -> Path:
    """A writable, isolated BZ_HOME for a test."""
    home = tmp_path / "boltzbit"
    home.mkdir(parents=True, exist_ok=True)
    return home


@pytest.fixture
def settings(tmp_path: Path, bz_home: Path) -> Settings:
    """Settings pointed at tmp dirs so tests never touch the real filesystem.

    Uses a minimal tmp ``data_root`` so the secret store, mode config, etc. are
    isolated (no writes to the repo's real server_data/agent_modes.json).
    """
    cwd = tmp_path / "workspace"
    cwd.mkdir(parents=True, exist_ok=True)
    data_root = _make_data_root(tmp_path)
    return Settings(
        BZCODE_CWD=str(cwd),
        BZ_HOME=str(bz_home),
        BZCODE_PATH="bzcode",
        BZ_DATA_ROOT=str(data_root),
    )


@pytest_asyncio.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    """An ASGI-bound async client with the app's lifespan run."""
    app = create_app(settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Run startup/shutdown so app.state.ctx is assembled.
        async with app.router.lifespan_context(app):
            yield ac


def _make_fake_bzcode(tmp_path: Path) -> Path:
    """Write a small executable wrapper that runs the fake bzcode stub."""
    wrapper = tmp_path / "bzcode"
    wrapper.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{_FAKE_BZCODE}" "$@"\n')
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return wrapper


def _make_data_root(tmp_path: Path) -> Path:
    """A minimal data_root with an agent_modes.json and empty bzcode_assets."""
    data_root = tmp_path / "data"
    (data_root / "bzcode_assets" / "scripts").mkdir(parents=True)
    (data_root / "bzcode_assets" / "templates").mkdir(parents=True)
    (data_root / "server_data").mkdir(parents=True)
    modes = {
        "default": "general",
        "modes": {
            "general": {
                "label": "General",
                "icon": "chat",
                "description": "Q&A and file tasks",
                "identity": "You are General.",
                "soul": "Be helpful.",
                "settings": {"mode": "yolo"},
            },
            "coder": {"label": "Coder", "identity": "You are Coder.", "settings": {"mode": "yolo"}},
        },
    }
    (data_root / "agent_modes.json").write_text(json.dumps(modes))
    return data_root


@pytest.fixture
def agent_settings(tmp_path: Path, bz_home: Path) -> Settings:
    """Settings wired to a fake bzcode stub + minimal tmp data_root."""
    cwd = tmp_path / "workspace"
    cwd.mkdir(parents=True, exist_ok=True)
    fake = _make_fake_bzcode(tmp_path)
    data_root = _make_data_root(tmp_path)
    return Settings(
        BZCODE_CWD=str(cwd),
        BZ_HOME=str(bz_home),
        BZCODE_PATH=str(fake),
        BZ_DATA_ROOT=str(data_root),
    )


@pytest_asyncio.fixture
async def agent_client(agent_settings: Settings) -> AsyncIterator[AsyncClient]:
    """An ASGI client whose app can actually spawn (fake) bzcode agents.

    A BZ_API_KEY is pre-seeded so connect passes the auth gate. Note: ASGITransport
    buffers responses, so this client cannot consume SSE streams — use ``live_server``
    for streaming tests.
    """
    Path(agent_settings.bz_home).mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    (Path(agent_settings.bz_home) / "api_keys.json").write_text(  # noqa: ASYNC240
        json.dumps({"BZ_API_KEY": "bz_test"})
    )
    app = create_app(agent_settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            yield ac


def _free_port() -> int:
    import socket

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]  # type: ignore[no-any-return]


@pytest_asyncio.fixture
async def live_server(agent_settings: Settings) -> AsyncIterator[str]:
    """A real uvicorn server on a socket (fake bzcode), for SSE streaming tests.

    ASGITransport buffers responses and can't stream, so SSE must be tested over a
    real socket. Yields the base URL. A BZ_API_KEY is pre-seeded.
    """
    import subprocess

    Path(agent_settings.bz_home).mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    (Path(agent_settings.bz_home) / "api_keys.json").write_text(json.dumps({"BZ_API_KEY": "bz_test"}))

    port = _free_port()
    env = {
        **os.environ,
        "BZ_HOME": str(agent_settings.bz_home),
        "BZCODE_CWD": str(agent_settings.bzcode_cwd),
        "BZCODE_PATH": agent_settings.bzcode_path,
        "BZ_DATA_ROOT": str(agent_settings.data_root),
    }
    proc = subprocess.Popen(  # noqa: ASYNC220
        [sys.executable, "-m", "uvicorn", "workspace_backend.app:app", "--port", str(port), "--log-level", "warning"],
        env=env,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        # Wait for the server to accept requests.
        async with AsyncClient(base_url=base) as ac:
            for _ in range(100):
                try:
                    if (await ac.get("/healthz", timeout=0.5)).status_code == 200:
                        break
                except httpx.HTTPError:
                    await asyncio.sleep(0.1)
            else:
                raise RuntimeError("live server did not start")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
