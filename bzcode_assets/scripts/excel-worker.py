#!/usr/bin/env python3
from __future__ import annotations
"""
excel-worker.py — Excel workbook builder and formula evaluator.

CREATE mode  — build xlsx + sidecar JSON from a data spec:
  python3 excel-worker.py --data '{"sheets":[...]}' --out /path/file.xlsx
  python3 excel-worker.py --data-file /tmp/data.json --out /path/file.xlsx

RECALC mode  — re-evaluate formulas in an existing sidecar JSON, rewrite xlsx:
  python3 excel-worker.py --recalc /path/.file.xlsx.excel.json --out /path/file.xlsx
  python3 excel-worker.py --recalc /path/.file.xlsx.excel.json --out /path/file.xlsx \
      --patch '{"sheet":"Sheet1","cells":{"B22":{"f":"=SUM(B2:B21)+B3"}}}'

─── Input JSON schema (create mode) ─────────────────────────────────────────
{
  "sheets": [{
    "name": "Sheet1",
    "headers": ["#", "Value"],
    "rows": [[1, 10], [2, 20], ["Total", null]],
    "formulas": { "B4": "=SUM(B2:B3)*2" },
    "col_widths": [20, 15],
    "styles": {
      "A2": { "bg": "#FFF3E0", "fg": "#E65100" },
      "B2": { "bold": true, "align": "right" }
    }
  }]
}

styles  — optional per-cell style overrides applied after headers/rows/formulas.
  Keys are cell refs (e.g. "A2"). Values are style objects with any of:
    bg      hex color string "#RRGGBB"  — cell background
    fg      hex color string "#RRGGBB"  — font color
    bold    boolean
    italic  boolean
    align   "left"|"center"|"right"
    format  number format string (e.g. "#,##0.00")
    wrap    boolean — wrap text

─── Sidecar schema  (.{name}.xlsx.excel.json) ───────────────────────────────
{
  "version": 1,
  "xlsx_path": "/abs/path/file.xlsx",
  "sheets": [{
    "name": "Sheet1",
    "col_widths": [20, 15],
    "cells": {
      "A1": { "v": "#",     "s": { "bold": true, "bg": "#1473DF", "fg": "#FFFFFF", "align": "center" } },
      "B1": { "v": "Value", "s": { "bold": true, "bg": "#1473DF", "fg": "#FFFFFF", "align": "center" } },
      "A2": { "v": 1 },
      "B2": { "v": 10 },
      "A3": { "v": 2 },
      "B3": { "v": 20 },
      "A4": { "v": "Total" },
      "B4": { "f": "=SUM(B2:B3)*2", "v": 60 }
    }
  }]
}

─── Stdout (both modes) ─────────────────────────────────────────────────────
{
  "ok": true,
  "xlsx_path": "...",
  "json_path": "...",
  "sheets": 1,
  "computed": { "B4": 60 }
}
"""
import argparse
import json
import re
import sys
from pathlib import Path


# ─── Cell-reference helpers ───────────────────────────────────────────────────

def _col_to_idx(col: str) -> int:
    """'A'→0, 'B'→1, 'Z'→25, 'AA'→26."""
    result = 0
    for ch in col.upper():
        result = result * 26 + (ord(ch) - ord('A') + 1)
    return result - 1


def _idx_to_col(idx: int) -> str:
    """0→'A', 1→'B', 25→'Z', 26→'AA'."""
    result = ""
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def _parse_ref(ref: str) -> tuple[int, int]:
    """'B3' → (row=3, col=1)  — row 1-based, col 0-based."""
    m = re.fullmatch(r'([A-Z]+)(\d+)', ref.strip().upper())
    if not m:
        raise ValueError(f'Invalid cell ref: {ref!r}')
    return int(m.group(2)), _col_to_idx(m.group(1))


# ─── In-memory cell grid ──────────────────────────────────────────────────────

class Grid:
    """Sparse cell store. Row and col are both 1-based (Excel convention)."""

    def __init__(self) -> None:
        self._cells: dict[tuple[int, int], object] = {}

    def set(self, row: int, col: int, value) -> None:
        if value is not None:
            self._cells[(row, col)] = value

    def get(self, row: int, col: int):
        return self._cells.get((row, col))

    def get_ref(self, ref: str):
        row, col = _parse_ref(ref)
        return self.get(row, col + 1)   # _parse_ref returns 0-based col

    def get_range(self, range_str: str) -> list:
        range_str = range_str.upper().strip()
        if ':' not in range_str:
            v = self.get_ref(range_str)
            return [v] if v is not None else []
        start, end = range_str.split(':', 1)
        sr, sc = _parse_ref(start)
        er, ec = _parse_ref(end)
        sc += 1; ec += 1  # convert to 1-based
        vals = []
        for r in range(min(sr, er), max(sr, er) + 1):
            for c in range(min(sc, ec), max(sc, ec) + 1):
                v = self.get(r, c)
                if v is not None:
                    vals.append(v)
        return vals

    def load_from_rows(self, headers: list, rows: list) -> None:
        """Populate from create-mode headers+rows input."""
        for c_idx, h in enumerate(headers, 1):
            self.set(1, c_idx, h)
        for r_idx, row in enumerate(rows, 2):
            for c_idx, val in enumerate(row, 1):
                if val is not None:
                    self.set(r_idx, c_idx, val)

    def load_from_cells(self, cells: dict) -> None:
        """Populate from sidecar cells dict {ref: {v, f?, s?}}."""
        for ref, cd in cells.items():
            try:
                row, col = _parse_ref(ref)
                v = cd.get('v')
                if v is not None:
                    self.set(row, col + 1, v)
            except Exception:
                pass


# ─── Formula evaluator ────────────────────────────────────────────────────────

def evaluate_formula(formula: str, grid: Grid, grids: 'dict[str, Grid] | None' = None):
    """Evaluate an Excel formula against the grid. Returns a Python value."""
    expr = formula.strip()
    if expr.startswith('='):
        expr = expr[1:]
    return _eval(expr.strip(), grid, grids)


def _eval(expr: str, grid: Grid, grids: 'dict[str, Grid] | None' = None):
    expr = expr.strip()
    if not expr:
        return None

    # Pure cross-sheet single-cell ref: 'Sheet1'!A2 or Sheet1!A2
    # Must be checked before the function-call pattern so string values are
    # returned directly instead of falling through to _safe_eval (which only
    # handles arithmetic and would return None for string cells).
    m = re.fullmatch(r"(?:'([^']+)'|([A-Za-z0-9_]+))!([A-Z]+\d+)", expr, re.IGNORECASE)
    if m:
        sheet_name = m.group(1) or m.group(2)
        ref_part   = m.group(3)
        g = (grids or {}).get(sheet_name, grid)
        return g.get_ref(ref_part)

    # Function call: NAME(args...)
    m = re.fullmatch(r'([A-Z_][A-Z0-9_]*)\s*\((.*)$', expr, re.DOTALL | re.IGNORECASE)
    if m:
        fname = m.group(1).upper()
        rest  = m.group(2)
        depth = 1
        i = 0
        for i, ch in enumerate(rest):
            if ch == '(':   depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    break
        args_str = rest[:i]
        tail     = rest[i + 1:].strip()
        result   = _call(fname, args_str, grid, grids)
        # Handle arithmetic after the closing paren: SUM(A:B)*2, SUM(A:B)+C3
        if tail:
            try:
                result = _safe_eval(f'{_num(result)}{_substitute_refs(tail, grid, grids)}')
            except Exception:
                pass
        return result

    # Pure arithmetic / cell ref expression
    resolved = _substitute_refs(expr, grid, grids)
    try:
        return _safe_eval(resolved)
    except Exception:
        return None


def _num(v) -> str:
    if isinstance(v, bool):  return '1' if v else '0'
    if isinstance(v, (int, float)): return repr(v)
    return '0'


def _resolve_cross_sheet_arg(arg: str, grid: Grid, grids: 'dict[str, Grid] | None'):
    """Return (target_grid, ref_or_range) if arg is a cross-sheet ref, else (None, None)."""
    m = re.fullmatch(
        r"(?:'([^']+)'|([A-Za-z0-9_]+))!\s*([A-Z]+\d+(?::[A-Z]+\d+)?)",
        arg.strip(), re.IGNORECASE,
    )
    if not m:
        return None, None
    sheet_name = m.group(1) or m.group(2)
    ref_part   = m.group(3)
    g = (grids or {}).get(sheet_name, grid)
    return g, ref_part


def _call(fname: str, args_str: str, grid: Grid, grids: 'dict[str, Grid] | None' = None):
    raw_args = _split_args(args_str)

    if fname in ('SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'PRODUCT'):
        vals: list = []
        for arg in raw_args:
            arg = arg.strip()
            # Cross-sheet ref: Sheet1!A1:A2 or Sheet1!A1
            xg, xref = _resolve_cross_sheet_arg(arg, grid, grids)
            if xg is not None:
                if ':' in xref:
                    vals.extend(xg.get_range(xref))
                else:
                    v = xg.get_ref(xref)
                    if v is not None: vals.append(v)
            elif re.fullmatch(r'[A-Z]+\d+:[A-Z]+\d+', arg, re.IGNORECASE):
                vals.extend(grid.get_range(arg))
            elif re.fullmatch(r'[A-Z]+\d+', arg, re.IGNORECASE):
                v = grid.get_ref(arg)
                if v is not None: vals.append(v)
            else:
                v = _eval(arg, grid, grids)
                if v is not None: vals.append(v)
        nums = [v for v in vals if isinstance(v, (int, float))]
        if fname == 'SUM':     return sum(nums)
        if fname == 'AVERAGE': return (sum(nums) / len(nums)) if nums else 0
        if fname == 'COUNT':   return len(nums)
        if fname == 'COUNTA':  return len([v for v in vals if v is not None and v != ''])
        if fname == 'MAX':     return max(nums) if nums else 0
        if fname == 'MIN':     return min(nums) if nums else 0
        if fname == 'PRODUCT':
            r = 1
            for n in nums: r *= n
            return r

    if fname == 'ROUND':
        v = _eval(raw_args[0], grid, grids) if raw_args else 0
        d = int(_eval(raw_args[1], grid, grids) or 0) if len(raw_args) > 1 else 0
        return round(float(v or 0), d)
    if fname == 'ABS':
        return abs(float(_eval(raw_args[0], grid, grids) or 0))
    if fname in ('INT', 'TRUNC'):
        return int(float(_eval(raw_args[0], grid, grids) or 0))
    if fname in ('LEN', 'LENGTH'):
        v = _eval(raw_args[0], grid, grids) if raw_args else ''
        return len(str(v)) if v is not None else 0
    if fname == 'TEXT':
        v = _eval(raw_args[0], grid, grids) if raw_args else ''
        return str(v) if v is not None else ''
    if fname == 'CONCATENATE':
        return ''.join(str(_eval(a, grid, grids) or '') for a in raw_args)
    if fname == 'IF':
        cond    = _eval(raw_args[0], grid, grids) if raw_args else False
        true_v  = _eval(raw_args[1], grid, grids) if len(raw_args) > 1 else ''
        false_v = _eval(raw_args[2], grid, grids) if len(raw_args) > 2 else ''
        return true_v if cond else false_v
    if fname == 'IFERROR':
        try:   return _eval(raw_args[0], grid, grids) if raw_args else ''
        except Exception: return _eval(raw_args[1], grid, grids) if len(raw_args) > 1 else ''
    if fname in ('NOW', 'TODAY'): return ''
    return 0


def _split_args(args_str: str) -> list[str]:
    args: list[str] = []
    depth = 0
    buf: list[str] = []
    for ch in args_str:
        if ch == '(':   depth += 1; buf.append(ch)
        elif ch == ')': depth -= 1; buf.append(ch)
        elif ch == ',' and depth == 0:
            args.append(''.join(buf).strip()); buf = []
        else:
            buf.append(ch)
    if buf:
        args.append(''.join(buf).strip())
    return [a for a in args if a]


def _substitute_refs(expr: str, grid: Grid, grids: 'dict[str, Grid] | None' = None) -> str:
    # Match cross-sheet refs (Sheet1!A1) before plain refs (A1) so the longer
    # pattern wins when both could match.
    _CROSS = r"(?:'[^']+'|[A-Za-z0-9_]+)![A-Z]+\d+"
    _PLAIN = r"\b[A-Z]+\d+\b"

    def replace(m):
        ref = m.group(0)
        if '!' in ref:
            sheet_part, cell_part = ref.split('!', 1)
            g = (grids or {}).get(sheet_part.strip("'"), grid)
            v = g.get_ref(cell_part.strip())
        else:
            v = grid.get_ref(ref)
        if v is None: return '0'
        if isinstance(v, (int, float)): return repr(v)
        return '0'

    return re.sub(f'(?:{_CROSS}|{_PLAIN})', replace, expr, flags=re.IGNORECASE)


def _safe_eval(expr: str):
    if not re.fullmatch(r'[\d\s\+\-\*\/\(\)\.\,]+', expr.replace('**', '  ')):
        raise ValueError(f'Unsafe: {expr!r}')
    return eval(expr, {'__builtins__': {}}, {})  # noqa: S307


# ─── Sheet processing ─────────────────────────────────────────────────────────

_HEADER_STYLE: dict = {
    "bold": True, "bg": "#1473DF", "fg": "#FFFFFF", "align": "center",
}


def compute_sheet(sheet_def: dict) -> dict:
    """
    CREATE mode: build per-cell schema from rows/headers/formulas input.
    Returns { name, col_widths, cells }.
    """
    headers    = sheet_def.get('headers', [])
    rows       = [list(r) for r in sheet_def.get('rows', [])]
    formulas: dict[str, str] = sheet_def.get('formulas', {})
    col_widths = sheet_def.get('col_widths', [])
    name       = sheet_def.get('name', 'Sheet')

    grid = Grid()
    grid.load_from_rows(headers, rows)

    cells: dict[str, dict] = {}

    # Row 1 — headers with blue style
    for c_idx, h in enumerate(headers):
        cells[f"{_idx_to_col(c_idx)}1"] = {"v": h, "s": _HEADER_STYLE}

    # Evaluate all formulas (top-to-bottom so dependencies are resolved)
    formula_refs = {r.strip().upper() for r in formulas}
    sorted_formulas = sorted(
        formulas.items(),
        key=lambda kv: (_parse_ref(kv[0].strip().upper()) if _is_valid_ref(kv[0]) else (0, 0))
    )
    computed: dict[str, object] = {}
    for cell_ref, formula in sorted_formulas:
        ref_upper = cell_ref.strip().upper()
        try:
            result = evaluate_formula(formula, grid)
        except Exception as exc:
            result = f'#ERR:{exc}'
        computed[ref_upper] = result
        try:
            row_1b, col_0b = _parse_ref(ref_upper)
            if isinstance(result, (int, float)):
                grid.set(row_1b, col_0b + 1, result)
        except Exception:
            pass

    # Data rows (row 2+) — skip cells that are formula targets
    for r_idx, row in enumerate(rows, 2):
        for c_idx, val in enumerate(row):
            ref = f"{_idx_to_col(c_idx)}{r_idx}"
            if ref in formula_refs:
                continue
            if val is not None:
                cells[ref] = {"v": val}

    # Formula cells (may be inside or beyond the data rows)
    for cell_ref, formula in formulas.items():
        ref_upper = cell_ref.strip().upper()
        val = computed.get(ref_upper)
        cd: dict = {"f": formula}
        if isinstance(val, (int, float)):
            cd["v"] = val
        cells[ref_upper] = cd

    # Apply per-cell style overrides from the optional "styles" dict.
    # Keys are cell refs; values are style objects merged into cells[ref]['s'].
    for ref, style in sheet_def.get('styles', {}).items():
        if not isinstance(style, dict):
            continue
        ref_upper = ref.strip().upper()
        existing = dict(cells.get(ref_upper, {}))
        existing['s'] = {**existing.get('s', {}), **style}
        cells[ref_upper] = existing

    return {"name": name, "col_widths": col_widths, "cells": cells}


def recalc_sheet(sheet: dict, grids: 'dict[str, Grid] | None' = None) -> tuple[dict, dict]:
    """
    RECALC mode: re-evaluate all formula cells in a sidecar sheet.
    Pass grids={name: Grid} to support cross-sheet references.
    Returns (updated_sheet, computed_dict).
    """
    cells = {k: dict(v) for k, v in sheet.get('cells', {}).items()}

    grid = Grid()
    # Load non-formula cell values first
    for ref, cd in cells.items():
        if 'f' not in cd:
            try:
                row, col = _parse_ref(ref)
                v = cd.get('v')
                if v is not None:
                    grid.set(row, col + 1, v)
            except Exception:
                pass

    # Evaluate formula cells in row-then-column order so dependencies resolve
    formula_refs = [ref for ref, cd in cells.items() if 'f' in cd]
    formula_refs.sort(key=lambda r: _parse_ref(r) if _is_valid_ref(r) else (0, 0))

    computed: dict[str, object] = {}
    for ref in formula_refs:
        cd = cells[ref]
        try:
            result = evaluate_formula(cd['f'], grid, grids)
        except Exception as exc:
            result = f'#ERR:{exc}'
        computed[ref] = result
        new_cd = dict(cd)
        if isinstance(result, (int, float)):
            new_cd['v'] = result
            try:
                row, col = _parse_ref(ref)
                grid.set(row, col + 1, result)
            except Exception:
                pass
        elif isinstance(result, str):
            new_cd['v'] = result
        cells[ref] = new_cd

    return {**sheet, 'cells': cells}, computed


def recalc_all_sheets(sheets: list[dict]) -> tuple[list[dict], dict]:
    """
    RECALC mode with cross-sheet reference support.
    Builds a Grid for every sheet upfront (non-formula values), then recalculates
    each sheet's formulas with the full grids map so Sheet1!A1 refs resolve.
    Returns (updated_sheets, all_computed).
    """
    # Phase 1: seed every sheet's grid with its plain (non-formula) values
    grids: dict[str, Grid] = {}
    for sheet in sheets:
        name = sheet.get('name', '')
        g = Grid()
        for ref, cd in sheet.get('cells', {}).items():
            if 'f' not in cd:
                try:
                    row, col = _parse_ref(ref)
                    v = cd.get('v')
                    if v is not None:
                        g.set(row, col + 1, v)
                except Exception:
                    pass
        grids[name] = g

    # Phase 2: recalc each sheet with access to all grids
    all_computed: dict[str, object] = {}
    updated_sheets: list[dict] = []
    for sheet in sheets:
        updated, computed = recalc_sheet(sheet, grids)
        # Propagate computed values back into this sheet's grid so later sheets
        # that reference it get the recalculated (not stale) values.
        name = sheet.get('name', '')
        for ref, val in computed.items():
            if isinstance(val, (int, float, str)) and _is_valid_ref(ref):
                try:
                    row, col = _parse_ref(ref)
                    grids[name].set(row, col + 1, val)
                except Exception:
                    pass
        all_computed.update(computed)
        updated_sheets.append(updated)

    return updated_sheets, all_computed


def _is_valid_ref(ref: str) -> bool:
    try:
        _parse_ref(ref.strip())
        return True
    except Exception:
        return False


# ─── xlsx generation ──────────────────────────────────────────────────────────

def write_workbook(sheets: list[dict], out_path: Path) -> None:
    import xlsxwriter

    out_path.parent.mkdir(parents=True, exist_ok=True)
    workbook = xlsxwriter.Workbook(str(out_path))
    _fmt_cache: dict = {}

    def _get_fmt(s: dict | None):
        if not s:
            return default_fmt
        key = tuple(sorted(s.items()))
        if key not in _fmt_cache:
            props: dict = {"border": 1}
            if s.get("bold"):     props["bold"]       = True
            if s.get("italic"):   props["italic"]     = True
            if s.get("bg"):       props["bg_color"]   = s["bg"]
            if s.get("fg"):       props["font_color"] = s["fg"]
            if s.get("format"):   props["num_format"] = s["format"]
            if s.get("wrap"):     props["text_wrap"]  = True
            if s.get("fontSize"): props["font_size"]  = s["fontSize"]
            if s.get("align"):
                # align may be "CENTER;BOTTOM" (compound from toolbar) or plain "center"
                parts = s["align"].split(";")
                horiz = parts[0].strip().lower()
                if horiz in ("left", "center", "right", "fill", "justify", "center_across"):
                    props["align"] = horiz
                if len(parts) > 1:
                    vert_map = {"top": "top", "center": "vcenter", "bottom": "bottom", "vjustify": "vjustify"}
                    props["valign"] = vert_map.get(parts[1].strip().lower(), "bottom")
            if s.get("valign"): props["valign"]     = s["valign"]
            _fmt_cache[key] = workbook.add_format(props)
        return _fmt_cache[key]

    default_fmt = workbook.add_format({"border": 1})

    for sheet in sheets:
        ws         = workbook.add_worksheet(sheet["name"])
        cells      = sheet.get("cells", {})
        col_widths = sheet.get("col_widths", [])

        max_col = 0
        for ref in cells:
            try:
                _, c = _parse_ref(ref)
                max_col = max(max_col, c)
            except Exception:
                pass

        for ref, cd in cells.items():
            try:
                row_1b, col_0b = _parse_ref(ref)
                fmt     = _get_fmt(cd.get("s"))
                formula = cd.get("f")
                val     = cd.get("v")
                if formula:
                    numeric_val = val if isinstance(val, (int, float)) else 0
                    ws.write_formula(row_1b - 1, col_0b, formula, fmt, numeric_val)
                elif val is not None:
                    ws.write(row_1b - 1, col_0b, val, fmt)
            except Exception:
                pass

        if col_widths:
            for c, w in enumerate(col_widths):
                if w:
                    ws.set_column(c, c, w)
        else:
            for c in range(max_col + 1):
                ws.set_column(c, c, 15)

        ws.freeze_panes(1, 0)

        for merge_range in sheet.get('mergedCells', []):
            parts = merge_range.split(':')
            if len(parts) == 2:
                try:
                    r1, c1 = _parse_ref(parts[0].strip())
                    r2, c2 = _parse_ref(parts[1].strip())
                    ws.merge_range(r1 - 1, c1, r2 - 1, c2, '', default_fmt)
                except Exception:
                    pass

    workbook.close()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='Excel workbook builder / formula evaluator.')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--data',      help='Inline JSON data string (create mode).')
    mode.add_argument('--data-file', help='Path to JSON data file (create mode).')
    mode.add_argument('--recalc',    help='Path to sidecar .excel.json (recalc mode).')
    parser.add_argument('--out',   required=True, help='Output .xlsx path.')
    parser.add_argument('--patch', default='',   help='JSON cell patch to apply before recalc.')
    args = parser.parse_args()

    out_path = Path(args.out)
    if out_path.suffix.lower() not in ('.xlsx', '.xls'):
        out_path = out_path.with_suffix('.xlsx')

    json_path = out_path.parent / f'.{out_path.name}.excel.json'

    if args.recalc:
        # ── RECALC MODE ──────────────────────────────────────────────────────
        sidecar_path = Path(args.recalc)
        if not sidecar_path.exists():
            print(json.dumps({'error': f'sidecar not found: {sidecar_path}'}))
            sys.exit(1)
        try:
            sidecar = json.loads(sidecar_path.read_text(encoding='utf-8'))
        except Exception as e:
            print(json.dumps({'error': f'invalid sidecar JSON: {e}'}))
            sys.exit(1)

        # Apply cell patch before recalculating
        if args.patch:
            try:
                patch      = json.loads(args.patch)
                sheet_name = patch.get('sheet', '')
                updates    = patch.get('cells', {})
                for sheet in sidecar.get('sheets', []):
                    if sheet_name and sheet.get('name') != sheet_name:
                        continue
                    for ref, cd in updates.items():
                        ref = ref.strip().upper()
                        existing = dict(sheet['cells'].get(ref, {}))
                        # Merge: f/v/s updates replace existing fields; None = delete
                        for k, v in cd.items():
                            if k == 's' and isinstance(v, dict):
                                # Deep merge style sub-dict; null style keys = delete
                                existing_s = dict(existing.get('s') or {})
                                for sk, sv in v.items():
                                    if sv is None:
                                        existing_s.pop(sk, None)
                                    else:
                                        existing_s[sk] = sv
                                existing['s'] = existing_s
                            elif v is None:
                                existing.pop(k, None)
                            else:
                                existing[k] = v
                        # If formula removed, drop v too so it becomes a plain value
                        if 'f' not in existing and 'v' in cd:
                            existing.pop('f', None)
                        sheet['cells'][ref] = existing
            except Exception as e:
                print(json.dumps({'error': f'invalid patch: {e}'}))
                sys.exit(1)

        updated_sheets, all_computed = recalc_all_sheets(sidecar.get('sheets', []))
        sidecar['sheets'] = updated_sheets

    else:
        # ── CREATE MODE ──────────────────────────────────────────────────────
        if args.data_file:
            f = Path(args.data_file)
            if not f.exists():
                print(json.dumps({'error': f'data file not found: {f}'}))
                sys.exit(1)
            try:
                data = json.loads(f.read_text(encoding='utf-8'))
            except json.JSONDecodeError as e:
                print(json.dumps({'error': f'invalid JSON: {e}'}))
                sys.exit(1)
        else:
            try:
                data = json.loads(args.data)
            except json.JSONDecodeError as e:
                print(json.dumps({'error': f'invalid JSON: {e}'}))
                sys.exit(1)

        computed_sheets = [compute_sheet(s) for s in data.get('sheets', [])]
        # Second pass resolves cross-sheet references (='Sheet1'!A1 etc.)
        computed_sheets, all_computed = recalc_all_sheets(computed_sheets)
        sidecar = {
            'version': 1,
            'xlsx_path': str(out_path.resolve()),
            'sheets': computed_sheets,
        }

    # Write xlsx
    try:
        write_workbook(sidecar['sheets'], out_path)
    except Exception as exc:
        print(json.dumps({'error': f'could not write workbook: {exc}'}))
        sys.exit(1)

    # Write sidecar JSON (update xlsx_path in case --out differs from original)
    sidecar['xlsx_path'] = str(out_path.resolve())
    json_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2), encoding='utf-8')

    print(json.dumps({
        'ok':       True,
        'xlsx_path': str(out_path.resolve()),
        'json_path': str(json_path.resolve()),
        'sheets':    len(sidecar['sheets']),
        'computed':  all_computed,
    }))


if __name__ == '__main__':
    main()
