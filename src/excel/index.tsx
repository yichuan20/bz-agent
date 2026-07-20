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
const ExcelViewSheetArea = React.lazy(() => import('./components/ExcelViewSheetArea')) as any;
const ExcelSheetTabs = React.lazy(() => import('./components/ExcelSheetTabs')) as any;

const HTTP_BASE =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

export interface ExcelEditorProps {
  filePath: string;
  style?: React.CSSProperties;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SheetData = Record<string, any>;

export function ExcelEditor({ filePath, style }: ExcelEditorProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSheet, setSelectedSheet] = useState('');
  const [viewWindow, setViewWindow] = useState({
    startRow: 0,
    startCol: 0,
    endRow: 50,
    endCol: 26,
  });
  const [zoom, setZoom] = useState(1);

  const handleZoomChange = useCallback((delta: number) => {
    setZoom(prev => Math.min(3, Math.max(0.25, Math.round((prev + delta) * 100) / 100)));
  }, []);

  // Load XLSX from server
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError('');
    fetch(`${HTTP_BASE}/api/excel/load?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) {
          setError(d.error);
          setLoading(false);
          return;
        }
        setData(d);
        setSelectedSheet(d.sheets?.[0]?.sheetName ?? '');
        setLoading(false);
      })
      .catch(e => {
        setError(String(e));
        setLoading(false);
      });
  }, [filePath]);

  const sheet: SheetData | null =
    data?.sheets?.find((s: any) => s.sheetName === selectedSheet) ?? null;

  const handleCellPatch = useCallback(
    (cellUpdates: Record<string, any>) => {
      if (!sheet) return;

      // Optimistic update for immediate UI feedback
      const mergedCells: Record<string, any> = { ...sheet.cells };
      for (const [ref, cd] of Object.entries(cellUpdates)) {
        mergedCells[ref] = { ...(mergedCells[ref] ?? {}), ...cd };
      }
      setData((prev: any) => ({
        ...prev,
        sheets: prev.sheets.map((s: any) =>
          s.sheetName === selectedSheet ? { ...s, cells: mergedCells } : s,
        ),
      }));

      // Convert API format {value, formula, fontBold, fontColor, bgColor, align}
      // to sidecar format {v, f, s} for the PATCH endpoint
      const sidecarCells: Record<string, any> = {};
      for (const [ref, cd] of Object.entries(cellUpdates)) {
        const sc: Record<string, any> = {};
        if ('value' in cd) sc.v = cd.value;
        if ('formula' in cd) sc.f = cd.formula;
        const style: Record<string, any> = {};
        if (cd.fontBold !== undefined) style.bold = cd.fontBold;
        if (cd.fontItalic !== undefined) style.italic = cd.fontItalic;
        // fontColor is FFRRGGBB; convert to #RRGGBB for sidecar storage
        const _fc = cd.fontColor ?? (cd as any).color;
        if (_fc !== undefined) {
          const _fcHex = String(_fc).replace(/^#/, '').replace(/^FF/i, '');
          style.fg = `#${_fcHex}`;
        }
        if (cd.bgPattern === 'NO_FILL') {
          style.bg = null; // explicit null = remove fill
        } else if (cd.bgColor !== undefined) {
          const _bgHex = String(cd.bgColor).replace(/^#/, '').replace(/^FF/i, '');
          style.bg = `#${_bgHex}`;
        }
        if (cd.align !== undefined) style.align = cd.align;
        if (cd.dataFormatString !== undefined) style.format = cd.dataFormatString;
        if (cd.wrapText !== undefined) style.wrap = cd.wrapText;
        if (cd.fontSize !== undefined) style.fontSize = cd.fontSize;
        if (Object.keys(style).length) sc.s = style;
        sidecarCells[ref] = sc;
      }

      fetch(`${HTTP_BASE}/api/excel/patch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, sheet: selectedSheet, cells: sidecarCells }),
      })
        .then(r => r.json())
        .then((d: any) => {
          if (!d.sheets) return;
          // Replace full state with server response (contains recalculated formula values)
          setData(d);
        })
        .catch(() => null);
    },
    [filePath, selectedSheet, sheet],
  );

  const handleGridChange = useCallback(
    (grid: any) => {
      if (!sheet) return;
      setData((prev: any) => ({
        ...prev,
        sheets: prev.sheets.map((s: any) =>
          s.sheetName === selectedSheet ? { ...s, ...grid } : s,
        ),
      }));
      fetch(`${HTTP_BASE}/api/excel/grid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          sheet: selectedSheet,
          columnIndexToWidth: grid.columnIndexToWidth ?? {},
          rowIndexToHeight: grid.rowIndexToHeight ?? {},
        }),
      }).catch(() => null);
    },
    [filePath, selectedSheet, sheet],
  );

  const handleMergeCells = useCallback(
    ({ action, ref, range }: { action: string; ref?: string; range?: string }) => {
      if (!sheet) return;
      const existing: string[] = sheet.mergedCellRanges ?? [];
      let newMerges: string[];
      if (action === 'unmerge' && ref) {
        newMerges = existing.filter((r: string) => r.toUpperCase() !== ref.toUpperCase());
      } else if (action === 'merge' && range) {
        const rangeUp = range.toUpperCase();
        newMerges = existing.includes(rangeUp) ? existing : [...existing, rangeUp];
      } else {
        return;
      }
      // Optimistic update
      setData((prev: any) => ({
        ...prev,
        sheets: prev.sheets.map((s: any) =>
          s.sheetName === selectedSheet ? { ...s, mergedCellRanges: newMerges } : s,
        ),
      }));
      fetch(`${HTTP_BASE}/api/excel/merge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, sheet: selectedSheet, mergedCells: newMerges }),
      })
        .then(r => r.json())
        .then((d: any) => {
          if (d.sheets) setData(d);
        })
        .catch(() => null);
    },
    [filePath, selectedSheet, sheet],
  );

  const handleRenameSheet = useCallback(
    (oldName: string, newName: string) => {
      setData((prev: any) => ({
        ...prev,
        sheets: prev.sheets.map((s: any) =>
          s.sheetName === oldName ? { ...s, sheetName: newName } : s,
        ),
      }));
      if (selectedSheet === oldName) setSelectedSheet(newName);
      fetch(`${HTTP_BASE}/api/excel/renamesheet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, oldName, newName }),
      }).catch(() => null);
    },
    [filePath, selectedSheet],
  );

  const handleAddSheet = useCallback(() => {
    if (!data) return;
    const existing = new Set(data.sheets.map((s: any) => s.sheetName));
    let n = (data.sheets.length as number) + 1;
    while (existing.has(`Sheet${n}`)) n++;
    const newName = `Sheet${n}`;
    setData((prev: any) => ({
      ...prev,
      sheets: [
        ...prev.sheets,
        {
          sheetName: newName,
          cells: {},
          columnIndexToWidth: {},
          rowIndexToHeight: {},
          images: [],
          hiddenColIndices: [],
          hiddenRowIndices: [],
          mergedCellIndices: [],
        },
      ],
    }));
    setSelectedSheet(newName);
    fetch(`${HTTP_BASE}/api/excel/addsheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, sheetName: newName }),
    }).catch(() => null);
  }, [data, filePath]);

  if (loading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-tertiary)',
          fontSize: 13,
        }}
      >
        Loading spreadsheet…
      </div>
    );
  if (error)
    return <div style={{ padding: 16, color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>;
  if (!data || !sheet) return null;

  const sheetNames: string[] = data.sheets?.map((s: any) => s.sheetName) ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-primary)',
        ...style,
      }}
    >
      {/* Canvas grid — lazy loaded */}
      <React.Suspense
        fallback={
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 13,
            }}
          >
            Rendering…
          </div>
        }
      >
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ExcelViewSheetArea
            sheetName={selectedSheet}
            cells={sheet.cells ?? {}}
            zoom={zoom}
            grid={{
              columnIndexToWidth: sheet.columnIndexToWidth ?? {},
              rowIndexToHeight: sheet.rowIndexToHeight ?? {},
              hiddenColIndices: sheet.hiddenColIndices ?? [],
              hiddenRowIndices: sheet.hiddenRowIndices ?? [],
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
            mergedCellRanges={sheet.mergedCellRanges ?? []}
            onMergeCells={handleMergeCells}
          />
        </div>
      </React.Suspense>

      {/* Sheet tabs — always visible like real Excel */}
      <React.Suspense fallback={null}>
        <ExcelSheetTabs
          sheetNames={sheetNames}
          selectedSheetName={selectedSheet}
          onSheetSelect={setSelectedSheet}
          onAddSheet={handleAddSheet}
          onRenameSheet={handleRenameSheet}
          zoom={zoom}
          onZoomChange={handleZoomChange}
        />
      </React.Suspense>
    </div>
  );
}
