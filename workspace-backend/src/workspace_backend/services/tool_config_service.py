"""Tool config service — configured absolute paths to toolchain executables.

The dev server spawns ``pnpm/yarn/npm run dev`` and needs ``node`` on PATH. When
those binaries live outside the default search locations, the user configures their
absolute paths from the Settings page; this service persists and resolves them.

An unset (or empty) path means "not configured" — callers fall back to their own
PATH-based auto-detection.
"""

from __future__ import annotations

from pathlib import Path

from workspace_backend.domain.ports import ToolPathsStore

# The executables the Settings page exposes. Single source of truth for both the
# store (which keys to persist) and the API (which keys to report).
KNOWN_TOOLS: tuple[str, ...] = ("npm", "pnpm", "node")


class ToolConfigService:
    """Manages configured absolute paths to toolchain executables."""

    def __init__(self, store: ToolPathsStore) -> None:
        self._store = store

    async def get_paths(self) -> dict[str, str]:
        """Return every known tool → configured path (missing tools map to "")."""
        stored = await self._store.get_all()
        return {tool: stored.get(tool, "") for tool in KNOWN_TOOLS}

    async def set_paths(self, paths: dict[str, str]) -> None:
        """Persist paths for known tools only, dropping empty/blank values."""
        cleaned = {
            tool: paths[tool].strip()
            for tool in KNOWN_TOOLS
            if isinstance(paths.get(tool), str) and paths[tool].strip()
        }
        await self._store.set_all(cleaned)

    async def resolve(self, tool: str) -> str | None:
        """Return the configured path for ``tool`` if it points at an existing file.

        Returns ``None`` when the tool is unset or the configured path no longer
        exists, so callers can fall back to PATH-based auto-detection.
        """
        stored = await self._store.get_all()
        value = stored.get(tool, "").strip()
        if value and Path(value).is_file():  # noqa: ASYNC240
            return value
        return None
