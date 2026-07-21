"""File service — basic workspace file operations.

Backs the ``/api/v1/files`` endpoints: list a directory, read/write/delete a file, and
mkdir. Operates directly on the filesystem (user workspace paths), not through a
storage port. Ports the directory-listing filters from the original ``/files`` handler
(hide dotfiles and document sidecars) and adds path-safety checks.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from workspace_backend.errors import InvalidPath

# Document sidecar suffixes hidden from listings (editor scratch files).
_SIDECAR_SUFFIXES = (
    ".docx.json",
    ".doc.json",
    ".pdf.json",
    ".html.json",
    ".htm.json",
    ".md.json",
    ".markdown.json",
)

# Cap on how many bytes we'll read back as text.
_MAX_READ_BYTES = 50 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class DirEntry:
    """One entry in a directory listing."""

    name: str
    path: str
    is_dir: bool
    size: int
    modified: float


class FileService:
    """Directory listing and file read/write/delete/mkdir for the workspace.

    All client paths are resolved and confined to a single root (the parent of the
    default cwd, matching the relative-rebuild behavior). Anything that escapes the
    root — via ``..``, an absolute path outside it, or a symlink — is rejected with
    :class:`InvalidPath`, so the file API can't reach arbitrary filesystem locations.
    """

    def __init__(self, default_cwd: Path) -> None:
        self._default_cwd = default_cwd
        # Containment root: the parent of the default cwd. Relative paths rebuild
        # against it, and every resolved path must stay within it.
        self._root = default_cwd.parent.resolve()

    def _resolve(self, raw: str) -> Path:
        """Resolve a client path and confirm it stays within the workspace root.

        Relative paths rebuild against the root; absolute paths are taken as-is. The
        result is fully resolved (``..`` and symlinks collapsed) and must be the root
        or a descendant of it, else :class:`InvalidPath` is raised.
        """
        if not raw:
            return self._default_cwd.resolve()
        p = Path(raw)
        if not p.is_absolute():
            p = self._root / p
        resolved = p.resolve()
        if resolved != self._root and self._root not in resolved.parents:
            raise InvalidPath(f"path escapes the workspace root: {raw!r}")
        return resolved

    def list_dir(self, path: str) -> tuple[str, list[DirEntry]]:
        """List a directory, hiding dotfiles and document sidecars."""
        p = self._resolve(path)
        if not p.exists() or not p.is_dir():
            raise InvalidPath(f"path not found or not a directory: {p}")
        entries: list[DirEntry] = []
        for entry in sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            name = entry.name
            if name.startswith("."):
                continue
            lowered = name.lower()
            if lowered.endswith(".json") and any(lowered.endswith(s) for s in _SIDECAR_SUFFIXES):
                continue
            try:
                stat = entry.stat()
            except OSError:
                continue
            entries.append(
                DirEntry(
                    name=name,
                    path=str(entry),
                    is_dir=entry.is_dir(),
                    size=stat.st_size,
                    modified=stat.st_mtime,
                )
            )
        return str(p), entries

    def read_text(self, path: str) -> str:
        """Read a file as UTF-8 text (errors replaced)."""
        p = self._resolve(path)
        if not p.exists() or not p.is_file():
            raise InvalidPath(f"file not found: {p}")
        if p.stat().st_size > _MAX_READ_BYTES:
            raise InvalidPath(f"file too large: {p}")
        return p.read_text(encoding="utf-8", errors="replace")

    def write_text(self, path: str, content: str) -> None:
        """Write UTF-8 text to a file, creating parent dirs."""
        p = self._resolve(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    def delete(self, path: str) -> None:
        """Delete a file or directory (recursive)."""
        p = self._resolve(path)
        if not p.exists():
            raise InvalidPath(f"path not found: {p}")
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()

    def mkdir(self, parent: str, name: str) -> str:
        """Create a directory ``name`` under ``parent``. Returns its path."""
        clean = name.strip()
        if not clean or "/" in clean or "\\" in clean or clean in (".", ".."):
            raise InvalidPath(f"invalid folder name: {name!r}")
        new_dir = self._resolve(parent) / clean
        new_dir.mkdir(parents=True, exist_ok=True)
        return str(new_dir)
