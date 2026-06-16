/**
 * Excel Viewer/Editor — isolated module ported from bz-office.
 *
 * Only this file should be imported by the rest of bz-agent.
 * All internal bz-office code lives under src/excel/ and can be updated
 * independently.
 *
 * Usage:
 *   import { ExcelEditor } from '#/excel';
 */

import React, { useCallback, useEffect, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ExcelViewSheetArea = (React.lazy(() => import('./components/ExcelViewSheetArea')) as any);
const ExcelSheetTabs     = (React.lazy(() => import('./components/ExcelSheetTabs')) as any);

const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

export interface ExcelEditorProps {
  filePath: string;
  style?:   React.CSSProperties;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SheetData = Record<string, any>;

/** Simple client-side Excel formula evaluator for common cases. */
function evalFormula(formula: string, cells: Record<string, any>): number | string | null {
  if (!formula.startsWith('=')) return null;
  const expr = formula.slice(1).trim().toUpperCase();

  const cellVal = (id: string): number => {
    const v = cells[id.toUpperCase()]?.value;
    if (v == null || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  const expandRange = (range: string): string[] => {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) return [range];
    const colStart = m[1]!, rowStart = parseInt(m[2]!);
    const colEnd   = m[3]!, rowEnd   = parseInt(m[4]!);
    const colIdx = (s: string) => s.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
    const colLet = (n: number) => { let s = ''; while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); } return s; };
    const result: string[] = [];
    for (let r = rowStart; r <= rowEnd; r++)
      for (let c = colIdx(colStart); c <= colIdx(colEnd); c++)
        result.push(`${colLet(c)}${r}`);
    return result;
  };

  try {
    let m: RegExpMatchArray | null;
    if ((m = expr.match(/^SUM\(([^)]+)\)$/)))    return expandRange(m[1]!.trim()).reduce((s, id) => s + cellVal(id), 0);
    if ((m = expr.match(/^AVERAGE\(([^)]+)\)$/))) { const vs = expandRange(m[1]!.trim()); return vs.reduce((s, id) => s + cellVal(id), 0) / (vs.length || 1); }
    if ((m = expr.match(/^MIN\(([^)]+)\)$/)))    return Math.min(...expandRange(m[1]!.trim()).map(cellVal));
    if ((m = expr.match(/^MAX\(([^)]+)\)$/)))    return Math.max(...expandRange(m[1]!.trim()).map(cellVal));
    if ((m = expr.match(/^COUNT\(([^)]+)\)$/)))  return expandRange(m[1]!.trim()).filter(id => cells[id]?.value != null && cells[id]?.value !== '').length;
    // Arithmetic with cell refs: replace A1-style refs with values then eval
    const arith = expr.replace(/([A-Z]+\d+)/g, ref => String(cellVal(ref)));
    if (/^[\d\s.+\-*/()]+$/.test(arith)) return Function('"use strict"; return (' + arith + ')')() as number;
  } catch { /* fall through */ }
  return null;
}

export function ExcelEditor({ filePath, style }: ExcelEditorProps) {
  const [data,          setData]          = useState<any>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [selectedSheet, setSelectedSheet] = useState('');
  const [viewWindow,    setViewWindow]    = useState({ startRow: 0, startCol: 0, endRow: 50, endCol: 26 });

  // Load XLSX from server
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError('');
    fetch(`${HTTP_BASE}/api/excel/load?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        // Client-side fallback: evaluate any formula cells the server couldn't compute
        // (e.g. formulas library unavailable or unsupported function).
        // Only runs for cells that are still missing a value after server evaluation.
        const evaluated = {
          ...d,
          sheets: d.sheets?.map((s: any) => {
            const cells = { ...s.cells };
            for (let pass = 0; pass < 4; pass++) {
              for (const [cellId, cd] of Object.entries(cells)) {
                const formulaStr = (cd as any)?.formula;
                if (typeof formulaStr === 'string' && formulaStr.startsWith('=')
                    && (cd as any)?.value == null) {
                  const result = evalFormula(formulaStr, cells);
                  if (result !== null) cells[cellId] = { ...(cd as any), value: result };
                }
              }
            }
            return { ...s, cells };
          }),
        };
        setData(evaluated);
        setSelectedSheet(evaluated.sheets?.[0]?.sheetName ?? '');
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [filePath]);

  const sheet: SheetData | null = data?.sheets?.find((s: any) => s.sheetName === selectedSheet) ?? null;

  const handleCellPatch = useCallback((cellUpdates: Record<string, any>) => {
    if (!sheet) return;
    const currentCells = sheet.cells ?? {};

    // 1. Apply the incoming updates (evaluate any formulas in the patch itself)
    const patched: Record<string, any> = { ...currentCells };
    for (const [cellId, cd] of Object.entries(cellUpdates)) {
      const formula = (cd as any)?.formula;
      const raw = (cd as any)?.value;
      const formulaStr = (typeof formula === 'string' && formula.startsWith('=')) ? formula
        : (typeof raw === 'string' && raw.startsWith('=')) ? raw : null;
      if (formulaStr) {
        const evalResult = evalFormula(formulaStr, { ...patched, [cellId]: cd });
        patched[cellId] = evalResult !== null
          ? { ...(cd as any), value: evalResult, formula: formulaStr }
          : cd;
      } else {
        patched[cellId] = cd;
      }
    }

    // 2. Re-evaluate ALL formula cells in the sheet so dependents update too
    const recalculated = { ...patched };
    for (const [cellId, cd] of Object.entries(recalculated)) {
      const formulaStr = (cd as any)?.formula;
      if (typeof formulaStr === 'string' && formulaStr.startsWith('=')) {
        const evalResult = evalFormula(formulaStr, recalculated);
        if (evalResult !== null) {
          recalculated[cellId] = { ...(cd as any), value: evalResult };
        }
      }
    }

    setData((prev: any) => {
      const sheets = prev.sheets.map((s: any) =>
        s.sheetName === selectedSheet
          ? { ...s, cells: recalculated }
          : s
      );
      return { ...prev, sheets };
    });
    // Persist to server — send recalculated so formula strings are included
    fetch(`${HTTP_BASE}/api/excel/save`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, sheets: [{
        sheetName: selectedSheet,
        cells: recalculated,
      }] }),
    }).catch(() => null);
  }, [filePath, selectedSheet, sheet]);

  const handleGridChange = useCallback((grid: any) => {
    if (!sheet) return;
    setData((prev: any) => ({
      ...prev,
      sheets: prev.sheets.map((s: any) =>
        s.sheetName === selectedSheet ? { ...s, ...grid } : s
      ),
    }));
  }, [selectedSheet, sheet]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: 13 }}>
      Loading spreadsheet…
    </div>
  );
  if (error) return (
    <div style={{ padding: 16, color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>
  );
  if (!data || !sheet) return null;

  const sheetNames: string[] = data.sheets?.map((s: any) => s.sheetName) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-primary)', ...style }}>
      {/* Canvas grid — lazy loaded */}
      <React.Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Rendering…</div>}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ExcelViewSheetArea
            sheetName={selectedSheet}
            cells={sheet.cells ?? {}}
            grid={{
              columnIndexToWidth: sheet.columnIndexToWidth ?? {},
              rowIndexToHeight:   sheet.rowIndexToHeight ?? {},
              hiddenColIndices:   sheet.hiddenColIndices ?? [],
              hiddenRowIndices:   sheet.hiddenRowIndices ?? [],
            }}
            images={sheet.images ?? []}
            labels={[]}
            extraLabels={[]}
            showToolbar
            isPatching={false}
            onNewCellToPatch={handleCellPatch}
            onNewGrid={handleGridChange}
            onSaveLabel={() => {}}
            onNewImagesToPatch={() => {}}
            onScrollViewWindow={setViewWindow}
            viewWindow={viewWindow}
          />
        </div>
      </React.Suspense>

      {/* Sheet tabs — always visible like real Excel */}
      <React.Suspense fallback={null}>
        <ExcelSheetTabs
          sheetNames={sheetNames}
          selectedSheetName={selectedSheet}
          onSheetSelect={setSelectedSheet}
        />
      </React.Suspense>
    </div>
  );
}
