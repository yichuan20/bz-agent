/**
 * EditorPanel — VS Code-style dark editor for worker/coder modes.
 *
 * Syntax highlighting uses the overlay technique:
 *   - bottom layer: <pre> with coloured <span>s (pointer-events:none)
 *   - top layer: transparent <textarea> that captures all input
 *   - both share identical font/padding so they stay pixel-aligned
 *   - the outer div scrolls; both layers follow
 */

import { parseMarkdownToHTML } from '@boltzbit/md-utils';
import { SidebarSimpleIcon, XIcon } from '@phosphor-icons/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExcelEditor } from '#/excel';
import { type Block, WordDocEditor } from '#/office';
import { PptEditor } from '#/ppt';

const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const EXCEL_EXTS = new Set(['xls', 'xlsx']);
const PPT_EXTS = new Set(['ppt', 'pptx']);
const HTML_EXTS = new Set(['html', 'htm']);
const MD_EXTS = new Set(['md', 'markdown']);
const PDF_EXTS = new Set(['pdf']);
function isDocExt(name: string) {
  return DOC_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
}
function isExcelExt(name: string) {
  return EXCEL_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
}
function isPptExt(name: string) {
  return PPT_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
}
function isHtmlExt(name: string) {
  return HTML_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
}
function isMarkdownExt(name: string) {
  return MD_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
}
function isPdfExt(name: string) {
  return PDF_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
}
const DOC_ICONS: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  doc: '📝',
  xlsx: '📊',
  xls: '📊',
  pptx: '📑',
  excel: '📊',
  ppt: '📑',
  html: '🌐',
  htm: '🌐',
  markdown: '🗒',
  md: '🗒',
};

import { HTTP_BASE, listFiles as apiListFiles, readFile as apiReadFile, writeFile as apiWriteFile, deleteFile as apiDeleteFile, makeDir as apiMakeDir } from '#/lib/api';
// HTTP_BASE imported from '#/lib/api'

// Structural colours come from CSS variables (theme-adaptive).
// Token colours are handled by .tok-* CSS classes in app.css.
const FOLDER_COLOR = 'var(--accent-orange)';

// ── File-type icon palette (VS Code-inspired colours per extension) ────────────
const EXT_COLOR: Record<string, string> = {
  html: '#E34C26',
  htm: '#E34C26',
  css: '#264DE4',
  scss: '#CC6699',
  sass: '#CC6699',
  less: '#1D365D',
  js: '#F7DF1E',
  jsx: '#61DAFB',
  mjs: '#F7DF1E',
  cjs: '#F7DF1E',
  ts: '#3178C6',
  tsx: '#3178C6',
  py: '#3776AB',
  pyw: '#3776AB',
  ipynb: '#F37626',
  json: '#CBCB41',
  jsonc: '#CBCB41',
  yaml: '#CC3D47',
  yml: '#CC3D47',
  toml: '#9C4221',
  env: '#ECD53F',
  ini: '#9C4221',
  md: '#519ABA',
  markdown: '#519ABA',
  mdx: '#0088CC',
  txt: '#6B7280',
  rst: '#6B7280',
  pdf: '#E53E3E',
  docx: '#1473df',
  doc: '#1473df',
  xlsx: '#22c55e',
  xls: '#22c55e',
  csv: '#22c55e',
  pptx: '#f97316',
  ppt: '#f97316',
  png: '#A855F7',
  jpg: '#A855F7',
  jpeg: '#A855F7',
  gif: '#A855F7',
  webp: '#A855F7',
  svg: '#FFB13B',
  ico: '#A855F7',
  bmp: '#A855F7',
  sh: '#4EAA25',
  bash: '#4EAA25',
  zsh: '#4EAA25',
  fish: '#4EAA25',
  zip: '#F59E0B',
  tar: '#F59E0B',
  gz: '#F59E0B',
  rar: '#F59E0B',
  xml: '#F16529',
  sql: '#CC2927',
  go: '#00ADD8',
  rs: '#DEA584',
  java: '#B07219',
  kt: '#A97BFF',
  rb: '#701516',
  php: '#777BB3',
  cpp: '#F34B7D',
  cs: '#178600',
  swift: '#FA7343',
  dart: '#40C4FF',
  r: '#276DC3',
  lua: '#000080',
  c: '#A9B7C6',
  h: '#A9B7C6',
};
const SPECIAL_FILE_COLOR: Record<string, string> = {
  dockerfile: '#2496ED',
  makefile: '#6D8086',
  '.gitignore': '#F14E32',
  '.env': '#ECD53F',
  '.gitattributes': '#F14E32',
};
const SPECIAL_FOLDER_COLOR: Record<string, string> = {
  src: '#E8834D',
  source: '#E8834D',
  dist: '#E8C84D',
  build: '#E8C84D',
  out: '#E8C84D',
  output: '#E8C84D',
  node_modules: '#8B8B8B',
  public: '#67C3C8',
  static: '#67C3C8',
  assets: '#67C3C8',
  test: '#6DBF6D',
  tests: '#6DBF6D',
  __tests__: '#6DBF6D',
  spec: '#6DBF6D',
  docs: '#519ABA',
  doc: '#519ABA',
  documentation: '#519ABA',
  config: '#9BA8B5',
  configs: '#9BA8B5',
  scripts: '#A855F7',
  script: '#A855F7',
  components: '#61DAFB',
  pages: '#61DAFB',
  views: '#61DAFB',
  api: '#FF7A18',
  routes: '#FF7A18',
  controllers: '#FF7A18',
  models: '#FC836F',
  types: '#3178C6',
  interfaces: '#3178C6',
  hooks: '#9C6ADE',
  utils: '#F7C948',
  helpers: '#F7C948',
  lib: '#F7C948',
  styles: '#CC6699',
  images: '#A855F7',
  img: '#A855F7',
  icons: '#A855F7',
  data: '#48B5DB',
  db: '#CC2927',
  '.git': '#F14E32',
  '.github': '#F14E32',
};

const APP_ICON_STROKE = {
  fill: 'none' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.75,
};

function FileTypeIcon({ name, size = 13 }: { name: string; size?: number }) {
  const lower = name.toLowerCase();
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : '';
  const color = SPECIAL_FILE_COLOR[lower] ?? EXT_COLOR[ext] ?? '#6B7280';

  // Design-spec line-art icons for the three app types
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
        stroke="#22c55e"
        {...APP_ICON_STROKE}
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    );
  }
  if (ext === 'docx' || ext === 'doc') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
        stroke="#1473df"
        {...APP_ICON_STROKE}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }
  if (ext === 'pptx' || ext === 'ppt') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
        stroke="#f97316"
        {...APP_ICON_STROKE}
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2 2C2 1.45 2.45 1 3 1H9L13 5V12C13 12.55 12.55 13 12 13H3C2.45 13 2 12.55 2 12V2Z"
        fill={color}
      />
      <path d="M9 1L13 5H9.5C9.22 5 9 4.78 9 4.5V1Z" fill="white" fillOpacity="0.25" />
    </svg>
  );
}

function FolderTypeIcon({ name, open, size = 13 }: { name: string; open: boolean; size?: number }) {
  const color = SPECIAL_FOLDER_COLOR[name.toLowerCase()] ?? FOLDER_COLOR;
  // Single path: tab on top-left + body, open variant is slightly brighter
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 3C1.22 3 1 3.22 1 3.5V11.5C1 11.78 1.22 12 1.5 12H12.5C12.78 12 13 11.78 13 11.5V4.5H7L6 3H1.5Z"
        fill={color}
        fillOpacity={open ? 1 : 0.82}
      />
    </svg>
  );
}

// ── Identical font settings used by BOTH the highlight layer and the textarea ─
const FONT_STYLE = {
  fontFamily: "'Martian Mono','Cascadia Code','Fira Code',ui-monospace,monospace",
  fontSize: '12.5px',
  lineHeight: '22px',
  tabSize: 2,
} as const;
const PAD = { top: 10, right: 32, bottom: 32, left: 0 };

// ── Syntax tokeniser (ported from bz-codespace) ───────────────────────────────
type TokType =
  | 'comment'
  | 'string'
  | 'keyword'
  | 'builtin'
  | 'number'
  | 'fn'
  | 'decorator'
  | 'plain';
interface Tok {
  type: TokType;
  text: string;
}

const TS_KW = new Set(
  'break case catch class const continue default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await from as declare interface type enum namespace readonly abstract implements satisfies'.split(
    ' ',
  ),
);
const TS_B = new Set(
  'string number boolean any never unknown object undefined null true false Array Promise Record Partial Required Readonly Map Set Date Error Symbol void React'.split(
    ' ',
  ),
);
const PY_KW = new Set(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self cls'.split(
    ' ',
  ),
);

// Token type → CSS class (colours defined in app.css, theme-adaptive)
const TOK_CLASS: Record<TokType, string> = {
  comment: 'tok-comment',
  string: 'tok-string',
  keyword: 'tok-keyword',
  builtin: 'tok-builtin',
  number: 'tok-number',
  fn: 'tok-fn',
  decorator: 'tok-decorator',
  plain: 'tok-plain',
};

function getExt(n: string) {
  return n.split('.').pop()?.toLowerCase() ?? '';
}

function tokenizeLine(line: string, ext: string): Tok[] {
  const tokens: Tok[] = [];
  const isPy = ext === 'py';
  const isTs = ['ts', 'tsx', 'js', 'jsx'].includes(ext);
  let i = 0;
  const len = line.length;
  while (i < len) {
    const ch = line.charAt(i);
    if (isTs && ch === '/' && line.charAt(i + 1) === '/') {
      tokens.push({ type: 'comment', text: line.slice(i) });
      break;
    }
    if ((isPy || ext === 'yaml' || ext === 'yml') && ch === '#') {
      tokens.push({ type: 'comment', text: line.slice(i) });
      break;
    }
    if (isTs && ch === '/' && line.charAt(i + 1) === '*') {
      const end = line.indexOf('*/', i + 2);
      const text = end === -1 ? line.slice(i) : line.slice(i, end + 2);
      tokens.push({ type: 'comment', text });
      i += text.length;
      continue;
    }
    if (isPy && ch === '@') {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_.]/.test(line.charAt(j))) j++;
      tokens.push({ type: 'decorator', text: line.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < len) {
        if (line.charAt(j) === '\\') {
          j += 2;
          continue;
        }
        if (line.charAt(j) === ch) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: 'string', text: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/\d/.test(ch) && (i === 0 || !/[a-zA-Z_$]/.test(line.charAt(i - 1)))) {
      let j = i;
      while (j < len && /[\d.xXbBoO_a-fA-FnN]/.test(line.charAt(j))) j++;
      tokens.push({ type: 'number', text: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_$]/.test(line.charAt(j))) j++;
      const word = line.slice(i, j);
      const isFn = line.charAt(j) === '(';
      let type: TokType = 'plain';
      if (isTs) {
        if (TS_KW.has(word)) type = 'keyword';
        else if (TS_B.has(word)) type = 'builtin';
        else if (isFn) type = 'fn';
        else if (/^[A-Z]/.test(word)) type = 'builtin';
      } else if (isPy) {
        if (PY_KW.has(word)) type = 'keyword';
        else if (isFn) type = 'fn';
        else if (/^[A-Z]/.test(word)) type = 'builtin';
      }
      tokens.push({ type, text: word });
      i = j;
      continue;
    }
    tokens.push({ type: 'plain', text: ch });
    i++;
  }
  return tokens;
}

// Line-number column width (px) — must equal textarea paddingLeft exactly.
// Fixed so the code text always starts at the same x regardless of line count.
const LN_WIDTH = 56; // 8 left padding + ~30px text (up to 4 digits) + 18 right gap

// ── Highlight layer ───────────────────────────────────────────────────────────
// Uses a <pre> with one <div> per line so every row has exactly the same
// height as the textarea rows — ensuring vertical AND horizontal alignment.
function HighlightLayer({ content, filename }: { content: string; filename: string }) {
  const ext = getExt(filename);
  const lines = content.split('\n');
  return (
    <pre
      style={{
        // Must match textarea exactly: same position, same padding, same font
        position: 'absolute',
        inset: 0,
        margin: 0,
        paddingTop: PAD.top,
        paddingRight: PAD.right,
        paddingBottom: PAD.bottom,
        paddingLeft: 0, // line numbers handle the left indent
        ...FONT_STYLE,
        pointerEvents: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre',
        wordBreak: 'normal',
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', lineHeight: FONT_STYLE.lineHeight }}>
          {/* Fixed-width line number — always LN_WIDTH px wide */}
          <span
            style={{
              display: 'inline-block',
              width: LN_WIDTH,
              flexShrink: 0,
              textAlign: 'right',
              paddingRight: 18,
              fontSize: '11px',
              userSelect: 'none' as const,
              lineHeight: FONT_STYLE.lineHeight,
            }}
          >
            {i + 1}
          </span>
          {/* Syntax-coloured code — className drives colour via app.css (theme-adaptive) */}
          <span className="tok-plain" style={{ flex: 1 }}>
            {line === ''
              ? ' '
              : tokenizeLine(line, ext).map((tok, j) => (
                  <span key={j} className={TOK_CLASS[tok.type]}>
                    {tok.text}
                  </span>
                ))}
          </span>
        </div>
      ))}
    </pre>
  );
}

// ── File tree ─────────────────────────────────────────────────────────────────
type FsEntry = { name: string; path: string; isDir: boolean };

// entry=null means the user right-clicked on empty space; targetDir is the directory to act on
interface CtxMenu {
  x: number;
  y: number;
  entry: FsEntry | null;
  targetDir: string;
}

function TreeNode({
  entry,
  depth,
  selected,
  onSelect,
  ctxMenu,
  onCtxMenu,
  renamingPath,
  onRenameCommit,
  onRefresh,
  processingPptx,
}: {
  entry: FsEntry;
  depth: number;
  selected: string | null;
  onSelect: (p: string) => void;
  ctxMenu: CtxMenu | null;
  onCtxMenu: (e: React.MouseEvent, entry: FsEntry) => void;
  renamingPath: string | null;
  onRenameCommit: (entry: FsEntry, newName: string) => void;
  onRefresh: () => void;
  processingPptx: Set<string>;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [kids, setKids] = useState<FsEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const isActive = entry.path === selected && !entry.isDir;
  const isRenaming = renamingPath === entry.path;
  const isProcessing = !entry.isDir && processingPptx.has(entry.path);

  function load() {
    if (loaded || loading) return;
    setLoading(true);
    const HIDDEN = new Set([
      '.git',
      'node_modules',
      '__pycache__',
      '.venv',
      '.bzhub',
      'dist',
      '.next',
      '.turbo',
    ]);
    apiListFiles(HTTP_BASE, entry.path)
      .then((entries) => {
        setKids((entries ?? []).filter(e => !e.name.startsWith('.') && !HIDDEN.has(e.name)));
        setLoaded(true);
        setLoading(false);
      })
      .catch(() => {
        setLoaded(true);
        setLoading(false);
      });
  }

  useEffect(() => {
    if (open && !loaded) load();
    // biome-ignore lint/correctness/useExhaustiveDependencies: load stable
  }, [open, load, loaded]);

  // Focus rename input when it appears
  useEffect(() => {
    if (isRenaming) {
      setRenameVal(entry.name);
      setTimeout(() => {
        renameRef.current?.select();
      }, 50);
    }
  }, [isRenaming, entry.name]);

  const toggle = () => {
    setOpen(v => !v);
  };
  const name = entry.name || entry.path.split('/').filter(Boolean).pop() || entry.path;

  return (
    <div>
      <button
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          borderRadius: 3,
          cursor: 'pointer',
          background: isActive ? 'rgba(86,156,214,0.18)' : 'transparent',
          color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
          fontSize: 12,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          border: 'none',
          outline: 'none',
          textAlign: 'left',
        }}
        onClick={() => {
          if (!isRenaming && !isProcessing) {
            entry.isDir ? toggle() : onSelect(entry.path);
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (!isRenaming && !isProcessing) {
              entry.isDir ? toggle() : onSelect(entry.path);
            }
          }
        }}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          onCtxMenu(e, entry);
        }}
        onMouseEnter={e => {
          if (!isActive)
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={e => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        {entry.isDir ? (
          <FolderTypeIcon name={entry.name} open={open} size={13} />
        ) : (
          <FileTypeIcon name={entry.name} size={13} />
        )}
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onRenameCommit(entry, renameVal);
              }
              if (e.key === 'Escape') onRenameCommit(entry, entry.name); // cancel
            }}
            onBlur={() => onRenameCommit(entry, renameVal)}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--accent-blue)',
              borderRadius: 3,
              padding: '1px 4px',
              outline: 'none',
            }}
          />
        ) : (
          <>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              {name}
            </span>
            {isProcessing && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--accent-orange)',
                  marginLeft: 4,
                  flexShrink: 0,
                }}
              >
                ⟳ Processing…
              </span>
            )}
          </>
        )}
      </button>
      {entry.isDir && open && loading && (
        <div
          style={{
            padding: `2px 8px 2px ${8 + (depth + 1) * 14}px`,
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Loading…
        </div>
      )}
      {entry.isDir &&
        open &&
        !loading &&
        kids.map(k => (
          <TreeNode
            key={k.path}
            entry={k}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            ctxMenu={ctxMenu}
            onCtxMenu={onCtxMenu}
            renamingPath={renamingPath}
            onRenameCommit={onRenameCommit}
            onRefresh={onRefresh}
            processingPptx={processingPptx}
          />
        ))}
    </div>
  );
}

// ── Editor panel ──────────────────────────────────────────────────────────────
interface Tab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  // 'word'|'docx'|'doc' for Word docs (blocks), 'excel' for spreadsheets, 'ppt' for presentations, 'pdf' for PDFs
  docType?: string;
  docPages?: number;
  docWordCount?: number;
  docTruncated?: boolean;
  // Word files only — bz-office Block[] format
  blocks?: Block[];
  defaultFont?: string;
}

interface Props {
  cwd: string;
  codeMode: boolean;
  refreshKey?: number;
  sessionId?: string | null;
  isStreaming?: boolean;
}

export function EditorPanel({ cwd, codeMode, refreshKey, sessionId, isStreaming }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragTab, setDragTab] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [cursors, setCursors] = useState<Record<string, { selStart: number; selEnd: number }>>({});
  const cursorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const docAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTree, setShowTree] = useState(true);
  const [processingPptx, setProcessingPptx] = useState<Set<string>>(new Set());
  const processingPollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [newFolderDir, setNewFolderDir] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadDirRef = useRef<string>(cwd);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const lastRestoredSession = useRef<string | null>(null);
  const isRestoringRef = useRef(false);
  const pptSaveRef = useRef<(() => void) | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const startPptxPolling = useCallback((filePath: string) => {
    setProcessingPptx(prev => new Set(prev).add(filePath));
    const poll = () => {
      fetch(`${HTTP_BASE}/api/ppt/status?path=${encodeURIComponent(filePath)}`)
        .then(r => r.json())
        .then((d: { ready?: boolean }) => {
          if (d.ready) {
            setProcessingPptx(prev => {
              const n = new Set(prev);
              n.delete(filePath);
              return n;
            });
            delete processingPollTimers.current[filePath];
            setTreeVersion(v => v + 1);
          } else {
            processingPollTimers.current[filePath] = setTimeout(poll, 1500);
          }
        })
        .catch(() => {
          processingPollTimers.current[filePath] = setTimeout(poll, 2000);
        });
    };
    processingPollTimers.current[filePath] = setTimeout(poll, 800);
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      try {
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('dir', uploadDirRef.current);
          const r = await fetch(`${HTTP_BASE}/api/file/upload`, { method: 'POST', body: fd });
          const d = (await r.json()) as { ok?: boolean; path?: string; pptProcessing?: boolean };
          if (d.pptProcessing && d.path) startPptxPolling(d.path);
        }
        setTreeVersion(v => v + 1);
      } finally {
        if (uploadRef.current) uploadRef.current.value = '';
      }
    },
    [startPptxPolling],
  );

  const handleCtxMenu = useCallback(
    (e: React.MouseEvent, entry: FsEntry) => {
      e.preventDefault();
      const targetDir = entry.isDir ? entry.path : entry.path.replace(/\/[^/]+$/, '') || cwd;
      setCtxMenu({ x: e.clientX, y: e.clientY, entry, targetDir });
    },
    [cwd],
  );

  const handleTreeBgCtxMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, entry: null, targetDir: cwd });
    },
    [cwd],
  );

  const handleRenameCommit = useCallback(
    async (entry: FsEntry, newName: string) => {
      setRenamingPath(null);
      if (!newName || newName === entry.name) return;
      await fetch(`${HTTP_BASE}/api/file/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, newName }),
      }).catch(() => null);
      setTreeVersion(v => v + 1);
      // Update any open tab for this file
      const newPath = entry.path.replace(/[^/]+$/, newName);
      setTabs(prev =>
        prev.map(t => (t.path === entry.path ? { ...t, path: newPath, name: newName } : t)),
      );
      if (activeTab === entry.path) setActiveTab(newPath);
    },
    [activeTab],
  );

  const doCtxAction = useCallback(
    async (action: string, menu: CtxMenu) => {
      setCtxMenu(null);
      const { entry, targetDir } = menu;
      if (action === 'open') {
        if (entry && !entry.isDir) await openFile(entry.path);
      } else if (action === 'rename') {
        if (entry) setRenamingPath(entry.path);
      } else if (action === 'duplicate') {
        if (!entry) return;
        await fetch(`${HTTP_BASE}/api/file/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: entry.path }),
        }).catch(() => null);
        setTreeVersion(v => v + 1);
      } else if (action === 'download') {
        if (!entry) return;
        const a = document.createElement('a');
        a.href = `${HTTP_BASE}/api/file/download?path=${encodeURIComponent(entry.path)}`;
        a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (action === 'upload') {
        uploadDirRef.current = targetDir;
        uploadRef.current?.click();
      } else if (action === 'new-folder') {
        setNewFolderDir(targetDir);
        setNewFolderName('');
        setTimeout(() => newFolderInputRef.current?.focus(), 50);
      } else if (action === 'delete') {
        const label = entry ? entry.name : (targetDir.split('/').pop() ?? targetDir);
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        const deletePath = entry ? entry.path : targetDir;
        await apiDeleteFile(HTTP_BASE, deletePath).catch(() => null);
        setTreeVersion(v => v + 1);
        if (entry && !entry.isDir) {
          setTabs(prev => prev.filter(t => t.path !== entry.path));
          if (activeTab === entry.path) setActiveTab(null);
        }
      }
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: openFile stable
    [activeTab, openFile],
  );

  // The outer scrollable div — both highlight and textarea scroll with it
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const rootEntry: FsEntry = {
    name: cwd.split('/').filter(Boolean).pop() ?? cwd,
    path: cwd,
    isDir: true,
  };

  // Listen for open-file events dispatched from chat "Open" buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail?.path;
      if (path) void openFile(path);
    };
    window.addEventListener('open-file', handler);
    return () => window.removeEventListener('open-file', handler);
    // biome-ignore lint/correctness/useExhaustiveDependencies: openFile stable
  }, [openFile]);
  const currentTab = tabs.find(t => t.path === activeTab) ?? null;

  // Open a file: fetch content and add a tab
  async function openFile(filePath: string) {
    if (processingPptx.has(filePath)) {
      setError('Slides are still being processed — please wait a moment.');
      return;
    }
    const existing = tabs.find(t => t.path === filePath);
    if (existing) {
      // Excel/PPT tabs load data from the server — close and reopen to get fresh data
      // (avoids showing stale error state after server restart)
      if (existing.docType === 'excel' || existing.docType === 'ppt') {
        setTabs(prev => prev.filter(t => t.path !== filePath));
        // fall through to reopen below
      } else {
        setError('');
        setActiveTab(filePath);
        return;
      }
    }
    setError('');
    const name = filePath.split('/').pop() ?? filePath;
    try {
      // Excel files: ExcelEditor loads data internally — just open a tab with the path
      if (isExcelExt(name)) {
        setTabs(prev => [
          ...prev,
          { path: filePath, name, content: '', dirty: false, docType: 'excel' },
        ]);
        setActiveTab(filePath);
        return;
      }
      if (isPptExt(name)) {
        setTabs(prev => [
          ...prev,
          { path: filePath, name, content: '', dirty: false, docType: 'ppt' },
        ]);
        setActiveTab(filePath);
        return;
      }
      if (isPdfExt(name)) {
        setTabs(prev => [
          ...prev,
          { path: filePath, name, content: '', dirty: false, docType: 'pdf' },
        ]);
        setActiveTab(filePath);
        return;
      }
      if (isHtmlExt(name)) {
        const d = await apiReadFile(HTTP_BASE, filePath);
        setTabs(prev => [
          ...prev,
          { path: filePath, name, content: d.content ?? '', dirty: false, docType: 'html' },
        ]);
        setActiveTab(filePath);
        return;
      }
      if (isMarkdownExt(name)) {
        const d = await apiReadFile(HTTP_BASE, filePath);
        setTabs(prev => [
          ...prev,
          { path: filePath, name, content: d.content ?? '', dirty: false, docType: 'markdown' },
        ]);
        setActiveTab(filePath);
        return;
      }
      if (isDocExt(name)) {
        const r = await fetch(`${HTTP_BASE}/api/doc/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath }),
        });
        const d = (await r.json()) as {
          content?: string;
          blocks?: Block[];
          type?: string;
          pages?: number;
          wordCount?: number;
          truncated?: boolean;
          error?: string;
          defaultFont?: string;
        };
        if (d.error) {
          setError(d.error);
          return;
        }
        // Reset cursor to 0 on fresh open so it's always in the visible viewport.
        // The in-memory cursors map is also cleared so a re-open starts fresh.
        setCursors(prev => {
          const n = { ...prev };
          delete n[filePath];
          return n;
        });
        setTabs(prev => [
          ...prev,
          {
            path: filePath,
            name,
            content: d.content ?? '',
            dirty: false,
            docType: d.type,
            docPages: d.pages,
            docWordCount: d.wordCount,
            docTruncated: d.truncated,
            blocks: d.blocks,
            defaultFont: d.defaultFont,
          },
        ]);
      } else {
        const d = await apiReadFile(HTTP_BASE, filePath);
        setTabs(prev => [
          ...prev,
          { path: filePath, name, content: d.content ?? '', dirty: false },
        ]);
      }
      setActiveTab(filePath);
    } catch (e) {
      setError(String(e));
    }
  }

  // Persist open tabs to localStorage whenever tabs or activeTab change
  useEffect(() => {
    if (!sessionId || isRestoringRef.current) return;
    if (lastRestoredSession.current !== sessionId) return; // session not yet restored — don't clobber new session's saved tabs with stale ones
    if (tabs.length === 0) return; // don't overwrite saved state with empty
    localStorage.setItem(
      `bz-editor-tabs-${sessionId}`,
      JSON.stringify({ paths: tabs.map(t => t.path), activeTab }),
    );
  }, [tabs, activeTab, sessionId]);

  // Restore open tabs when sessionId changes (including initial mount)
  useEffect(() => {
    if (!sessionId || lastRestoredSession.current === sessionId) return;
    lastRestoredSession.current = sessionId;
    isRestoringRef.current = true;
    setTabs([]);
    setActiveTab(null);
    const saved = localStorage.getItem(`bz-editor-tabs-${sessionId}`);
    if (!saved) {
      isRestoringRef.current = false;
      return;
    }
    try {
      const { paths, activeTab: savedActive } = JSON.parse(saved) as {
        paths: string[];
        activeTab: string | null;
      };
      if (!paths?.length) {
        isRestoringRef.current = false;
        return;
      }
      const restoringForSession = sessionId;
      void (async () => {
        for (const p of paths) {
          if (lastRestoredSession.current !== restoringForSession) break; // session switched mid-restore
          await openFile(p);
        }
        if (lastRestoredSession.current === restoringForSession && savedActive)
          setActiveTab(savedActive);
        isRestoringRef.current = false;
      })();
    } catch {
      isRestoringRef.current = false;
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: openFile stable
  }, [sessionId, openFile]);

  // Reload active file and refresh file tree when agent finishes a turn (increments refreshKey)
  // Skip document files — they use /api/doc/parse and raw bytes would overwrite parsed content
  useEffect(() => {
    if (refreshKey === 0) return; // skip initial mount
    setTreeVersion(v => v + 1);
    if (!activeTab) return;
    const currentTabData = tabs.find(t => t.path === activeTab);
    if (currentTabData?.docType && currentTabData.docType !== 'markdown') return; // doc/pdf/html — don't reload raw bytes
    apiReadFile(HTTP_BASE, activeTab)
      .then((d) => {
        if (d.content !== undefined)
          setTabs(prev =>
            prev.map(t =>
              t.path === activeTab && !t.dirty ? { ...t, content: d.content ?? '' } : t,
            ),
          );
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, activeTab, tabs.find]);

  // Poll file tree every 3 s while the agent is actively working
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setTreeVersion(v => v + 1), 3000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Resize textarea to match content so the outer div scrolls (not the textarea itself)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '1px';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  function closeTab(e: React.MouseEvent, path: string) {
    e.stopPropagation();
    const idx = tabs.findIndex(t => t.path === path);
    const next = tabs.filter(t => t.path !== path);
    if (activeTab === path) setActiveTab(next[Math.max(0, idx - 1)]?.path ?? null);
    setTabs(next);
  }

  // Called by WordDocEditor on every cursor/selection change.
  // Updates in-memory map immediately; debounces server save to avoid flooding.
  const handleCursorChange = useCallback(
    (path: string, cursor: { selStart: number; selEnd: number }) => {
      setCursors(prev => ({ ...prev, [path]: cursor }));
      // Debounce: cancel previous timer for this path
      if (cursorSaveTimers.current[path]) clearTimeout(cursorSaveTimers.current[path]);
      cursorSaveTimers.current[path] = setTimeout(() => {
        fetch(`${HTTP_BASE}/api/doc/cursor`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, ...cursor }),
        }).catch(() => null);
      }, 500);
    },
    [],
  );

  async function saveTab(tab: Tab) {
    if (tab.docType === 'ppt') {
      pptSaveRef.current?.();
      return;
    }
    if (tab.docType === 'excel') return; // ExcelEditor manages its own save
    if (tab.docType === 'pdf' || tab.docType === 'html') return; // read-only viewers
    if (tab.docType === 'markdown') {
      await apiWriteFile(HTTP_BASE, tab.path, tab.content);
      return;
    }
    if (tab.docType) {
      const body = tab.blocks
        ? { path: tab.path, blocks: tab.blocks }
        : { path: tab.path, content: tab.content };
      const r = await fetch(`${HTTP_BASE}/api/doc/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.error) throw new Error(d.error);
    } else {
      await apiWriteFile(HTTP_BASE, tab.path, tab.content);
    }
  }

  async function save() {
    if (!currentTab?.dirty) return;
    if (currentTab.docType === 'ppt') {
      pptSaveRef.current?.();
      return;
    }
    if (currentTab.docType === 'excel') return;
    setSaving(true);
    setError('');
    try {
      await saveTab(currentTab);
      setTabs(prev => prev.map(t => (t.path === activeTab ? { ...t, dirty: false } : t)));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    const dirty = tabs.filter(t => t.dirty);
    if (!dirty.length) return;
    setSaving(true);
    setError('');
    try {
      const regular = dirty.filter(t => t.docType !== 'excel' && t.docType !== 'ppt');
      await Promise.all(regular.map(t => saveTab(t)));
      setTabs(prev =>
        prev.map(t => (regular.some(d => d.path === t.path) ? { ...t, dirty: false } : t)),
      );
      // PPT saves via its own imperative ref (only works when that tab is active)
      if (dirty.some(t => t.docType === 'ppt') && pptSaveRef.current) pptSaveRef.current();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // Shared inline style for both highlight layer and textarea
  const editorFont: React.CSSProperties = {
    ...FONT_STYLE,
    letterSpacing: 0,
    wordSpacing: 0,
  };

  // ── Preview mode — full-panel iframe replacing editor + file tree ──────────
  if (previewUrl) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-primary)',
        }}
      >
        {/* Preview toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-primary)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              fontFamily: FONT_STYLE.fontFamily,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            🟢 Running ·{' '}
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
            >
              {previewUrl}
            </a>
          </span>
          <button
            type="button"
            onClick={() => {
              const f = document.querySelector<HTMLIFrameElement>('.editor-preview-iframe');
              // biome-ignore lint/correctness/noSelfAssign: forces iframe reload
              if (f) f.src = f.src;
            }}
            style={{
              padding: '2px 8px',
              fontSize: 11,
              border: '1px solid var(--border-primary)',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            ↺ Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setPreviewUrl(null);
              fetch(`${HTTP_BASE}/api/dev-server/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cwd }),
              }).catch(() => null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 10px',
              fontSize: 11,
              border: '1px solid var(--accent-red)',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--accent-red)',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: 'var(--accent-red)',
                display: 'inline-block',
              }}
            />
            Stop
          </button>
        </div>
        <iframe
          className="editor-preview-iframe"
          src={previewUrl}
          style={{ flex: 1, border: 'none', minHeight: 0, background: '#fff' }}
          title="Preview"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        overflow: 'visible',
        borderRight: '1px solid var(--border-primary)',
      }}
    >
      {/* Hidden upload input — always mounted so context-menu upload works even when tree is hidden */}
      <input
        ref={uploadRef}
        type="file"
        multiple
        accept=".pptx,.ppt,.docx,.doc,.xlsx,.xls,.pdf,.txt,.md,.csv,.json,.py,.ts,.tsx,.js,.jsx,.html,.htm"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />
      {/* ── File tree ────────────────────────────────────────────────────── */}
      {showTree && (
        <div
          style={{
            width: 220,
            flexShrink: 0,
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '6px 6px 5px 10px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-tertiary)',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Work Folder
            </span>
            <button
              type="button"
              title="Hide file tree"
              onClick={() => setShowTree(false)}
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
              }}
            >
              <SidebarSimpleIcon size={13} />
            </button>
          </div>
          <div
            role="tree"
            style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '2px 4px 8px' }}
            onContextMenu={handleTreeBgCtxMenu}
          >
            <TreeNode
              key={`${cwd}-${treeVersion}`}
              entry={rootEntry}
              depth={0}
              selected={activeTab}
              onSelect={openFile}
              ctxMenu={ctxMenu}
              onCtxMenu={handleCtxMenu}
              renamingPath={renamingPath}
              onRenameCommit={handleRenameCommit}
              onRefresh={() => setTreeVersion(v => v + 1)}
              processingPptx={processingPptx}
            />
            {/* Inline new-folder input */}
            {newFolderDir && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px 3px 22px',
                }}
              >
                <FolderTypeIcon name="folder" open={false} size={13} />
                <input
                  ref={newFolderInputRef}
                  value={newFolderName}
                  placeholder="folder name"
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={async e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      const name = newFolderName.trim();
                      if (!name) return;
                      const dir = newFolderDir ?? '';
                      setNewFolderDir(null);
                      setNewFolderName('');
                      await apiMakeDir(HTTP_BASE, dir, name).catch(() => null);
                      setTreeVersion(v => v + 1);
                    }
                    if (e.key === 'Escape') {
                      setNewFolderDir(null);
                      setNewFolderName('');
                    }
                  }}
                  onContextMenu={e => e.stopPropagation()}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--accent-blue)',
                    borderRadius: 3,
                    padding: '1px 4px',
                    outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Context menu (fixed-position, escapes overflow) ── */}
      {ctxMenu && (
        <div
          role="menu"
          ref={ctxMenuRef}
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 9999,
            background: 'var(--bg-elevated, var(--bg-primary))',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            padding: '4px 0',
            minWidth: 170,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            fontSize: 12,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* File/folder specific actions */}
          {ctxMenu.entry && !ctxMenu.entry.isDir && (
            <button
              type="button"
              role="menuitem"
              onClick={() => doCtxAction('open', ctxMenu)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') void doCtxAction('open', ctxMenu);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                padding: '6px 14px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'var(--bg-hover, var(--bg-tertiary))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Open
            </button>
          )}
          {ctxMenu.entry && (
            <button
              type="button"
              role="menuitem"
              onClick={() => doCtxAction('rename', ctxMenu)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') void doCtxAction('rename', ctxMenu);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                padding: '6px 14px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'var(--bg-hover, var(--bg-tertiary))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Rename
            </button>
          )}
          {ctxMenu.entry && !ctxMenu.entry.isDir && (
            <button
              type="button"
              role="menuitem"
              onClick={() => doCtxAction('duplicate', ctxMenu)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') void doCtxAction('duplicate', ctxMenu);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                padding: '6px 14px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'var(--bg-hover, var(--bg-tertiary))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Duplicate
            </button>
          )}
          {ctxMenu.entry && !ctxMenu.entry.isDir && (
            <button
              type="button"
              role="menuitem"
              onClick={() => doCtxAction('download', ctxMenu)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') void doCtxAction('download', ctxMenu);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                padding: '6px 14px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'var(--bg-hover, var(--bg-tertiary))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Download
            </button>
          )}
          {/* Divider before common actions */}
          {ctxMenu.entry && (
            <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />
          )}
          {/* Common actions — always shown */}
          <button
            type="button"
            role="menuitem"
            onClick={() => doCtxAction('upload', ctxMenu)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') void doCtxAction('upload', ctxMenu);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              padding: '6px 14px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'var(--bg-hover, var(--bg-tertiary))';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            Upload file here
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => doCtxAction('new-folder', ctxMenu)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') void doCtxAction('new-folder', ctxMenu);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              padding: '6px 14px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'var(--bg-hover, var(--bg-tertiary))';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            New folder
          </button>
          {/* Delete — for files and folders (not the root cwd) */}
          {ctxMenu.entry && ctxMenu.entry.path !== cwd && (
            <>
              <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />
              <button
                type="button"
                role="menuitem"
                onClick={() => doCtxAction('delete', ctxMenu)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') void doCtxAction('delete', ctxMenu);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  color: 'var(--accent-red, #e8453c)',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--bg-hover, var(--bg-tertiary))';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                Delete {ctxMenu.entry.isDir ? 'folder' : 'file'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary)',
          overflow: 'visible',
        }}
      >
        {/* Tab bar — tabs are draggable to reorder */}
        <div
          className="editor-tab-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-primary)',
            flexShrink: 0,
          }}
        >
          {/* Show-tree button — only visible when tree is hidden */}
          {!showTree && (
            <button
              type="button"
              title="Show file tree"
              onClick={() => setShowTree(true)}
              style={{
                flexShrink: 0,
                width: 28,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRight: '1px solid var(--border-primary)',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
              }}
            >
              <SidebarSimpleIcon size={13} />
            </button>
          )}
          {/* Scrollable tab list */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'stretch',
              overflowX: 'auto',
              minWidth: 0,
            }}
          >
            {tabs.length === 0 ? (
              <span
                style={{
                  padding: '8px 16px',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  alignSelf: 'center',
                }}
              >
                No file open
              </span>
            ) : (
              tabs.map(tab => {
                const active = tab.path === activeTab;
                const isDragged = dragTab === tab.path;
                const isTarget = dragOver === tab.path && dragOver !== dragTab;
                const ext = tab.name.split('.').pop()?.toLowerCase() ?? '';
                const typeClass = ['xlsx', 'xls', 'csv'].includes(ext)
                  ? 't-sheets'
                  : ['docx', 'doc', 'pdf', 'md', 'markdown', 'html', 'htm'].includes(ext)
                    ? 't-docs'
                    : ['pptx', 'ppt'].includes(ext)
                      ? 't-slides'
                      : [
                            'ts',
                            'tsx',
                            'js',
                            'jsx',
                            'py',
                            'go',
                            'rs',
                            'java',
                            'kt',
                            'rb',
                            'cpp',
                            'cs',
                            'c',
                            'h',
                            'sh',
                            'bash',
                            'zsh',
                          ].includes(ext)
                        ? 't-code'
                        : '';
                const cls = [
                  'editor-tab',
                  active && 'editor-tab--active',
                  isDragged && 'editor-tab--drag',
                  isTarget && 'editor-tab--drop',
                  typeClass,
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={tab.path}
                    type="button"
                    draggable
                    className={cls}
                    onClick={() => setActiveTab(tab.path)}
                    onDragStart={e => {
                      setDragTab(tab.path);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      setDragOver(tab.path);
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => {
                      e.preventDefault();
                      if (!dragTab || dragTab === tab.path) {
                        setDragTab(null);
                        setDragOver(null);
                        return;
                      }
                      setTabs(prev => {
                        const from = prev.findIndex(t => t.path === dragTab);
                        const to = prev.findIndex(t => t.path === tab.path);
                        if (from < 0 || to < 0) return prev;
                        const next = [...prev];
                        const [moved] = next.splice(from, 1);
                        if (moved !== undefined) next.splice(to, 0, moved);
                        return next;
                      });
                      setDragTab(null);
                      setDragOver(null);
                    }}
                    onDragEnd={() => {
                      setDragTab(null);
                      setDragOver(null);
                    }}
                  >
                    <FileTypeIcon name={tab.name} size={13} />
                    <span className="editor-tab-name">{tab.name}</span>
                    {tab.dirty && <span className="editor-tab-dirty" />}
                    <button
                      type="button"
                      className="editor-tab-close"
                      onClick={e => closeTab(e, tab.path)}
                      onKeyDown={e =>
                        e.key === 'Enter' && closeTab(e as unknown as React.MouseEvent, tab.path)
                      }
                    >
                      <XIcon size={10} weight="bold" />
                    </button>
                  </button>
                );
              })
            )}
          </div>
          {/* end scrollable tab list */}

          {/* Save All button — shown whenever any tab has unsaved changes */}
          {tabs.some(t => t.dirty) && (
            <div
              style={{
                flexShrink: 0,
                padding: '0 8px',
                borderLeft: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  fontSize: 11,
                  border: '1px solid var(--accent-blue)',
                  borderRadius: 3,
                  background: 'transparent',
                  color: 'var(--accent-blue)',
                  cursor: 'pointer',
                  opacity: saving ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {saving ? 'Saving…' : 'Save All'}
              </button>
            </div>
          )}

          {/* Run button — coder mode only */}
          {codeMode && (
            <div
              style={{
                flexShrink: 0,
                padding: '0 8px',
                borderLeft: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              {previewUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    fetch(`${HTTP_BASE}/api/dev-server/stop`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cwd }),
                    }).catch(() => null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    fontSize: 11,
                    border: '1px solid var(--accent-red)',
                    borderRadius: 3,
                    background: 'transparent',
                    color: 'var(--accent-red)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: 'var(--accent-red)',
                      display: 'inline-block',
                    }}
                  />{' '}
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={previewLoading}
                  onClick={async () => {
                    setPreviewLoading(true);
                    try {
                      const r = await fetch(`${HTTP_BASE}/api/dev-server/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cwd }),
                      });
                      const d = (await r.json()) as {
                        url?: string;
                        error?: string;
                        detail?: string;
                      };
                      if (d.url) setPreviewUrl(d.url);
                      else setError(d.error ?? d.detail ?? 'Failed to start dev server');
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setPreviewLoading(false);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    fontSize: 11,
                    border: '1px solid var(--accent-green)',
                    borderRadius: 3,
                    background: 'transparent',
                    color: 'var(--accent-green)',
                    cursor: 'pointer',
                    opacity: previewLoading ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="10"
                    height="10"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  {previewLoading ? 'Starting…' : 'Run'}
                </button>
              )}
            </div>
          )}
        </div>
        {/* end tab bar */}

        {/* Path + save toolbar — hidden for doc files which have their own toolbar */}
        {currentTab && (!currentTab.docType || currentTab.docType === 'markdown') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 14px',
              background: 'var(--bg-tertiary)',
              borderBottom: '1px solid var(--border-primary)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: FONT_STYLE.fontFamily,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentTab.path.replace(cwd, '').replace(/^\//, '')}
            </span>
            {currentTab.dirty && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                style={{
                  padding: '2px 10px',
                  fontSize: 11,
                  flexShrink: 0,
                  border: '1px solid var(--accent-blue)',
                  borderRadius: 3,
                  background: 'transparent',
                  color: 'var(--accent-blue)',
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save  ⌘S'}
              </button>
            )}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '4px 14px',
              fontSize: 11,
              color: '#FA4B42',
              background: 'rgba(229,53,43,0.08)',
              borderBottom: '1px solid rgba(229,53,43,0.2)',
              flexShrink: 0,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Document viewer or syntax-highlighted editor ─────────── */}
        {currentTab ? (
          currentTab.docType === 'excel' ? (
            <React.Suspense
              fallback={
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
              }
            >
              <ExcelEditor filePath={currentTab.path} style={{ flex: 1, minHeight: 0 }} />
            </React.Suspense>
          ) : currentTab.docType === 'ppt' ? (
            <React.Suspense
              fallback={
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
                  Loading presentation…
                </div>
              }
            >
              <PptEditor
                filePath={currentTab.path}
                style={{ flex: 1, minHeight: 0 }}
                saveRef={pptSaveRef}
                onDirty={() =>
                  setTabs(prev =>
                    prev.map(t => (t.path === currentTab.path ? { ...t, dirty: true } : t)),
                  )
                }
                onClean={() =>
                  setTabs(prev =>
                    prev.map(t => (t.path === currentTab.path ? { ...t, dirty: false } : t)),
                  )
                }
              />
            </React.Suspense>
          ) : currentTab.docType === 'pdf' ? (
            <iframe
              key={currentTab.path}
              src={`${HTTP_BASE}/api/file/view?path=${encodeURIComponent(currentTab.path)}`}
              style={{ flex: 1, border: 'none', minHeight: 0, background: '#fff' }}
              title={currentTab.name}
            />
          ) : currentTab.docType === 'html' ? (
            <iframe
              key={currentTab.path}
              srcDoc={currentTab.content}
              style={{ flex: 1, border: 'none', minHeight: 0, background: '#fff' }}
              title={currentTab.name}
              sandbox="allow-scripts"
            />
          ) : currentTab.docType === 'markdown' ? (
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
              {/* Editor pane */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflow: 'auto',
                  position: 'relative',
                  minHeight: 0,
                  borderRight: '1px solid var(--border-primary)',
                }}
              >
                <div style={{ position: 'relative', minWidth: '100%', minHeight: '100%' }}>
                  <HighlightLayer content={currentTab.content} filename={currentTab.name} />
                  <textarea
                    ref={textareaRef}
                    value={currentTab.content}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    style={{
                      ...editorFont,
                      position: 'relative',
                      display: 'block',
                      width: '100%',
                      minHeight: '100%',
                      paddingTop: PAD.top,
                      paddingRight: PAD.right,
                      paddingBottom: PAD.bottom,
                      paddingLeft: LN_WIDTH,
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      background: 'transparent',
                      color: 'transparent',
                      caretColor: 'var(--accent-blue)',
                      overflow: 'hidden',
                      whiteSpace: 'pre',
                      wordBreak: 'normal',
                      overflowWrap: 'normal',
                    }}
                    onChange={e => {
                      const val = e.target.value;
                      setTabs(prev =>
                        prev.map(t =>
                          t.path === activeTab ? { ...t, content: val, dirty: true } : t,
                        ),
                      );
                    }}
                    onKeyDown={e => {
                      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void save();
                      }
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const s = ta.selectionStart,
                          end = ta.selectionEnd;
                        const next = `${currentTab.content.slice(0, s)}  ${currentTab.content.slice(end)}`;
                        setTabs(prev =>
                          prev.map(t =>
                            t.path === activeTab ? { ...t, content: next, dirty: true } : t,
                          ),
                        );
                        requestAnimationFrame(() => {
                          ta.selectionStart = ta.selectionEnd = s + 2;
                        });
                      }
                    }}
                  />
                </div>
              </div>
              {/* Preview pane */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '20px 28px',
                  background: 'var(--bg-primary)',
                }}
              >
                <div
                  className="doc-word-view"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised HTML
                  dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(currentTab.content) }}
                />
              </div>
            </div>
          ) : currentTab.docType ? (
            /* ── Document viewer / editor ── */
            <div className="doc-word-shell">
              {/* Toolbar — meta info + save button only */}
              <div className="doc-word-toolbar">
                <span className="doc-word-toolbar-icon">
                  {DOC_ICONS[currentTab.docType] ?? '📄'}
                </span>
                <span className="doc-word-toolbar-name">{currentTab.name}</span>
                <span className="doc-word-toolbar-sep">·</span>
                <span>{currentTab.docType.toUpperCase()}</span>
                <span className="doc-word-toolbar-sep">·</span>
                <span>
                  {currentTab.docPages} page{currentTab.docPages !== 1 ? 's' : ''}
                </span>
                <span className="doc-word-toolbar-sep">·</span>
                <span>{currentTab.docWordCount?.toLocaleString()} words</span>
                {currentTab.docTruncated && (
                  <span className="doc-word-toolbar-truncated">⚠ truncated</span>
                )}
                <span style={{ flex: 1 }} />
                {currentTab.blocks && (
                  <button
                    type="button"
                    className="doc-word-save-btn"
                    title="Re-parse the original DOCX file, discarding the cached sidecar"
                    onClick={async () => {
                      try {
                        const r = await fetch(`${HTTP_BASE}/api/doc/parse`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: currentTab.path, force: true }),
                        });
                        const d = (await r.json()) as {
                          blocks?: Block[];
                          type?: string;
                          pages?: number;
                          wordCount?: number;
                          truncated?: boolean;
                          defaultFont?: string;
                          error?: string;
                        };
                        if (d.error) {
                          setError(d.error);
                          return;
                        }
                        setTabs(prev =>
                          prev.map(t =>
                            t.path === currentTab.path
                              ? {
                                  ...t,
                                  blocks: d.blocks,
                                  dirty: false,
                                  docPages: d.pages,
                                  docWordCount: d.wordCount,
                                  docTruncated: d.truncated,
                                  defaultFont: d.defaultFont,
                                }
                              : t,
                          ),
                        );
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Refresh
                  </button>
                )}
                {currentTab.blocks && (
                  <button
                    type="button"
                    className="doc-word-save-btn"
                    style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green)' }}
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = `${HTTP_BASE}/api/doc/download?path=${encodeURIComponent(currentTab.path)}`;
                      a.download = currentTab.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                  >
                    Download DOCX
                  </button>
                )}
                {currentTab.dirty && (
                  <button
                    type="button"
                    className="doc-word-save-btn"
                    onClick={() => void save()}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save  ⌘S'}
                  </button>
                )}
              </div>

              {/* Content */}
              {currentTab.blocks ? (
                /* Word (DOCX): flex: 1 so it fills remaining height in doc-word-shell column */
                <WordDocEditor
                  key={currentTab.path}
                  blocks={currentTab.blocks}
                  defaultFont={currentTab.defaultFont}
                  initialCursor={cursors[currentTab.path]}
                  onChange={(blocks: Block[]) => {
                    const path = activeTab;
                    setTabs(prev =>
                      prev.map(t => (t.path === path ? { ...t, blocks, dirty: true } : t)),
                    );
                    if (docAutoSaveTimer.current) clearTimeout(docAutoSaveTimer.current);
                    docAutoSaveTimer.current = setTimeout(() => {
                      if (!currentTab || !path) return;
                      saveTab({ ...currentTab, blocks })
                        .then(() => {
                          setTabs(prev =>
                            prev.map(t => (t.path === path ? { ...t, dirty: false } : t)),
                          );
                        })
                        .catch(() => null);
                    }, 3000);
                  }}
                  onCursorChange={cursor => handleCursorChange(currentTab.path, cursor)}
                  style={{ flex: 1, minHeight: 0 }}
                />
              ) : (
                /* Other docs (PDF/XLSX/PPTX): markdown rendered on a white page */
                <div className="doc-word-canvas">
                  <div className="doc-word-page">
                    <div
                      className="doc-word-view"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised HTML
                      dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(currentTab.content) }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Syntax-highlighted editor ── */
            <div
              ref={scrollRef}
              style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}
            >
              <div style={{ position: 'relative', minWidth: '100%', minHeight: '100%' }}>
                <HighlightLayer content={currentTab.content} filename={currentTab.name} />
                <textarea
                  ref={textareaRef}
                  value={currentTab.content}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  style={{
                    ...editorFont,
                    position: 'relative',
                    display: 'block',
                    width: '100%',
                    minHeight: '100%',
                    paddingTop: PAD.top,
                    paddingRight: PAD.right,
                    paddingBottom: PAD.bottom,
                    paddingLeft: LN_WIDTH,
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    background: 'transparent',
                    color: 'transparent',
                    caretColor: 'var(--accent-blue)',
                    overflow: 'hidden',
                    whiteSpace: 'pre',
                    wordBreak: 'normal',
                    overflowWrap: 'normal',
                  }}
                  onChange={e => {
                    const val = e.target.value;
                    setTabs(prev =>
                      prev.map(t =>
                        t.path === activeTab ? { ...t, content: val, dirty: true } : t,
                      ),
                    );
                  }}
                  onKeyDown={e => {
                    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void save();
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const s = ta.selectionStart,
                        end = ta.selectionEnd;
                      const spaces = codeMode ? '  ' : '    ';
                      const next =
                        currentTab.content.slice(0, s) + spaces + currentTab.content.slice(end);
                      setTabs(prev =>
                        prev.map(t =>
                          t.path === activeTab ? { ...t, content: next, dirty: true } : t,
                        ),
                      );
                      requestAnimationFrame(() => {
                        ta.selectionStart = ta.selectionEnd = s + spaces.length;
                      });
                    }
                  }}
                />
              </div>
            </div>
          )
        ) : (
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
            Select a file from the tree to open it
          </div>
        )}
      </div>
    </div>
  );
}
