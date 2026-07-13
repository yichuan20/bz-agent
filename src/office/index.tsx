/**
 * bz-office Word Document Editor — isolated module.
 *
 * This is the ONLY file the rest of bz-agent should import from.
 * All internal bz-office code lives under src/office/ and can be updated
 * independently without touching any other agent files.
 *
 * Usage:
 *   import { WordDocEditor, getDocFromBlocks, getBlocksFromDoc } from '#/office';
 *
 * Props (WordDocEditor):
 *   blocks     Block[]      — bz-office Block JSON array
 *   onChange   (Block[]) => void  — called when user edits
 *   readOnly?  boolean      — disable editing (default false)
 *   className? string
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DocAreaRaw from './components/DocArea';
import { getDocFromBlocks as _gdfb, getBlocksFromDoc as _gbfd } from './utils/word-coversion';
import WordDocToolbar from './components/WordDocToolbar';
import {
  getSelectionStyle,
  toggleStyle,
  addStyleField,
  setAlignment,
  setLineSpacing,
  setHeading,
  addBullet,
  removeBullet,
  addNumberedList,
  removeNumberedList,
  increaseIndent,
  decreaseIndent,
  isCursorInTable,
  insertTable,
  insertImage,
} from './utils/docUtils';
import { VIEW_W } from './utils/word-constants';
/* eslint-enable @typescript-eslint/no-explicit-any */

export type { Block, StyleRange } from '../components/BzDocEditor';

// Text column width in CSS px: (END_X - START_X) / SF = (VIEW_W - 100 - 95)
const TEXT_COL_WIDTH_PX = VIEW_W - 195;

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > TEXT_COL_WIDTH_PX) {
        h = Math.round(h * TEXT_COL_WIDTH_PX / w);
        w = TEXT_COL_WIDTH_PX;
      }
      resolve({ width: w, height: h });
    };
    img.onerror = () => resolve({ width: 64, height: 64 });
    img.src = url;
  });
}

// Internal opaque type for the bz-office Doc format
type OfficeDoc = Record<string, any>;

// Cast JS modules to avoid TS type inference errors on bz-office internals
const DocArea = DocAreaRaw as React.ComponentType<any>;
const getDocFromBlocks = _gdfb as (blocks?: any[]) => OfficeDoc;
const getBlocksFromDoc = _gbfd as (doc: any) => { blocks: any[] };
export { getDocFromBlocks, getBlocksFromDoc };

interface WordDocEditorProps {
  blocks:          import('../components/BzDocEditor').Block[];
  onChange?:       (blocks: import('../components/BzDocEditor').Block[]) => void;
  onCursorChange?: (cursor: { selStart: number; selEnd: number }) => void;
  initialCursor?:  { selStart: number; selEnd: number };
  defaultFont?:    string;
  readOnly?:       boolean;
  className?:      string;
  style?:          React.CSSProperties;
}

export function WordDocEditor({ blocks, onChange, onCursorChange, initialCursor, defaultFont, readOnly = false, className, style }: WordDocEditorProps) {
  const [doc, setDoc] = useState<OfficeDoc>(() => {
    const d = getDocFromBlocks(blocks ?? []) as OfficeDoc;
    // Always ensure selStart/selEnd are numeric — drawCaret check uses === so undefined breaks it
    d.selStart = initialCursor?.selStart ?? d.selStart ?? 0;
    d.selEnd   = initialCursor?.selEnd   ?? d.selEnd   ?? 0;
    return d;
  });
  const prevCursorRef = useRef<{ selStart: number; selEnd: number } | null>(null);

  // Sync from blocks prop only when it changes externally (initial load / agent edit).
  const prevBlocksRef = useRef(blocks);
  useEffect(() => {
    if (blocks !== prevBlocksRef.current) {
      prevBlocksRef.current = blocks;
      setDoc(getDocFromBlocks(blocks ?? []) as OfficeDoc);
    }
  }, [blocks]);

  // Track text+styles to detect real content changes vs selection-only updates.
  // Comparing selStart/selEnd is excluded: a pure cursor move must not trigger onChange
  // (it would cause blocks→doc round-trip that resets the cursor position).
  const lastContentRef = useRef<string>('');

  const applyDoc = useCallback((newDoc: OfficeDoc) => {
    setDoc(newDoc);
    // Fire onCursorChange whenever selStart/selEnd changes (cursor move or selection).
    if (onCursorChange) {
      const s = newDoc.selStart ?? 0;
      const e = newDoc.selEnd   ?? 0;
      const prev = prevCursorRef.current;
      if (!prev || prev.selStart !== s || prev.selEnd !== e) {
        prevCursorRef.current = { selStart: s, selEnd: e };
        onCursorChange({ selStart: s, selEnd: e });
      }
    }
    if (readOnly || !onChange) return;
    // Build a lightweight fingerprint of the document content (text + styles).
    // JSON.stringify on the full styles array is the safest comparison.
    const fingerprint = (newDoc?.text ?? '') + JSON.stringify(newDoc?.styles ?? []);
    if (fingerprint !== lastContentRef.current) {
      lastContentRef.current = fingerprint;
      const result = getBlocksFromDoc(newDoc);
      const newBlocks = result.blocks ?? [];
      prevBlocksRef.current = newBlocks;
      onChange(newBlocks);
    }
  }, [onChange, readOnly]);

  // Derive current formatting state from selection for toolbar
  const sel = getSelectionStyle(doc as any);

  const currentHeading = (() => {
    if (sel.isBold && sel.fontSize === 24) return 'Heading 1';
    if (sel.isBold && sel.fontSize === 20) return 'Heading 2';
    if (sel.isBold && sel.fontSize === 18) return 'Heading 3';
    return 'Body';
  })();

  // Toolbar command helpers — each applies a docUtils transform then propagates
  const cmd = useCallback((fn: (d: any) => any) => {
    if (readOnly) return;
    applyDoc(fn(doc));
  }, [doc, applyDoc, readOnly]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...style }}>
      {!readOnly && (
        <WordDocToolbar
          isBold={sel.isBold}
          isItalic={sel.isItalic}
          isUnderlined={sel.isUnderlined}
          isStrikethrough={sel.isStrikethrough}
          textColor={sel.textColor}
          bgColor={sel.bgColor}
          fontSize={sel.fontSize}
          fontFamily={sel.fontFamily || defaultFont || ''}
          alignment={sel.alignment}
          lineSpacing={sel.lineSpacing}
          heading={currentHeading}
          isBullet={sel.isBullet}
          isNumbered={sel.isNumbered}
          isInTable={isCursorInTable(doc as any)}
          onToggleBold={() => cmd(d => toggleStyle(d, 'isBold'))}
          onToggleItalic={() => cmd(d => toggleStyle(d, 'isItalic'))}
          onToggleUnderline={() => cmd(d => toggleStyle(d, 'isUnderlined'))}
          onToggleStrikethrough={() => cmd(d => toggleStyle(d, 'isStrikethrough'))}
          onSetTextColor={(color: string) => cmd(d => addStyleField(d, 'textColor', color))}
          onSetBgColor={(color: string) => cmd(d => addStyleField(d, 'bgColor', color))}
          onSetFontSize={(size: number) => cmd(d => addStyleField(d, 'fontSize', size))}
          onSetFontFamily={(family: string) => cmd(d => addStyleField(d, 'fontFamily', family))}
          onSetAlignment={(align: string) => cmd(d => setAlignment(d, align))}
          onSetLineSpacing={(spacing: number) => cmd(d => setLineSpacing(d, spacing))}
          onSetHeading={(level: string) => cmd(d => setHeading(d, level))}
          onToggleBullet={() => cmd(d => sel.isBullet ? removeBullet(d) : addBullet(d))}
          onToggleNumbered={() => cmd(d => sel.isNumbered ? removeNumberedList(d) : addNumberedList(d))}
          onIncreaseIndent={() => cmd(d => increaseIndent(d))}
          onDecreaseIndent={() => cmd(d => decreaseIndent(d))}
          onInsertTable={(rows: number, cols: number) => cmd(d => insertTable({ doc: d, rows, cols }))}
          onUploadImage={async (base64: string) => {
            const { width, height } = await loadImageDimensions(base64);
            cmd(d => insertImage({ doc: d, imageUrl: base64, width, height }));
          }}
          onNetworkImage={async ({ url, description }: { url: string; description: string }) => {
            const { width, height } = await loadImageDimensions(url);
            cmd(d => insertImage({ doc: d, imageUrl: url, description, width, height }));
          }}
        />
      )}
      {/* z-index: 0 keeps DocArea below the toolbar stacking context (z-index: 50)
          so toolbar dropdown menus appear above the canvas */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', zIndex: 0 }}>
        <DocArea
          className={className}
          doc={doc}
          onDocChange={applyDoc}
        />
      </div>
    </div>
  );
}
