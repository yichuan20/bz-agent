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
        self.signals: list[int] = []

    def send_signal(self, sig: int) -> None:
        self.signals.append(sig)
        self.returncode = -sig

    async def wait(self) -> int:
        return self.returncode if self.returncode is not None else 0


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
        self.kwargs: dict[str, object] = {}

    async def __call__(self, *cmd: str, **kwargs: object) -> _FakeProc:
        self.cmd = cmd
        self.env = dict(kwargs.get("env") or {})
        self.kwargs = kwargs
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


async def test_start_sets_resource_cap_env(_patched_spawn, tmp_path, monkeypatch) -> None:
    """Small-host resource caps are injected when unset in the environment."""
    monkeypatch.delenv("NODE_OPTIONS", raising=False)
    monkeypatch.delenv("RAYON_NUM_THREADS", raising=False)
    recorder, cwd = _patched_spawn

    await DevServerService().start(str(cwd), str(cwd))

    assert "--max-old-space-size" in recorder.env["NODE_OPTIONS"]
    assert recorder.env["RAYON_NUM_THREADS"] == "2"


async def test_start_spawns_in_new_session(_patched_spawn, tmp_path) -> None:
    """The tree is spawned in its own session so stop() can kill the whole group."""
    recorder, cwd = _patched_spawn
    await DevServerService().start(str(cwd), str(cwd))
    assert recorder.kwargs.get("start_new_session") is True


async def test_stop_kills_process_tree(monkeypatch) -> None:
    """stop() signals the process (group) and removes the entry from the registry."""
    killed: dict[str, int] = {}

    def _fake_killpg(pgid: int, sig: int) -> None:
        killed["pgid"] = pgid
        killed["sig"] = sig

    monkeypatch.setattr(dev_server_service.os, "getpgid", lambda pid: pid)
    monkeypatch.setattr(dev_server_service.os, "killpg", _fake_killpg)

    cwd = "/tmp/stop-tree-test"
    proc = _FakeProc(returncode=None)

    # Make the graceful wait resolve immediately by marking the proc exited on signal.
    def _terminate(pgid: int, sig: int) -> None:
        _fake_killpg(pgid, sig)
        proc.returncode = -sig

    monkeypatch.setattr(dev_server_service.os, "killpg", _terminate)

    _dev_servers[cwd] = {"proc": proc, "port": 5000}
    try:
        await DevServerService().stop(cwd)
        assert cwd not in _dev_servers  # entry removed
        assert killed["pgid"] == proc.pid  # signalled the group
    finally:
        _dev_servers.pop(cwd, None)


async def test_start_stops_other_running_servers(_patched_spawn, tmp_path, monkeypatch) -> None:
    """Only one dev server runs at a time — starting a new one stops the others."""
    # Force the process-group signal to miss so the kill routes to the fake proc's
    # send_signal instead of touching a real process group for the fake pid.
    def _no_group(_pid: int) -> int:
        raise ProcessLookupError

    monkeypatch.setattr(dev_server_service.os, "getpgid", _no_group)

    recorder, cwd = _patched_spawn
    other = "/tmp/other-dev-server"
    _dev_servers[other] = {"proc": _FakeProc(returncode=None), "port": 9999}
    try:
        await DevServerService().start(str(cwd), str(cwd))
        assert other not in _dev_servers  # the other server was stopped
        assert str(cwd) in _dev_servers  # the new one is tracked
    finally:
        _dev_servers.pop(other, None)


async def test_reap_dead_drops_exited_entries() -> None:
    """_reap_dead forgets servers whose process already exited."""
    alive = "/tmp/alive-dev"
    dead = "/tmp/dead-dev"
    _dev_servers[alive] = {"proc": _FakeProc(returncode=None), "port": 1}
    _dev_servers[dead] = {"proc": _FakeProc(returncode=1), "port": 2}
    try:
        await DevServerService()._reap_dead()
        assert alive in _dev_servers
        assert dead not in _dev_servers
    finally:
        _dev_servers.pop(alive, None)
        _dev_servers.pop(dead, None)
