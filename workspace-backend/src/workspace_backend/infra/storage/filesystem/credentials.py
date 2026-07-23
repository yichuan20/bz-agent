"""Filesystem ApiKeyStore + SecretStore.

- ``FsApiKeyStore`` reads/writes ``BZ_API_KEY`` in ``$BZ_HOME/api_keys.json`` — the
  login credential passed to bzcode. Only ``BZ_API_KEY`` is stored (mirrors the
  original server: no other keys are handed to spawns).
- ``FsSecretStore`` manages widget secret placeholders in
  ``server_data/credentials.json`` — substituted into widget code, never used to
  authenticate bzcode.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from workspace_backend.infra.storage.filesystem.paths import Paths

_API_KEY = "BZ_API_KEY"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


class FsApiKeyStore:
    """ApiKeyStore over ``$BZ_HOME/api_keys.json`` (only ``BZ_API_KEY``)."""

    def __init__(self, paths: Paths) -> None:
        self._paths = paths

    async def get_api_key(self) -> str | None:
        value = _read_json(self._paths.api_keys_file).get(_API_KEY, "")
        return value if value and isinstance(value, str) else None

    async def set_api_key(self, value: str) -> None:
        # Overwrite the whole file; only BZ_API_KEY is stored.
        _write_json(self._paths.api_keys_file, {_API_KEY: value})

    async def delete_api_key(self) -> bool:
        data = _read_json(self._paths.api_keys_file)
        if data.pop(_API_KEY, None) is None:
            return False
        _write_json(self._paths.api_keys_file, data)
        return True


class FsSecretStore:
    """SecretStore over ``server_data/credentials.json`` (widget placeholders)."""

    def __init__(self, paths: Paths) -> None:
        self._paths = paths

    async def list_keys(self) -> list[str]:
        return list(_read_json(self._paths.secrets_file).keys())

    async def get_secret(self, key: str) -> str | None:
        return _read_json(self._paths.secrets_file).get(key)

    async def set_secret(self, key: str, value: str) -> None:
        data = _read_json(self._paths.secrets_file)
        data[key] = value
        _write_json(self._paths.secrets_file, data)

    async def delete_secret(self, key: str) -> bool:
        data = _read_json(self._paths.secrets_file)
        if data.pop(key, None) is None:
            return False
        _write_json(self._paths.secrets_file, data)
        return True
