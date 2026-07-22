"""Excel service — load, patch, and save .xlsx workbooks via openpyxl.

Sidecar pattern: ``.<filename>.excel.json`` holds the parsed grid; the .xlsx is
updated on every patch/merge operation (in-process, no subprocess needed).

Cell schema (matches old frontend): ``{v: value, f?: formula, s?: style}``
Grid response: ``{id, name, sheets:[{sheetName, cells, columnIndexToWidth, rowIndexToHeight, mergedCellRanges}]}``
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any


def _sidecar(path: Path) -> Path:
    return path.parent / f".{path.name}.excel.json"


def _read_sidecar(path: Path) -> dict[str, Any] | None:
    sc = _sidecar(path)
    if not sc.exists():
        return None
    try:
        return json.loads(sc.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None


def _write_sidecar(path: Path, data: dict[str, Any]) -> None:
    sc = _sidecar(path)
    sc.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _cell_ref(row: int, col: int) -> str:
    """Convert 0-based row/col to A1 notation."""
    col_letter = ""
    c = col + 1
    while c:
        c, rem = divmod(c - 1, 26)
        col_letter = chr(65 + rem) + col_letter
    return f"{col_letter}{row + 1}"


def _xlsx_to_sidecar(path: Path) -> dict[str, Any]:
    """Parse an .xlsx file into the sidecar schema."""
    import openpyxl  # type: ignore[import-untyped]

    wb = openpyxl.load_workbook(str(path), data_only=False)
    wb_data = openpyxl.load_workbook(str(path), data_only=True)
    sheets = []
    for ws, ws_data in zip(wb.worksheets, wb_data.worksheets, strict=False):
        cells: dict[str, dict[str, Any]] = {}
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None and not cell.has_style:
                    continue
                ref = cell.coordinate
                entry: dict[str, Any] = {}
                if cell.data_type == "f" and cell.value:
                    entry["f"] = str(cell.value).lstrip("=")
                    # Get computed value from data_only workbook
                    dc = ws_data[ref]
                    if dc.value is not None:
                        entry["v"] = dc.value
                else:
                    if cell.value is not None:
                        entry["v"] = cell.value
                if entry:
                    cells[ref] = entry

        col_widths: dict[str, float] = {
            col_letter: ws.column_dimensions[col_letter].width for col_letter in ws.column_dimensions
        }
        row_heights: dict[str, float] = {
            str(row_idx): ws.row_dimensions[row_idx].height or 15.0 for row_idx in ws.row_dimensions
        }
        merged = [str(r) for r in ws.merged_cells.ranges]
        sheets.append(
            {
                "sheetName": ws.title,
                "cells": cells,
                "columnIndexToWidth": col_widths,
                "rowIndexToHeight": row_heights,
                "mergedCellRanges": merged,
            }
        )
    wb.close()
    wb_data.close()
    return {"name": path.stem, "sheets": sheets}


def _sidecar_to_api(data: dict[str, Any], path: Path) -> dict[str, Any]:
    return {
        "id": str(path),
        "name": data.get("name", path.stem),
        "sheets": data.get("sheets", []),
    }


def _write_xlsx(path: Path, sidecar: dict[str, Any]) -> None:
    """Regenerate the .xlsx from the sidecar (best-effort)."""
    import openpyxl  # type: ignore[import-untyped]

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet in sidecar.get("sheets", []):
        ws = wb.create_sheet(title=str(sheet.get("sheetName", "Sheet")))
        for ref, cell in (sheet.get("cells") or {}).items():
            v = cell.get("v")
            f = cell.get("f")
            if f:
                ws[ref] = f"={f}"
            elif v is not None:
                ws[ref] = v
        for rng in sheet.get("mergedCellRanges") or []:
            try:
                ws.merge_cells(str(rng))
            except Exception:
                pass
    wb.save(str(path))
    wb.close()


class ExcelService:
    async def load(self, path: str) -> dict[str, Any]:
        p = Path(path)

        def _do() -> dict[str, Any]:
            sc = _read_sidecar(p)
            if sc is None:
                sc = _xlsx_to_sidecar(p)
                _write_sidecar(p, sc)
            return _sidecar_to_api(sc, p)

        return await asyncio.to_thread(_do)

    async def patch(self, path: str, sheet: str | None, cells: dict[str, Any]) -> dict[str, Any]:
        p = Path(path)

        def _do() -> dict[str, Any]:
            sc = _read_sidecar(p) or _xlsx_to_sidecar(p)
            sheets = sc.get("sheets", [])
            target = next((s for s in sheets if s.get("sheetName") == sheet), sheets[0] if sheets else None)
            if target is None:
                target = {
                    "sheetName": sheet or "Sheet1",
                    "cells": {},
                    "columnIndexToWidth": {},
                    "rowIndexToHeight": {},
                    "mergedCellRanges": [],
                }
                sheets.append(target)
            existing_cells = target.setdefault("cells", {})
            for ref, data in cells.items():
                if data is None:
                    existing_cells.pop(ref, None)
                else:
                    existing_cells[ref] = {**existing_cells.get(ref, {}), **data}
            sc["sheets"] = sheets
            _write_sidecar(p, sc)
            _write_xlsx(p, sc)
            return _sidecar_to_api(sc, p)

        return await asyncio.to_thread(_do)

    async def set_grid(
        self, path: str, sheet: str | None, col_widths: dict[str, Any], row_heights: dict[str, Any]
    ) -> None:
        p = Path(path)

        def _do() -> None:
            sc = _read_sidecar(p) or _xlsx_to_sidecar(p)
            sheets = sc.get("sheets", [])
            target = next((s for s in sheets if s.get("sheetName") == sheet), sheets[0] if sheets else None)
            if target is not None:
                if col_widths:
                    target["columnIndexToWidth"] = col_widths
                if row_heights:
                    target["rowIndexToHeight"] = row_heights
            _write_sidecar(p, sc)

        await asyncio.to_thread(_do)

    async def merge_cells(self, path: str, sheet: str | None, merged_cells: list[str]) -> dict[str, Any]:
        p = Path(path)

        def _do() -> dict[str, Any]:
            sc = _read_sidecar(p) or _xlsx_to_sidecar(p)
            sheets = sc.get("sheets", [])
            target = next((s for s in sheets if s.get("sheetName") == sheet), sheets[0] if sheets else None)
            if target is not None:
                target["mergedCellRanges"] = merged_cells
            _write_sidecar(p, sc)
            _write_xlsx(p, sc)
            return _sidecar_to_api(sc, p)

        return await asyncio.to_thread(_do)

    async def rename_sheet(self, path: str, old_name: str, new_name: str) -> str:
        p = Path(path)

        def _do() -> str:
            sc = _read_sidecar(p) or _xlsx_to_sidecar(p)
            sheets = sc.get("sheets", [])
            names = [s.get("sheetName") for s in sheets]
            if new_name in names:
                raise ValueError(f"Sheet '{new_name}' already exists")
            for s in sheets:
                if s.get("sheetName") == old_name:
                    s["sheetName"] = new_name
            _write_sidecar(p, sc)
            return new_name

        return await asyncio.to_thread(_do)

    async def add_sheet(self, path: str, sheet_name: str | None = None) -> str:
        p = Path(path)

        def _do() -> str:
            sc = _read_sidecar(p) or _xlsx_to_sidecar(p)
            sheets = sc.setdefault("sheets", [])
            existing = {s.get("sheetName") for s in sheets}
            name = sheet_name or "Sheet2"
            n = 2
            while name in existing:
                name = f"Sheet{n}"
                n += 1
            sheets.append(
                {
                    "sheetName": name,
                    "cells": {},
                    "columnIndexToWidth": {},
                    "rowIndexToHeight": {},
                    "mergedCellRanges": [],
                }
            )
            _write_sidecar(p, sc)
            return name

        return await asyncio.to_thread(_do)
