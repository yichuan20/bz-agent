/**
 * BzDocEditor — view and edit Word documents in the bz-office Block JSON format.
 *
 * Format reference:  bz-office/src/utils/word-coversion.jsx
 * Block types:       plain text, heading (via fontSize styleRange), bullet list,
 *                    numbered list, table cells grouped by tableId.
 *
 * Two modes:
 *   view  — rendered Word-like page (read only)
 *   edit  — per-block contentEditable inline editor + live preview
 */
import { useCallback, useRef } from 'react';

// ── Types (mirrors bz-office Block / StyleRange) ──────────────────────────────

export interface StyleRange {
  start: number;
  end: number;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderlined?: boolean;
  isStrikethrough?: boolean;
  fontSize?: number;
  textColor?: string;
  bgColor?: string;
  url?: string;
}

export interface Block {
  text: string;
  styles?: StyleRange[];
  indent?: number; // 0–8 indent levels
  prefix?: string; // '•' or '1.' etc.
  isTableCell?: boolean;
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
  numberOfRows?: number;
  numberOfColumns?: number;
}

// ── Style renderer ────────────────────────────────────────────────────────────

function applyStyles(text: string, styles: StyleRange[] = []): React.ReactNode {
  if (!styles.length) return text;
  const sorted = [...styles].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const sr of sorted) {
    if (cursor < sr.start) parts.push(text.slice(cursor, sr.start));
    const chunk = text.slice(sr.start, sr.end);
    const style: React.CSSProperties = {};
    if (sr.isBold) style.fontWeight = 700;
    if (sr.isItalic) style.fontStyle = 'italic';
    if (sr.isUnderlined) style.textDecoration = 'underline';
    if (sr.isStrikethrough) style.textDecoration = 'line-through';
    if (sr.fontSize) style.fontSize = sr.fontSize;
    if (sr.textColor) style.color = sr.textColor;
    if (sr.bgColor) style.background = sr.bgColor;

    const node = sr.url ? (
      <a key={sr.start} href={sr.url} target="_blank" rel="noreferrer" style={style}>
        {chunk}
      </a>
    ) : (
      <span key={sr.start} style={style}>
        {chunk}
      </span>
    );
    parts.push(node);
    cursor = sr.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// ── Block renderer (view mode) ────────────────────────────────────────────────

function BlockView({ block }: { block: Block }) {
  const styles = block.styles ?? [];
  const content = applyStyles(block.text, styles);
  const indent = (block.indent ?? 0) * 20;

  // Heading detection via leading bold+large fontSize style covering full text
  const headingSr = styles.find(
    sr => sr.isBold && sr.start === 0 && sr.end === block.text.length && (sr.fontSize ?? 0) >= 16,
  );
  if (headingSr) {
    const fs = headingSr.fontSize ?? 16;
    return (
      <div style={{ marginLeft: indent, marginTop: fs >= 22 ? 24 : 16, marginBottom: 6 }}>
        <span style={{ fontSize: fs, fontWeight: 700 }}>{block.text}</span>
      </div>
    );
  }

  // Bullet
  if (block.prefix) {
    return (
      <div style={{ marginLeft: indent + 16, display: 'flex', gap: 6, marginBottom: 4 }}>
        <span style={{ flexShrink: 0, userSelect: 'none' }}>{block.prefix}</span>
        <span>{content}</span>
      </div>
    );
  }

  return <p style={{ marginLeft: indent, marginBottom: 8 }}>{content || <br />}</p>;
}

function TableView({ cells }: { cells: Block[] }) {
  const nRows = cells[0]?.numberOfRows ?? 0;
  const nCols = cells[0]?.numberOfColumns ?? 0;
  const grid: Block[][] = Array.from({ length: nRows }, () => Array(nCols).fill({ text: '' }));
  for (const c of cells) (grid[c.rowIndex ?? 0] ?? [])[c.columnIndex ?? 0] = c;

  return (
    <table className="bzd-table">
      <tbody>
        {grid.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) =>
              ri === 0 ? <th key={ci}>{cell.text}</th> : <td key={ci}>{cell.text}</td>,
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Editable block (edit mode) ────────────────────────────────────────────────

function BlockEdit({
  block,
  index,
  onChange,
  onKeyDown,
}: {
  block: Block;
  index: number;
  onChange: (index: number, text: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: contentEditable requires a div
    <div
      role="textbox"
      aria-multiline="true"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      className="bzd-block-edit"
      style={{ marginLeft: (block.indent ?? 0) * 20 }}
      onInput={e => onChange(index, (e.currentTarget as HTMLDivElement).innerText)}
      onKeyDown={e => onKeyDown(e, index)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised HTML
      dangerouslySetInnerHTML={{ __html: block.text || '<br>' }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  blocks: Block[];
  mode: 'view' | 'edit';
  onChange?: (blocks: Block[]) => void;
}

export function BzDocEditor({ blocks, mode, onChange }: Props) {
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const handleTextChange = useCallback(
    (index: number, text: string) => {
      const next = blocksRef.current.map((b, i) => (i === index ? { ...b, text, styles: [] } : b));
      onChange?.(next);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const next = [...blocksRef.current];
        next.splice(index + 1, 0, { text: '', styles: [] });
        onChange?.(next);
        // Focus next block after render
        setTimeout(() => {
          const els = document.querySelectorAll<HTMLElement>('.bzd-block-edit');
          els[index + 1]?.focus();
        }, 0);
      }
      if (
        e.key === 'Backspace' &&
        (e.currentTarget as HTMLElement).innerText === '' &&
        blocksRef.current.length > 1
      ) {
        e.preventDefault();
        const next = blocksRef.current.filter((_, i) => i !== index);
        onChange?.(next);
        setTimeout(() => {
          const els = document.querySelectorAll<HTMLElement>('.bzd-block-edit');
          els[Math.max(0, index - 1)]?.focus();
        }, 0);
      }
    },
    [onChange],
  );

  // Group consecutive table cells by tableId
  const elements: React.ReactNode[] = [];
  const seenTables = new Set<string>();
  let bi = 0;

  while (bi < blocks.length) {
    const block = blocks[bi] ?? { text: '' };

    if (block.isTableCell && block.tableId) {
      if (!seenTables.has(block.tableId)) {
        seenTables.add(block.tableId);
        const tableCells = blocks.filter(b => b.tableId === block.tableId);
        elements.push(<TableView key={`table-${block.tableId}`} cells={tableCells} />);
      }
      bi++;
      continue;
    }

    if (mode === 'edit') {
      elements.push(
        <BlockEdit
          key={bi}
          block={block}
          index={bi}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
        />,
      );
    } else {
      elements.push(<BlockView key={bi} block={block} />);
    }
    bi++;
  }

  return <div className="bzd-content">{elements}</div>;
}
