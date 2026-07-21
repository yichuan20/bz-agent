"""Tests for FileService (listing filters, read/write/delete/mkdir, path safety)."""

from __future__ import annotations

from pathlib import Path

import pytest

from workspace_backend.errors import InvalidPath
from workspace_backend.services.file_service import FileService


def _service(tmp_path: Path) -> tuple[FileService, Path]:
    cwd = tmp_path / "workspace"
    cwd.mkdir()
    return FileService(cwd), cwd


def test_list_hides_dotfiles_and_sidecars(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    (cwd / "report.docx").write_text("x")
    (cwd / "report.docx.json").write_text("{}")  # sidecar → hidden
    (cwd / ".secret").write_text("x")  # dotfile → hidden
    (cwd / "notes.md").write_text("x")
    (cwd / "sub").mkdir()
    _path, entries = svc.list_dir(str(cwd))
    names = {e.name for e in entries}
    assert names == {"report.docx", "notes.md", "sub"}
    assert any(e.is_dir and e.name == "sub" for e in entries)


def test_list_missing_dir_raises(tmp_path: Path) -> None:
    svc, _ = _service(tmp_path)
    with pytest.raises(InvalidPath):
        svc.list_dir(str(tmp_path / "nope"))


def test_write_read_roundtrip(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    svc.write_text(str(cwd / "a" / "b.txt"), "hello")  # creates parents
    assert svc.read_text(str(cwd / "a" / "b.txt")) == "hello"


def test_read_missing_raises(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    with pytest.raises(InvalidPath):
        svc.read_text(str(cwd / "missing.txt"))


def test_delete_file_and_dir(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    f = cwd / "f.txt"
    f.write_text("x")
    svc.delete(str(f))
    assert not f.exists()
    d = cwd / "d"
    (d / "nested").mkdir(parents=True)
    svc.delete(str(d))
    assert not d.exists()


def test_mkdir_rejects_bad_names(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    for bad in ("..", ".", "a/b", "a\\b"):
        with pytest.raises(InvalidPath):
            svc.mkdir(str(cwd), bad)


def test_mkdir_creates(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    result = svc.mkdir(str(cwd), "newdir")
    assert Path(result).is_dir()


def test_relative_path_resolves_against_default_parent(tmp_path: Path) -> None:
    svc, cwd = _service(tmp_path)
    sibling = tmp_path / "proj"
    sibling.mkdir()
    (sibling / "x.txt").write_text("hi")
    # "proj/x.txt" is relative → rebuilt against parent of the default cwd.
    assert svc.read_text("proj/x.txt") == "hi"


def test_relative_traversal_escaping_root_rejected(tmp_path: Path) -> None:
    """A ../.. path that climbs above the root is rejected."""
    svc, _ = _service(tmp_path)
    # root is tmp_path; ../../etc escapes it.
    with pytest.raises(InvalidPath):
        svc.read_text("../../etc/passwd")


def test_absolute_path_outside_root_rejected(tmp_path: Path) -> None:
    """An absolute path outside the workspace root is rejected."""
    svc, _ = _service(tmp_path)
    with pytest.raises(InvalidPath):
        svc.read_text("/etc/passwd")


def test_absolute_path_inside_root_allowed(tmp_path: Path) -> None:
    """An absolute path within the root is fine."""
    svc, cwd = _service(tmp_path)
    (cwd / "ok.txt").write_text("yes")
    assert svc.read_text(str(cwd / "ok.txt")) == "yes"


def test_symlink_escaping_root_rejected(tmp_path: Path) -> None:
    """A symlink pointing outside the root cannot be used to escape."""
    svc, cwd = _service(tmp_path)
    outside = tmp_path.parent / "outside_secret.txt"
    outside.write_text("secret")
    link = cwd / "link.txt"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("symlinks not supported on this platform")
    with pytest.raises(InvalidPath):
        svc.read_text(str(link))


def test_write_cannot_escape_root(tmp_path: Path) -> None:
    svc, _ = _service(tmp_path)
    with pytest.raises(InvalidPath):
        svc.write_text("../../evil.txt", "pwned")


def test_mkdir_cannot_escape_root(tmp_path: Path) -> None:
    svc, _ = _service(tmp_path)
    with pytest.raises(InvalidPath):
        svc.mkdir("../..", "evil")
