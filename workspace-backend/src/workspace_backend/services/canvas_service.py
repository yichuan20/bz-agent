"""Canvas service — per-session widget canvas state and custom widget code.

The canvas state (``.bzcanvas.json``) is stored session-first: if a session dir
exists we use ``<sessions_dir>/<session_id>/.bzcanvas.json``; otherwise we fall back
to ``<cwd>/.bzcanvas.json``.  Custom widget code lives alongside: per-session in
``<sessions_dir>/<session_id>/custom_widgets/<canvas_id>.js``, with a global
fallback at ``<server_data>/custom_widgets/<canvas_id>.js``.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path


class CanvasService:
    def __init__(self, sessions_dir: Path, server_data: Path) -> None:
        self._sessions = sessions_dir
        self._global_cw = server_data / "custom_widgets"

    # ── canvas file resolution ─────────────────────────────────────────────────

    def _canvas_file(self, session_id: str, cwd: str) -> Path:
        sid_dir = self._sessions / session_id
        if sid_dir.is_dir():
            return sid_dir / ".bzcanvas.json"
        return Path(cwd) / ".bzcanvas.json"

    def _session_cw_dir(self, session_id: str) -> Path:
        return self._sessions / session_id / "custom_widgets"

    # ── canvas CRUD ────────────────────────────────────────────────────────────

    async def get_canvas(self, session_id: str, cwd: str) -> dict:
        """Return the stored canvas JSON, or an empty default."""
        path = self._canvas_file(session_id, cwd)

        def _read() -> dict:
            if not path.exists():
                return {"widgets": []}
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except OSError, json.JSONDecodeError:
                return {"widgets": []}

        return await asyncio.to_thread(_read)

    async def save_canvas(self, session_id: str, cwd: str, state: dict) -> str:
        """Persist the canvas state and return the file path."""
        path = self._canvas_file(session_id, cwd)

        def _write() -> str:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
            return str(path)

        return await asyncio.to_thread(_write)

    # ── custom widget code ─────────────────────────────────────────────────────

    def _cw_path(self, session_id: str, canvas_id: str) -> tuple[Path, Path]:
        """Return (session_path, global_path) for a custom widget's JS file."""
        sess = self._session_cw_dir(session_id) / f"{canvas_id}.js"
        glob = self._global_cw / f"{canvas_id}.js"
        return sess, glob

    async def get_custom_widget(self, session_id: str, canvas_id: str) -> str | None:
        sess, glob = self._cw_path(session_id, canvas_id)

        def _read() -> str | None:
            if sess.exists():
                return sess.read_text(encoding="utf-8")
            if glob.exists():
                return glob.read_text(encoding="utf-8")
            return None

        return await asyncio.to_thread(_read)

    async def save_custom_widget(self, session_id: str, canvas_id: str, code: str) -> None:
        sess, _ = self._cw_path(session_id, canvas_id)

        def _write() -> None:
            sess.parent.mkdir(parents=True, exist_ok=True)
            sess.write_text(code, encoding="utf-8")

        await asyncio.to_thread(_write)

    async def delete_custom_widget(self, session_id: str, canvas_id: str) -> None:
        sess, glob = self._cw_path(session_id, canvas_id)

        def _delete() -> None:
            if sess.exists():
                sess.unlink()
            if glob.exists():
                glob.unlink()

        await asyncio.to_thread(_delete)
