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

// biome-ignore lint/suspicious/noExplicitAny: lazy-loaded JS component, no type declarations available
const ExcelViewSheetArea = React.lazy(() => import('./components/ExcelViewSheetArea')) as any;
// biome-ignore lint/suspicious/noExplicitAny: lazy-loaded JS component, no type declarations available
const ExcelSheetTabs = React.lazy(() => import('./components/ExcelSheetTabs')) as any;

import { HTTP_BASE } from '#/lib/api';

export interface ExcelEditorProps {
  filePath: string;
  style?: React.CSSProperties;
}

interface CellData {
  value?: string | number | boolean | null;
  formula?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontColor?: string;
  color?: string;
  bgColor?: string;
  bgPattern?: string;
  align?: string;
  dataFormatString?: string;
  wrapText?: boolean;
  fontSize?: number;
}

interface SidecarStyle {
  bold?: boolean;
  italic?: boolean;
  fg?: string;
  bg?: string | null;
  align?: string;
  format?: string;
  wrap?: boolean;
  fontSize?: number;
}

interface SidecarCell {
  v?: string | number | boolean | null;
  f?: string;
  s?: SidecarStyle;
}

interface SheetRecord {
  sheetName: string;
  cells?: Record<string, CellData>;
  mergedCellRanges?: string[];
  columnIndexToWidth?: Record<string, number>;
  rowIndexToHeight?: Record<string, number>;
  images?: unknown[];
  hiddenColIndices?: number[];
  hiddenRowIndices?: number[];
  mergedCellIndices?: unknown[];
}

interface ExcelApiData {
  sheets: SheetRecord[];
  error?: string;
}

interface GridUpdate {
  columnIndexToWidth?: Record<string, number>;
  rowIndexToHeight?: Record<string, number>;
}

export function ExcelEditor({ filePath, style }: ExcelEditorProps) {
  const [data, setData] = useState<ExcelApiData | null>(null);
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
    fetch(`${HTTP_BASE}/api/v1/excel/load?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then((d: ExcelApiData) => {
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

  const sheet: SheetRecord | null =
    data?.sheets?.find((s: SheetRecord) => s.sheetName === selectedSheet) ?? null;

  const handleCellPatch = useCallback(
    (cellUpdates: Record<string, CellData>) => {
      if (!sheet) return;

      // Optimistic update for immediate UI feedback
      const mergedCells: Record<string, CellData> = { ...sheet.cells };
      for (const [ref, cd] of Object.entries(cellUpdates)) {
        mergedCells[ref] = { ...(mergedCells[ref] ?? {}), ...cd };
      }
      setData(prev =>
        prev
          ? {
              ...prev,
              sheets: prev.sheets.map((s: SheetRecord) =>
                s.sheetName === selectedSheet ? { ...s, cells: mergedCells } : s,
              ),
            }
          : prev,
      );

      // Convert API format {value, formula, fontBold, fontColor, bgColor, align}
      // to sidecar format {v, f, s} for the PATCH endpoint
      const sidecarCells: Record<string, SidecarCell> = {};
      for (const [ref, cd] of Object.entries(cellUpdates)) {
        const sc: SidecarCell = {};
        if ('value' in cd) sc.v = cd.value;
        if ('formula' in cd) sc.f = cd.formula;
        const sidecarStyle: SidecarStyle = {};
        if (cd.fontBold !== undefined) sidecarStyle.bold = cd.fontBold;
        if (cd.fontItalic !== undefined) sidecarStyle.italic = cd.fontItalic;
        // fontColor is FFRRGGBB; convert to #RRGGBB for sidecar storage
        const _fc = cd.fontColor ?? cd.color;
        if (_fc !== undefined) {
          const _fcHex = String(_fc).replace(/^#/, '').replace(/^FF/i, '');
          sidecarStyle.fg = `#${_fcHex}`;
        }
        if (cd.bgPattern === 'NO_FILL') {
          sidecarStyle.bg = null; // explicit null = remove fill
        } else if (cd.bgColor !== undefined) {
          const _bgHex = String(cd.bgColor).replace(/^#/, '').replace(/^FF/i, '');
          sidecarStyle.bg = `#${_bgHex}`;
        }
        if (cd.align !== undefined) sidecarStyle.align = cd.align;
        if (cd.dataFormatString !== undefined) sidecarStyle.format = cd.dataFormatString;
        if (cd.wrapText !== undefined) sidecarStyle.wrap = cd.wrapText;
        if (cd.fontSize !== undefined) sidecarStyle.fontSize = cd.fontSize;
        if (Object.keys(sidecarStyle).length) sc.s = sidecarStyle;
        sidecarCells[ref] = sc;
      }

      fetch(`${HTTP_BASE}/api/v1/excel/patch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, sheet: selectedSheet, cells: sidecarCells }),
      })
        .then(r => r.json())
        .then((d: ExcelApiData) => {
          if (!d.sheets) return;
          // Replace full state with server response (contains recalculated formula values)
          setData(d);
        })
        .catch(() => null);
    },
    [filePath, selectedSheet, sheet],
  );

  const handleGridChange = useCallback(
    (grid: GridUpdate) => {
      if (!sheet) return;
      setData(prev =>
        prev
          ? {
              ...prev,
              sheets: prev.sheets.map((s: SheetRecord) =>
                s.sheetName === selectedSheet ? { ...s, ...grid } : s,
              ),
            }
          : prev,
      );
      fetch(`${HTTP_BASE}/api/v1/excel/grid`, {
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
      setData(prev =>
        prev
          ? {
              ...prev,
              sheets: prev.sheets.map((s: SheetRecord) =>
                s.sheetName === selectedSheet ? { ...s, mergedCellRanges: newMerges } : s,
              ),
            }
          : prev,
      );
      fetch(`${HTTP_BASE}/api/v1/excel/merge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, sheet: selectedSheet, mergedCells: newMerges }),
      })
        .then(r => r.json())
        .then((d: ExcelApiData) => {
          if (d.sheets) setData(d);
        })
        .catch(() => null);
    },
    [filePath, selectedSheet, sheet],
  );

  const handleRenameSheet = useCallback(
    (oldName: string, newName: string) => {
      setData(prev =>
        prev
          ? {
              ...prev,
              sheets: prev.sheets.map((s: SheetRecord) =>
                s.sheetName === oldName ? { ...s, sheetName: newName } : s,
              ),
            }
          : prev,
      );
      if (selectedSheet === oldName) setSelectedSheet(newName);
      fetch(`${HTTP_BASE}/api/v1/excel/renamesheet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, oldName, newName }),
      }).catch(() => null);
    },
    [filePath, selectedSheet],
  );

  const handleAddSheet = useCallback(() => {
    if (!data) return;
    const existing = new Set(data.sheets.map((s: SheetRecord) => s.sheetName));
    let n = (data.sheets.length as number) + 1;
    while (existing.has(`Sheet${n}`)) n++;
    const newName = `Sheet${n}`;
    setData(prev =>
      prev
        ? {
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
          }
        : prev,
    );
    setSelectedSheet(newName);
    fetch(`${HTTP_BASE}/api/v1/excel/addsheet`, {
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

  const sheetNames: string[] = data.sheets?.map((s: SheetRecord) => s.sheetName) ?? [];

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
