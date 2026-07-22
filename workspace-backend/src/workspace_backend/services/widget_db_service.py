"""Widget DB service — a per-widget JSON row-store.

Each widget's data lives in ``<data_root>/widget_data/<canvas_id>.json``.  Rows are
plain dicts with an auto-incremented integer ``id``.  An asyncio.Lock per canvas
serialises writes so concurrent requests don't corrupt the file.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any


class WidgetDbService:
    def __init__(self, data_root: Path) -> None:
        self._dir = data_root / "widget_data"
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, canvas_id: str) -> asyncio.Lock:
        if canvas_id not in self._locks:
            self._locks[canvas_id] = asyncio.Lock()
        return self._locks[canvas_id]

    def _db_path(self, canvas_id: str) -> Path:
        return self._dir / f"{canvas_id}.json"

    def _read(self, canvas_id: str) -> dict[str, Any]:
        path = self._db_path(canvas_id)
        if not path.exists():
            return {"columns": [], "rows": []}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except OSError, json.JSONDecodeError:
            return {"columns": [], "rows": []}

    def _write(self, canvas_id: str, data: dict[str, Any]) -> None:
        path = self._db_path(canvas_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── schema ─────────────────────────────────────────────────────────────────

    async def get_schema(self, canvas_id: str) -> dict[str, Any]:
        async with self._lock(canvas_id):
            data = await asyncio.to_thread(self._read, canvas_id)
            return {"columns": data.get("columns", []), "rowCount": len(data.get("rows", []))}

    async def set_schema(self, canvas_id: str, columns: list[str]) -> dict[str, Any]:
        async with self._lock(canvas_id):
            data = await asyncio.to_thread(self._read, canvas_id)
            data["columns"] = columns
            await asyncio.to_thread(self._write, canvas_id, data)
            return {"columns": data["columns"], "rowCount": len(data.get("rows", []))}

    # ── rows ───────────────────────────────────────────────────────────────────

    async def list_rows(
        self,
        canvas_id: str,
        order: str = "id",
        direction: str = "asc",
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        async with self._lock(canvas_id):
            data = await asyncio.to_thread(self._read, canvas_id)
            rows: list[dict[str, Any]] = data.get("rows", [])
            reverse = direction.lower() == "desc"
            try:
                rows = sorted(rows, key=lambda r: r.get(order, r.get("id", 0)), reverse=reverse)
            except TypeError:
                pass
            total = len(rows)
            page = rows[offset : offset + limit]
            return {"rows": page, "total": total, "limit": limit, "offset": offset}

    async def insert_rows(self, canvas_id: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        async with self._lock(canvas_id):
            data = await asyncio.to_thread(self._read, canvas_id)
            existing: list[dict[str, Any]] = data.setdefault("rows", [])
            next_id = max((r.get("id", 0) for r in existing), default=0) + 1
            inserted = []
            for row in rows:
                new_row = {**row, "id": next_id}
                existing.append(new_row)
                inserted.append(new_row)
                next_id += 1
            await asyncio.to_thread(self._write, canvas_id, data)
            return inserted

    async def update_row(self, canvas_id: str, row_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
        async with self._lock(canvas_id):
            data = await asyncio.to_thread(self._read, canvas_id)
            rows: list[dict[str, Any]] = data.get("rows", [])
            for i, row in enumerate(rows):
                if row.get("id") == row_id:
                    rows[i] = {**row, **updates, "id": row_id}
                    data["rows"] = rows
                    await asyncio.to_thread(self._write, canvas_id, data)
                    return rows[i]
            return None

    async def delete_row(self, canvas_id: str, row_id: int) -> bool:
        async with self._lock(canvas_id):
            data = await asyncio.to_thread(self._read, canvas_id)
            rows: list[dict[str, Any]] = data.get("rows", [])
            before = len(rows)
            data["rows"] = [r for r in rows if r.get("id") != row_id]
            if len(data["rows"]) == before:
                return False
            await asyncio.to_thread(self._write, canvas_id, data)
            return True

    # ── exec ───────────────────────────────────────────────────────────────────

    async def exec_code(self, canvas_id: str, code: str) -> Any:
        """Run arbitrary Python with ``records`` in scope (matches old backend behaviour)."""
        data = await asyncio.to_thread(self._read, canvas_id)
        records = data.get("rows", [])
        local_ns: dict[str, Any] = {"records": records}
        exec(code, {}, local_ns)  # noqa: S102
        return local_ns.get("result")
