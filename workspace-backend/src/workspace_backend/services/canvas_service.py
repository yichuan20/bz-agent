"""Canvas and widget services — copied verbatim from old server.py + app.py.

Covers:
  /canvas               — session .bzcanvas.json read/write
  /canvas/deploy-widget — deploy a new widget to the canvas
  /custom-widgets/…     — per-canvas custom widget JS code
  /widgets/…            — built-in widget registry (index.json + .js files)
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── CanvasService ─────────────────────────────────────────────────────────────


class CanvasService:
    def __init__(self, sessions_dir: Path, server_data_dir: Path) -> None:
        self._sessions_dir = sessions_dir
        self._server_data_dir = server_data_dir
        self._custom_widgets_dir_global = server_data_dir / "custom_widgets"

    def _canvas_file(self, session_id: str, cwd: str) -> Path:
        """Return the .bzcanvas.json path — session dir preferred, cwd as fallback."""
        if session_id:
            return self._sessions_dir / session_id / ".bzcanvas.json"
        return Path(cwd) / ".bzcanvas.json"

    def _custom_widgets_dir(self, session_id: str) -> Path:
        if session_id:
            return self._sessions_dir / session_id / "custom_widgets"
        return self._custom_widgets_dir_global

    # ── /canvas ───────────────────────────────────────────────────────────────

    def get_canvas(self, session_id: str, cwd: str) -> dict[str, Any]:
        f = self._canvas_file(session_id, cwd)
        if not f.exists():  # noqa: ASYNC240
            return {"widgets": []}
        try:
            return json.loads(f.read_text())  # noqa: ASYNC240
        except Exception:
            return {"widgets": []}

    def save_canvas(self, session_id: str, cwd: str, body: Any) -> dict[str, Any]:
        f = self._canvas_file(session_id, cwd)
        f.parent.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
        f.write_text(json.dumps(body, indent=2, ensure_ascii=False))  # noqa: ASYNC240
        return {"ok": True, "file": str(f)}

    # ── /canvas/deploy-widget ────────────────────────────────────────────────

    def deploy_widget(
        self,
        session_id: str,
        cwd: str,
        title: str,
        code: str,
        w: int,
        h: int,
        x: int | None,
        y: int | None,
        initial_data: list[dict[str, Any]],
    ) -> dict[str, Any]:
        import datetime as _dt

        canvas_id = secrets.token_hex(5)
        widget_code_dir = self._custom_widgets_dir(session_id)
        widget_code_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
        (widget_code_dir / f"{canvas_id}.js").write_text(code, encoding="utf-8")  # noqa: ASYNC240

        if initial_data:
            if session_id:
                widget_data_dir = self._sessions_dir / session_id / "widget_data"
            else:
                widget_data_dir = self._server_data_dir / "widget_data"
            widget_data_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
            records, next_id = [], 1
            for row in initial_data:
                row = {k: v for k, v in row.items() if k not in ("id", "created_at")}
                row["id"] = next_id
                row["created_at"] = _dt.datetime.utcnow().isoformat() + "Z"
                records.append(row)
                next_id += 1
            (widget_data_dir / f"{canvas_id}.json").write_text(  # noqa: ASYNC240
                json.dumps({"_next_id": next_id, "records": records}, indent=2),
                encoding="utf-8",
            )

        canvas_file = self._canvas_file(session_id, cwd)
        canvas_data: dict[str, Any] = {"version": 1, "widgets": []}
        if canvas_file.exists():  # noqa: ASYNC240
            try:
                canvas_data = json.loads(canvas_file.read_text(encoding="utf-8"))  # noqa: ASYNC240
            except Exception:
                pass

        existing = canvas_data.get("widgets", [])
        pad = 24
        bx = x if x is not None else pad
        by = (
            y
            if y is not None
            else (pad if not existing else max((e.get("y", 0) + e.get("h", 0)) for e in existing) + pad)
        )
        new_entry: dict[str, Any] = {
            "canvasId": canvas_id,
            "widgetId": canvas_id,
            "kind": "custom",
            "title": title,
            "x": bx,
            "y": by,
            "w": w,
            "h": h,
        }
        existing.append(new_entry)
        canvas_data["widgets"] = existing
        canvas_file.write_text(  # noqa: ASYNC240
            json.dumps(canvas_data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return {
            "ok": True,
            "canvasId": canvas_id,
            "widgetId": canvas_id,
            "title": title,
            "x": bx,
            "y": by,
            "w": w,
            "h": h,
            "canvasFile": str(canvas_file),
        }

    # ── /custom-widgets ──────────────────────────────────────────────────────

    def get_custom_widget(self, canvas_id: str, session_id: str) -> dict[str, Any]:
        p = self._custom_widgets_dir(session_id) / f"{canvas_id}.js"
        if not p.exists() and session_id:  # noqa: ASYNC240
            p = self._custom_widgets_dir_global / f"{canvas_id}.js"
        if not p.exists():  # noqa: ASYNC240
            raise FileNotFoundError(canvas_id)
        return {"canvasId": canvas_id, "code": p.read_text(encoding="utf-8")}  # noqa: ASYNC240

    def set_custom_widget(self, canvas_id: str, session_id: str, code: str) -> dict[str, Any]:
        dest = self._custom_widgets_dir(session_id)
        dest.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
        (dest / f"{canvas_id}.js").write_text(code, encoding="utf-8")  # noqa: ASYNC240
        return {"ok": True, "canvasId": canvas_id}

    def delete_custom_widget(self, canvas_id: str, session_id: str) -> dict[str, Any]:
        for d in [self._custom_widgets_dir(session_id), self._custom_widgets_dir_global]:
            p = d / f"{canvas_id}.js"
            if p.exists():  # noqa: ASYNC240
                p.unlink()  # noqa: ASYNC240
        return {"ok": True}
