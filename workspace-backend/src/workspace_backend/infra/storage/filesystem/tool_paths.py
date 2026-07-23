"""Filesystem ToolPathsStore.

``FsToolPathsStore`` stores configured absolute paths to toolchain executables
(npm/pnpm/node) in ``$BZ_HOME/tool_paths.json`` — used by the dev server to
locate the package manager and node when they live outside the default PATH.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from workspace_backend.infra.storage.filesystem.paths import Paths


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


class FsToolPathsStore:
    """ToolPathsStore over ``$BZ_HOME/tool_paths.json`` (tool → binary path)."""

    def __init__(self, paths: Paths) -> None:
        self._paths = paths

    async def get_all(self) -> dict[str, str]:
        data = _read_json(self._paths.tool_paths_file)
        return {k: v for k, v in data.items() if isinstance(v, str)}

    async def set_all(self, paths: dict[str, str]) -> None:
        # Overwrite the whole file with the provided mapping.
        _write_json(self._paths.tool_paths_file, paths)
