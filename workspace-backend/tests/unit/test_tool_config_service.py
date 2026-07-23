"""Unit tests for ToolConfigService.

Covers round-trip persistence, filtering of unknown/blank tools, and ``resolve``
returning a path only when the configured binary actually exists on disk.
"""

from __future__ import annotations

from pathlib import Path

from workspace_backend.infra.storage.filesystem.paths import Paths
from workspace_backend.infra.storage.filesystem.tool_paths import FsToolPathsStore
from workspace_backend.services.tool_config_service import KNOWN_TOOLS, ToolConfigService


def _make_service(tmp_path: Path) -> ToolConfigService:
    paths = Paths(bz_home=tmp_path, server_data=tmp_path / "server_data")
    return ToolConfigService(FsToolPathsStore(paths))


async def test_get_paths_defaults_to_empty_for_known_tools(tmp_path: Path) -> None:
    svc = _make_service(tmp_path)
    paths = await svc.get_paths()
    assert set(paths) == set(KNOWN_TOOLS)
    assert all(v == "" for v in paths.values())


async def test_set_and_get_round_trip(tmp_path: Path) -> None:
    svc = _make_service(tmp_path)
    await svc.set_paths({"pnpm": "/opt/pnpm", "node": "/opt/node"})
    paths = await svc.get_paths()
    assert paths["pnpm"] == "/opt/pnpm"
    assert paths["node"] == "/opt/node"
    assert paths["npm"] == ""


async def test_set_filters_unknown_and_blank(tmp_path: Path) -> None:
    svc = _make_service(tmp_path)
    await svc.set_paths({"pnpm": "  /opt/pnpm  ", "bogus": "/x", "npm": "   "})
    paths = await svc.get_paths()
    assert paths["pnpm"] == "/opt/pnpm"  # trimmed
    assert paths["npm"] == ""  # blank dropped
    assert "bogus" not in paths  # unknown never surfaced


async def test_resolve_none_when_unset(tmp_path: Path) -> None:
    svc = _make_service(tmp_path)
    assert await svc.resolve("pnpm") is None


async def test_resolve_none_when_path_missing(tmp_path: Path) -> None:
    svc = _make_service(tmp_path)
    await svc.set_paths({"pnpm": str(tmp_path / "does-not-exist")})
    assert await svc.resolve("pnpm") is None


async def test_resolve_returns_path_when_file_exists(tmp_path: Path) -> None:
    svc = _make_service(tmp_path)
    binary = tmp_path / "pnpm"
    binary.write_text("#!/bin/sh\n")
    await svc.set_paths({"pnpm": str(binary)})
    assert await svc.resolve("pnpm") == str(binary)
