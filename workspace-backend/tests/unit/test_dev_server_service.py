"""Unit tests for DevServerService readiness helpers.

``_is_listening`` backs the ``/status`` endpoint the frontend polls before loading the
preview iframe (so the first request never hits an unbound port → 502). Tested against a
real socket rather than a spawned dev server.
"""

from __future__ import annotations

import socket

import pytest

from workspace_backend.services import dev_server_service
from workspace_backend.services.dev_server_service import (
    DevServerService,
    _dev_servers,
    _is_listening,
)


async def test_is_listening_true_when_port_open() -> None:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen()
    port = sock.getsockname()[1]
    try:
        assert await _is_listening(port) is True
    finally:
        sock.close()


async def test_is_listening_false_when_nothing_bound() -> None:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        dead_port = s.getsockname()[1]  # closed on exit → nothing listening
    assert await _is_listening(dead_port) is False


class _FakeProc:
    def __init__(self, returncode: int | None = None) -> None:
        self.returncode = returncode
        self.pid = 12345


async def test_status_not_running() -> None:
    svc = DevServerService()
    s = await svc.status("/no/such/cwd", "/no/such/cwd")
    assert s == {"running": False, "listening": False, "port": None}


async def test_status_running_and_listening() -> None:
    """A tracked, live process whose port is open reports running + listening."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen()
    port = sock.getsockname()[1]
    cwd = "/tmp/dev-status-test"
    _dev_servers[cwd] = {"proc": _FakeProc(), "port": port}
    try:
        s = await DevServerService().status(cwd, "")
        assert s == {"running": True, "listening": True, "port": port}
    finally:
        _dev_servers.pop(cwd, None)
        sock.close()


async def test_status_running_not_yet_listening() -> None:
    """A tracked, live process whose port is not yet bound reports listening=False."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        unbound_port = s.getsockname()[1]
    cwd = "/tmp/dev-status-test-2"
    _dev_servers[cwd] = {"proc": _FakeProc(), "port": unbound_port}
    try:
        result = await DevServerService().status(cwd, "")
        assert result == {"running": True, "listening": False, "port": unbound_port}
    finally:
        _dev_servers.pop(cwd, None)


class _SpawnRecorder:
    """Stand-in for ``asyncio.create_subprocess_exec`` that records its call."""

    def __init__(self) -> None:
        self.cmd: tuple[str, ...] = ()
        self.env: dict[str, str] = {}

    async def __call__(self, *cmd: str, **kwargs: object) -> _FakeProc:
        self.cmd = cmd
        self.env = dict(kwargs.get("env") or {})
        return _FakeProc(returncode=None)


@pytest.fixture
def _patched_spawn(tmp_path, monkeypatch):
    """Make ``start`` deterministic: instant port, no crash guard, recorded spawn."""
    (tmp_path / "pnpm-lock.yaml").write_text("")  # → pnpm package manager

    recorder = _SpawnRecorder()
    monkeypatch.setattr(dev_server_service.asyncio, "create_subprocess_exec", recorder)
    monkeypatch.setattr(dev_server_service, "_find_free_port", lambda: _immediate(4321))
    monkeypatch.setattr(dev_server_service, "_CRASH_GUARD", 0)
    # Avoid tailing the fake process' (absent) stdout.
    monkeypatch.setattr(dev_server_service.asyncio, "create_task", lambda coro: coro.close())
    yield recorder, tmp_path
    _dev_servers.pop(str(tmp_path), None)


async def _immediate(value: int) -> int:
    return value


async def test_start_uses_configured_pnpm_path(_patched_spawn, tmp_path) -> None:
    recorder, cwd = _patched_spawn
    fake_pnpm = tmp_path / "bin" / "pnpm"
    fake_pnpm.parent.mkdir()
    fake_pnpm.write_text("#!/bin/sh\n")

    async def resolver(tool: str) -> str | None:
        return str(fake_pnpm) if tool == "pnpm" else None

    svc = DevServerService(tool_path_resolver=resolver)
    await svc.start(str(cwd), str(cwd))

    assert recorder.cmd[0] == str(fake_pnpm)


async def test_start_prepends_configured_node_dir_to_path(_patched_spawn, tmp_path) -> None:
    recorder, cwd = _patched_spawn
    fake_node = tmp_path / "node-home" / "node"
    fake_node.parent.mkdir()
    fake_node.write_text("#!/bin/sh\n")

    async def resolver(tool: str) -> str | None:
        return str(fake_node) if tool == "node" else None

    svc = DevServerService(tool_path_resolver=resolver)
    await svc.start(str(cwd), str(cwd))

    assert recorder.env["PATH"].split(":")[0] == str(fake_node.parent)
