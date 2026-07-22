"""Widget service — the built-in widget registry.

Metadata lives in ``server_data/widgets/index.json``; each widget's JS source lives
in ``server_data/widgets/<id>.js``.  Seed only updates entries flagged
``isBuiltin: true`` so user-created widgets aren't overwritten.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any


class WidgetService:
    def __init__(self, widgets_dir: Path) -> None:
        self._dir = widgets_dir
        self._index = widgets_dir / "index.json"

    # ── helpers ────────────────────────────────────────────────────────────────

    def _read_index(self) -> dict[str, Any]:
        try:
            return json.loads(self._index.read_text(encoding="utf-8"))
        except OSError, json.JSONDecodeError:
            return {"version": 1, "widgets": []}

    def _write_index(self, data: dict[str, Any]) -> None:
        self._index.parent.mkdir(parents=True, exist_ok=True)
        self._index.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def _js_path(self, widget_id: str) -> Path:
        return self._dir / f"{widget_id}.js"

    def _merge_code(self, widget: dict[str, Any]) -> dict[str, Any]:
        js = self._js_path(widget.get("id", ""))
        code = js.read_text(encoding="utf-8") if js.exists() else ""
        return {**widget, "code": code}

    # ── public API ─────────────────────────────────────────────────────────────

    async def list_widgets(self) -> list[dict[str, Any]]:
        def _list() -> list[dict[str, Any]]:
            data = self._read_index()
            return [self._merge_code(w) for w in data.get("widgets", []) if not w.get("archived")]

        return await asyncio.to_thread(_list)

    async def get_widget(self, widget_id: str) -> dict[str, Any] | None:
        def _get() -> dict[str, Any] | None:
            data = self._read_index()
            for w in data.get("widgets", []):
                if w.get("id") == widget_id:
                    return self._merge_code(w)
            return None

        return await asyncio.to_thread(_get)

    async def create_widget(self, widget: dict[str, Any]) -> dict[str, Any]:
        """Upsert a widget entry + its JS file. Returns the merged widget."""

        def _create() -> dict[str, Any]:
            data = self._read_index()
            widgets: list[dict[str, Any]] = data.setdefault("widgets", [])
            code = str(widget.pop("code", "") or "")
            # upsert by id
            idx = next((i for i, w in enumerate(widgets) if w.get("id") == widget.get("id")), None)
            if idx is not None:
                widgets[idx] = {**widgets[idx], **widget}
                merged = widgets[idx]
            else:
                widgets.append(widget)
                merged = widget
            self._write_index(data)
            js = self._js_path(str(merged.get("id", "")))
            if code:
                js.write_text(code, encoding="utf-8")
            return self._merge_code(merged)

        return await asyncio.to_thread(_create)

    async def seed_widgets(self, entries: list[dict[str, Any]]) -> int:
        """Seed built-in widgets. Only updates entries where ``isBuiltin`` is truthy."""

        def _seed() -> int:
            data = self._read_index()
            widgets: list[dict[str, Any]] = data.setdefault("widgets", [])
            by_id = {w["id"]: i for i, w in enumerate(widgets) if "id" in w}
            seeded = 0
            for entry in entries:
                wid = entry.get("id")
                if not wid:
                    continue
                code = str(entry.pop("code", "") or "")
                if wid in by_id:
                    existing = widgets[by_id[wid]]
                    if not existing.get("isBuiltin"):
                        continue
                    widgets[by_id[wid]] = {**existing, **entry}
                else:
                    widgets.append(entry)
                if code:
                    self._js_path(wid).write_text(code, encoding="utf-8")
                seeded += 1
            self._write_index(data)
            return seeded

        return await asyncio.to_thread(_seed)

    async def delete_widget(self, widget_id: str) -> bool:
        def _delete() -> bool:
            data = self._read_index()
            widgets: list[dict[str, Any]] = data.get("widgets", [])
            before = len(widgets)
            data["widgets"] = [w for w in widgets if w.get("id") != widget_id]
            if len(data["widgets"]) == before:
                return False
            self._write_index(data)
            js = self._js_path(widget_id)
            if js.exists():
                js.unlink()
            return True

        return await asyncio.to_thread(_delete)
