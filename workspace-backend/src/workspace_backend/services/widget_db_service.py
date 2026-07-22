"""Widget DB service — per-widget JSON row-store.

Logic copied verbatim from old server.py (_widget_lock, _widget_path, _widget_load,
_widget_save) and app.py (db_router widget routes).

Each widget's data lives in:
  ``<sessions_dir>/<session_id>/widget_data/<canvas_id>.json`` (session-scoped), or
  ``<server_data_dir>/widget_data/<canvas_id>.json``           (global fallback).

Rows are plain dicts with an auto-incremented integer ``id``.
Per-canvas threading.Lock serialises writes (same as old code).
"""

from __future__ import annotations

import datetime
import json
import re
import threading
from pathlib import Path
from typing import Any

# Copied from server.py
_CANVAS_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{3,63}$")

_widget_locks: dict[str, threading.Lock] = {}
_widget_locks_meta = threading.Lock()


def _widget_lock(canvas_id: str) -> threading.Lock:
    with _widget_locks_meta:
        if canvas_id not in _widget_locks:
            _widget_locks[canvas_id] = threading.Lock()
        return _widget_locks[canvas_id]


class WidgetDbService:
    def __init__(self, server_data_dir: Path, sessions_dir: Path | None = None) -> None:
        self._server_data_dir = server_data_dir
        self._sessions_dir = sessions_dir
        self._widget_data_dir = server_data_dir / "widget_data"

    def _validate(self, canvas_id: str) -> None:
        if not _CANVAS_ID_RE.match(canvas_id):
            raise ValueError(f"Invalid canvasId: {canvas_id!r}")

    def _widget_path(self, canvas_id: str, session_id: str = "") -> Path:
        """Session-scoped path preferred; global fallback. Copied from server.py."""
        if session_id and self._sessions_dir:
            session_dir = self._sessions_dir / session_id / "widget_data"
            p = session_dir / f"{canvas_id}.json"
            if p.exists() or not (self._widget_data_dir / f"{canvas_id}.json").exists():  # noqa: ASYNC240
                session_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
                return p
        self._widget_data_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
        return self._widget_data_dir / f"{canvas_id}.json"

    def _load(self, canvas_id: str, session_id: str = "") -> dict[str, Any]:
        p = self._widget_path(canvas_id, session_id)
        if not p.exists():  # noqa: ASYNC240
            return {"_next_id": 1, "records": []}
        with open(p) as f:
            return json.load(f)

    def _save(self, canvas_id: str, data: dict[str, Any], session_id: str = "") -> None:
        p = self._widget_path(canvas_id, session_id)
        with open(p, "w") as f:
            json.dump(data, f, indent=2, default=str)

    # ── /db/widget/{id}/schema ────────────────────────────────────────────────

    def get_schema(self, canvas_id: str, session_id: str = "") -> dict[str, Any]:
        self._validate(canvas_id)
        data = self._load(canvas_id, session_id)
        return {"columns": data.get("_schema", []), "rowCount": len(data.get("records", []))}

    def ensure_schema(self, canvas_id: str, columns: list[dict[str, Any]], session_id: str = "") -> dict[str, Any]:
        self._validate(canvas_id)
        with _widget_lock(canvas_id):
            data = self._load(canvas_id, session_id)
            existing = {c["name"]: c for c in data.get("_schema", []) if "name" in c}
            for col in columns:
                if "name" in col and col["name"] not in existing:
                    existing[col["name"]] = col
            data["_schema"] = list(existing.values())
            self._save(canvas_id, data, session_id)
        return {"columns": data["_schema"], "rowCount": len(data.get("records", []))}

    # ── /db/widget/{id}/rows ──────────────────────────────────────────────────

    def query_rows(
        self,
        canvas_id: str,
        order: str = "id",
        direction: str = "asc",
        limit: int = 1000,
        offset: int = 0,
        session_id: str = "",
    ) -> dict[str, Any]:
        self._validate(canvas_id)
        data = self._load(canvas_id, session_id)
        records = data["records"]
        desc = direction.upper() == "DESC"
        records = sorted(records, key=lambda r: r.get(order, 0), reverse=desc)
        page = records[offset : offset + min(limit, 10000)]
        return {"rows": page, "total": len(records), "limit": limit, "offset": offset}

    def insert_rows(
        self, canvas_id: str, row: dict[str, Any] | None, rows: list[dict[str, Any]] | None, session_id: str = ""
    ) -> dict[str, Any]:
        self._validate(canvas_id)
        all_rows = rows or ([row] if row else [])
        if not all_rows:
            raise ValueError("Provide 'row' or 'rows'")
        with _widget_lock(canvas_id):
            data = self._load(canvas_id, session_id)
            inserted = []
            for r in all_rows:
                r = {k: v for k, v in r.items() if k not in ("id", "created_at")}
                r["id"] = data["_next_id"]
                r["created_at"] = datetime.datetime.utcnow().isoformat() + "Z"
                data["_next_id"] += 1
                data["records"].append(r)
                inserted.append(r)
            self._save(canvas_id, data, session_id)
        return {"inserted": inserted}

    def update_row(self, canvas_id: str, row_id: int, patch: dict[str, Any], session_id: str = "") -> dict[str, Any]:
        self._validate(canvas_id)
        clean = {k: v for k, v in patch.items() if k not in ("id", "created_at")}
        if not clean:
            raise ValueError("'data' required")
        with _widget_lock(canvas_id):
            data = self._load(canvas_id, session_id)
            for r in data["records"]:
                if r.get("id") == row_id:
                    r.update(clean)
                    self._save(canvas_id, data, session_id)
                    return {"updated": r}
        raise KeyError(f"Row {row_id} not found")

    def delete_row(self, canvas_id: str, row_id: int, session_id: str = "") -> dict[str, Any]:
        self._validate(canvas_id)
        with _widget_lock(canvas_id):
            data = self._load(canvas_id, session_id)
            before = len(data["records"])
            data["records"] = [r for r in data["records"] if r.get("id") != row_id]
            if len(data["records"]) == before:
                raise KeyError(f"Row {row_id} not found")
            self._save(canvas_id, data, session_id)
        return {"deleted": row_id}

    def exec_code(self, canvas_id: str, code: str, session_id: str = "") -> dict[str, Any]:
        self._validate(canvas_id)
        data = self._load(canvas_id, session_id)
        ns: dict[str, Any] = {"records": data["records"], "result": None}
        try:
            exec(compile(code, "<widget-exec>", "exec"), ns)  # nosec
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc
        return {"result": ns.get("result")}
