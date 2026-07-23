"""Filesystem ModeConfigStore.

Reads ``agent_modes.json`` (the 24 agent-mode/persona definitions). Re-read on every
call so edits take effect without a restart, mirroring the original server.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from workspace_backend.logging import get_logger

log = get_logger(__name__)

_FALLBACK: dict[str, Any] = {"default": "general", "modes": {}}


class FsModeConfigStore:
    """ModeConfigStore over a single ``agent_modes.json`` file."""

    def __init__(self, config_file: Path) -> None:
        self._config_file = config_file

    async def load(self) -> dict[str, Any]:
        try:
            data = json.loads(self._config_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("[modes] could not read %s: %s", self._config_file, exc)
            return dict(_FALLBACK)
        return data if isinstance(data, dict) else dict(_FALLBACK)
