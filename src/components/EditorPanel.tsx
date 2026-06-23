/**
 * EditorPanel — VS Code-style dark editor for worker/coder modes.
 *
 * Syntax highlighting uses the overlay technique:
 *   - bottom layer: <pre> with coloured <span>s (pointer-events:none)
 *   - top layer: transparent <textarea> that captures all input
 *   - both share identical font/padding so they stay pixel-aligned
 *   - the outer div scrolls; both layers follow
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { parseMarkdownToHTML } from '@boltzbit/md-utils';
import { FileIcon, FolderIcon, FolderOpenIcon, XIcon } from '@phosphor-icons/react';
import { WordDocEditor, type Block } from '#/office';
import { ExcelEditor } from '#/excel';
import { PptEditor } from '#/ppt';

const DOC_EXTS    = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx']);
const EXCEL_EXTS  = new Set(['xls','xlsx']);
const PPT_EXTS    = new Set(['ppt','pptx']);
function isDocExt(name: string)   { return DOC_EXTS.has(name.split('.').pop()?.toLowerCase() ?? ''); }
function isExcelExt(name: string) { return EXCEL_EXTS.has(name.split('.').pop()?.toLowerCase() ?? ''); }
function isPptExt(name: string)   { return PPT_EXTS.has(name.split('.').pop()?.toLowerCase() ?? ''); }
const DOC_ICONS: Record<string, string> = { pdf:'📄', docx:'📝', doc:'📝', xlsx:'📊', xls:'📊', pptx:'📑' };

const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

// Structural colours come from CSS variables (theme-adaptive).
// Token colours are handled by .tok-* CSS classes in app.css.
const FOLDER_COLOR = 'var(--accent-orange)';

// ── Identical font settings used by BOTH the highlight layer and the textarea ─
const FONT_STYLE = {
  fontFamily: "'Martian Mono','Cascadia Code','Fira Code',ui-monospace,monospace",
  fontSize:   '12.5px',
  lineHeight: '22px',
  tabSize:    2,
} as const;
const PAD = { top: 10, right: 32, bottom: 32, left: 0 };

// ── Syntax tokeniser (ported from bz-codespace) ───────────────────────────────
type TokType = 'comment'|'string'|'keyword'|'builtin'|'number'|'fn'|'decorator'|'plain';
interface Tok { type: TokType; text: string }

const TS_KW = new Set('break case catch class const continue default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await from as declare interface type enum namespace readonly abstract implements satisfies'.split(' '));
const TS_B  = new Set('string number boolean any never unknown object undefined null true false Array Promise Record Partial Required Readonly Map Set Date Error Symbol void React'.split(' '));
const PY_KW = new Set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self cls'.split(' '));

// Token type → CSS class (colours defined in app.css, theme-adaptive)
const TOK_CLASS: Record<TokType, string> = {
  comment:'tok-comment', string:'tok-string', keyword:'tok-keyword',
  builtin:'tok-builtin', number:'tok-number', fn:'tok-fn',
  decorator:'tok-decorator', plain:'tok-plain',
};

function getExt(n: string) { return n.split('.').pop()?.toLowerCase() ?? ''; }

function tokenizeLine(line: string, ext: string): Tok[] {
  const tokens: Tok[] = [];
  const isPy = ext === 'py';
  const isTs = ['ts','tsx','js','jsx'].includes(ext);
  let i = 0; const len = line.length;
  while (i < len) {
    const ch = line.charAt(i);
    if (isTs && ch==='/'&&line.charAt(i+1)==='/'){tokens.push({type:'comment',text:line.slice(i)});break;}
    if ((isPy||ext==='yaml'||ext==='yml')&&ch==='#'){tokens.push({type:'comment',text:line.slice(i)});break;}
    if (isTs&&ch==='/'&&line.charAt(i+1)==='*'){const end=line.indexOf('*/',i+2);const text=end===-1?line.slice(i):line.slice(i,end+2);tokens.push({type:'comment',text});i+=text.length;continue;}
    if (isPy&&ch==='@'){let j=i+1;while(j<len&&/[a-zA-Z0-9_.]/.test(line.charAt(j)))j++;tokens.push({type:'decorator',text:line.slice(i,j)});i=j;continue;}
    if (ch==='"'||ch==="'"||ch==='`'){let j=i+1;while(j<len){if(line.charAt(j)==='\\'){j+=2;continue;}if(line.charAt(j)===ch){j++;break;}j++;}tokens.push({type:'string',text:line.slice(i,j)});i=j;continue;}
    if (/\d/.test(ch)&&(i===0||!/[a-zA-Z_$]/.test(line.charAt(i-1)))){let j=i;while(j<len&&/[\d.xXbBoO_a-fA-FnN]/.test(line.charAt(j)))j++;tokens.push({type:'number',text:line.slice(i,j)});i=j;continue;}
    if (/[a-zA-Z_$]/.test(ch)){
      let j=i;while(j<len&&/[a-zA-Z0-9_$]/.test(line.charAt(j)))j++;
      const word=line.slice(i,j);const isFn=line.charAt(j)==='(';
      let type:TokType='plain';
      if(isTs){if(TS_KW.has(word))type='keyword';else if(TS_B.has(word))type='builtin';else if(isFn)type='fn';else if(/^[A-Z]/.test(word))type='builtin';}
      else if(isPy){if(PY_KW.has(word))type='keyword';else if(isFn)type='fn';else if(/^[A-Z]/.test(word))type='builtin';}
      tokens.push({type,text:word});i=j;continue;
    }
    tokens.push({type:'plain',text:ch});i++;
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
  const ext   = getExt(filename);
  const lines = content.split('\n');
  return (
    <pre style={{
      // Must match textarea exactly: same position, same padding, same font
      position: 'absolute', inset: 0,
      margin: 0,
      paddingTop:    PAD.top,
      paddingRight:  PAD.right,
      paddingBottom: PAD.bottom,
      paddingLeft:   0,       // line numbers handle the left indent
      ...FONT_STYLE,
      pointerEvents: 'none',
      overflow:      'hidden',
      whiteSpace:    'pre',
      wordBreak:     'normal',
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', lineHeight: FONT_STYLE.lineHeight }}>
          {/* Fixed-width line number — always LN_WIDTH px wide */}
          <span style={{
            display:       'inline-block',
            width:         LN_WIDTH,
            flexShrink:    0,
            textAlign:     'right',
            paddingRight:  18,
            fontSize:      '11px',
            userSelect:    'none' as const,
            lineHeight:    FONT_STYLE.lineHeight,
          }}>
            {i + 1}
          </span>
          {/* Syntax-coloured code — className drives colour via app.css (theme-adaptive) */}
          <span className="tok-plain" style={{ flex: 1 }}>
            {line === '' ? ' ' : tokenizeLine(line, ext).map((tok, j) => (
              <span key={j} className={TOK_CLASS[tok.type]}>{tok.text}</span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
}

// ── File tree ─────────────────────────────────────────────────────────────────
type FsEntry = { name: string; path: string; isDir: boolean };

interface CtxMenu { x: number; y: number; entry: FsEntry }

function TreeNode({ entry, depth, selected, onSelect, ctxMenu, onCtxMenu, renamingPath, onRenameCommit, onRefresh }: {
  entry: FsEntry; depth: number; selected: string | null;
  onSelect: (p: string) => void;
  ctxMenu: CtxMenu | null;
  onCtxMenu: (e: React.MouseEvent, entry: FsEntry) => void;
  renamingPath: string | null;
  onRenameCommit: (entry: FsEntry, newName: string) => void;
  onRefresh: () => void;
}) {
  const [open,    setOpen]    = useState(depth === 0);
  const [kids,    setKids]    = useState<FsEntry[]>([]);
  const [loaded,  setLoaded]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const isActive    = entry.path === selected && !entry.isDir;
  const isRenaming  = renamingPath === entry.path;

  function load() {
    if (loaded || loading) return;
    setLoading(true);
    const HIDDEN = new Set(['.git','node_modules','__pycache__','.venv','.bzhub','dist','.next','.turbo']);
    fetch(`${HTTP_BASE}/files?path=${encodeURIComponent(entry.path)}`)
      .then(r => r.json())
      .then((d: { entries?: FsEntry[] }) => {
        setKids((d.entries ?? []).filter(e => !e.name.startsWith('.') && !HIDDEN.has(e.name)));
        setLoaded(true); setLoading(false);
      })
      .catch(() => { setLoaded(true); setLoading(false); });
  }

  useEffect(() => { if (open && !loaded) load(); }, [open]); // eslint-disable-line

  // Focus rename input when it appears
  useEffect(() => {
    if (isRenaming) {
      setRenameVal(entry.name);
      setTimeout(() => { renameRef.current?.select(); }, 50);
    }
  }, [isRenaming, entry.name]);

  const toggle = () => { setOpen(v => !v); };
  const name   = entry.name || entry.path.split('/').filter(Boolean).pop() || entry.path;

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          borderRadius: 3, cursor: 'pointer',
          background: isActive ? 'rgba(86,156,214,0.18)' : 'transparent',
          color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
          fontSize: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
        onClick={() => { if (!isRenaming) { entry.isDir ? toggle() : onSelect(entry.path); } }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onCtxMenu(e, entry); }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        {entry.isDir
          ? open
            ? <FolderOpenIcon size={13} style={{ color: FOLDER_COLOR, flexShrink: 0 }} weight="duotone" />
            : <FolderIcon     size={13} style={{ color: FOLDER_COLOR, flexShrink: 0 }} weight="duotone" />
          : <FileIcon         size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        }
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(entry, renameVal); }
              if (e.key === 'Escape') onRenameCommit(entry, entry.name); // cancel
            }}
            onBlur={() => onRenameCommit(entry, renameVal)}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--accent-blue)', borderRadius: 3, padding: '1px 4px', outline: 'none' }}
          />
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{name}</span>
        )}
      </div>
      {entry.isDir && open && loading && (
        <div style={{ padding: `2px 8px 2px ${8 + (depth + 1) * 14}px`, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          Loading…
        </div>
      )}
      {entry.isDir && open && !loading && kids.map(k => (
        <TreeNode key={k.path} entry={k} depth={depth + 1} selected={selected} onSelect={onSelect}
          ctxMenu={ctxMenu} onCtxMenu={onCtxMenu} renamingPath={renamingPath}
          onRenameCommit={onRenameCommit} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// ── Editor panel ──────────────────────────────────────────────────────────────
interface Tab {
  path: string; name: string; content: string; dirty: boolean;
  // Set for all document files (pdf/pptx) — markdown text
  docType?: string; docPages?: number; docWordCount?: number; docTruncated?: boolean;
  // Set for Word files (docx/doc) — bz-office Block[] format
  blocks?: Block[];
  // Set for Excel files — handled by ExcelEditor directly (data loaded from server)
  isExcel?: boolean;
  // Set for PPT files — handled by PptEditor directly
  isPpt?: boolean;
}

interface Props { cwd: string; codeMode: boolean; refreshKey?: number }

export function EditorPanel({ cwd, codeMode, refreshKey }: Props) {
  const [tabs,         setTabs]         = useState<Tab[]>([]);
  const [activeTab,    setActiveTab]    = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [dragTab,      setDragTab]      = useState<string | null>(null);
  const [dragOver,     setDragOver]     = useState<string | null>(null);
  const [ctxMenu,      setCtxMenu]      = useState<CtxMenu | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [treeVersion,  setTreeVersion]  = useState(0);
  const [cursors,      setCursors]      = useState<Record<string, { selStart: number; selEnd: number }>>({});
  const cursorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCtxMenu = useCallback((e: React.MouseEvent, entry: FsEntry) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleRenameCommit = useCallback(async (entry: FsEntry, newName: string) => {
    setRenamingPath(null);
    if (!newName || newName === entry.name) return;
    await fetch(`${HTTP_BASE}/api/file/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: entry.path, newName }),
    }).catch(() => null);
    setTreeVersion(v => v + 1);
    // Update any open tab for this file
    const newPath = entry.path.replace(/[^/]+$/, newName);
    setTabs(prev => prev.map(t => t.path === entry.path ? { ...t, path: newPath, name: newName } : t));
    if (activeTab === entry.path) setActiveTab(newPath);
  }, [activeTab]);

  const doCtxAction = useCallback(async (action: string, entry: FsEntry) => {
    setCtxMenu(null);
    if (action === 'open') { if (!entry.isDir) openFile(entry.path); }
    else if (action === 'rename') { setRenamingPath(entry.path); }
    else if (action === 'duplicate') {
      await fetch(`${HTTP_BASE}/api/file/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path }),
      }).catch(() => null);
      setTreeVersion(v => v + 1);
    } else if (action === 'download') {
      const a = document.createElement('a');
      a.href = `${HTTP_BASE}/api/file/download?path=${encodeURIComponent(entry.path)}`;
      a.download = entry.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The outer scrollable div — both highlight and textarea scroll with it
  const scrollRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const rootEntry: FsEntry = { name: cwd.split('/').filter(Boolean).pop() ?? cwd, path: cwd, isDir: true };

  // Listen for open-file events dispatched from chat "Open" buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail?.path;
      if (path) openFile(path);
    };
    window.addEventListener('open-file', handler);
    return () => window.removeEventListener('open-file', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const currentTab = tabs.find(t => t.path === activeTab) ?? null;

  // Open a file: fetch content and add a tab
  async function openFile(filePath: string) {
    const existing = tabs.find(t => t.path === filePath);
    if (existing) {
      // Excel/PPT tabs load data from the server — close and reopen to get fresh data
      // (avoids showing stale error state after server restart)
      if (existing.isExcel || existing.isPpt) {
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
        setTabs(prev => [...prev, { path: filePath, name, content: '', dirty: false, isExcel: true }]);
        setActiveTab(filePath);
        return;
      }
      // PPT files: PptEditor loads data internally
      if (isPptExt(name)) {
        setTabs(prev => [...prev, { path: filePath, name, content: '', dirty: false, isPpt: true }]);
        setActiveTab(filePath);
        return;
      }
      if (isDocExt(name)) {
        const r = await fetch(`${HTTP_BASE}/api/doc/parse`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath }),
        });
        const d = await r.json() as { content?: string; blocks?: Block[]; type?: string; pages?: number; wordCount?: number; truncated?: boolean; error?: string };
        if (d.error) { setError(d.error); return; }
        // Reset cursor to 0 on fresh open so it's always in the visible viewport.
        // The in-memory cursors map is also cleared so a re-open starts fresh.
        setCursors(prev => { const n = { ...prev }; delete n[filePath]; return n; });
        setTabs(prev => [...prev, {
          path: filePath, name, content: d.content ?? '', dirty: false,
          docType: d.type, docPages: d.pages, docWordCount: d.wordCount, docTruncated: d.truncated,
          blocks: d.blocks,
        }]);
      } else {
        const r = await fetch(`${HTTP_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
        const d = await r.json() as { content?: string; error?: string };
        if (d.error) { setError(d.error); return; }
        setTabs(prev => [...prev, { path: filePath, name, content: d.content ?? '', dirty: false }]);
      }
      setActiveTab(filePath);
    } catch (e) { setError(String(e)); }
  }

  // Reload active file and refresh file tree when agent finishes a turn (increments refreshKey)
  // Skip document files — they use /api/doc/parse and raw bytes would overwrite parsed content
  useEffect(() => {
    if (refreshKey === 0) return; // skip initial mount
    setTreeVersion(v => v + 1);
    if (!activeTab) return;
    const currentTabData = tabs.find(t => t.path === activeTab);
    if (currentTabData?.docType) return; // document — don't reload raw bytes
    fetch(`${HTTP_BASE}/api/file?path=${encodeURIComponent(activeTab)}`)
      .then(r => r.json())
      .then((d: { content?: string }) => {
        if (d.content !== undefined)
          setTabs(prev => prev.map(t => t.path === activeTab && !t.dirty ? { ...t, content: d.content! } : t));
      })
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Resize textarea to match content so the outer div scrolls (not the textarea itself)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '1px';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [currentTab?.content]);

  function closeTab(e: React.MouseEvent, path: string) {
    e.stopPropagation();
    const idx  = tabs.findIndex(t => t.path === path);
    const next = tabs.filter(t => t.path !== path);
    if (activeTab === path) setActiveTab(next[Math.max(0, idx - 1)]?.path ?? null);
    setTabs(next);
  }

  // Called by WordDocEditor on every cursor/selection change.
  // Updates in-memory map immediately; debounces server save to avoid flooding.
  const handleCursorChange = useCallback((path: string, cursor: { selStart: number; selEnd: number }) => {
    setCursors(prev => ({ ...prev, [path]: cursor }));
    // Debounce: cancel previous timer for this path
    if (cursorSaveTimers.current[path]) clearTimeout(cursorSaveTimers.current[path]);
    cursorSaveTimers.current[path] = setTimeout(() => {
      fetch(`${HTTP_BASE}/api/doc/cursor`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, ...cursor }),
      }).catch(() => null);
    }, 500);
  }, []);

  async function save() {
    if (!currentTab?.dirty) return;
    setSaving(true);
    setError('');
    try {
      if (currentTab.docType) {
        // Word file: send Block[] to regenerate DOCX; other docs: send markdown
        const body = currentTab.blocks
          ? { path: currentTab.path, blocks: currentTab.blocks }
          : { path: currentTab.path, content: currentTab.content };
        const r = await fetch(`${HTTP_BASE}/api/doc/save`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (d.error) { setError(d.error); return; }
      } else {
        await fetch(`${HTTP_BASE}/api/file`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: currentTab.path, content: currentTab.content }),
        });
      }
      setTabs(prev => prev.map(t => t.path === activeTab ? { ...t, dirty: false } : t));
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
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
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid var(--border-primary)` }}>
        {/* Preview toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          background: 'var(--bg-secondary)', borderBottom: `1px solid var(--border-primary)`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FONT_STYLE.fontFamily, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🟢 Running · <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>{previewUrl}</a>
          </span>
          <button type="button" onClick={() => { const f = document.querySelector<HTMLIFrameElement>('.editor-preview-iframe'); if (f) f.src = f.src; }} style={{
            padding: '2px 8px', fontSize: 11, border: `1px solid var(--border-primary)`,
            borderRadius: 3, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>↺ Reload</button>
          <button type="button" onClick={() => {
            setPreviewUrl(null);
            fetch(`${HTTP_BASE}/api/dev-server/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd }) }).catch(() => null);
          }} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '2px 10px', fontSize: 11,
            border: `1px solid var(--accent-red)`, borderRadius: 3,
            background: 'transparent', color: 'var(--accent-red)', cursor: 'pointer',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-red)', display: 'inline-block' }} />
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
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'visible', borderRight: `1px solid var(--border-primary)` }}>

      {/* ── File tree ────────────────────────────────────────────────────── */}
      <div style={{
        width: 220, flexShrink: 0, background: 'var(--bg-secondary)',
        borderRight: `1px solid var(--border-primary)`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '9px 10px 5px', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            {cwd.split('/').filter(Boolean).pop()}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '2px 4px 8px' }}>
          <TreeNode
            key={treeVersion}
            entry={rootEntry} depth={0} selected={activeTab} onSelect={openFile}
            ctxMenu={ctxMenu} onCtxMenu={handleCtxMenu}
            renamingPath={renamingPath} onRenameCommit={handleRenameCommit}
            onRefresh={() => setTreeVersion(v => v + 1)}
          />
        </div>
      </div>

      {/* ── Context menu (fixed-position, escapes overflow) ── */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          style={{
            position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999,
            background: 'var(--bg-elevated, var(--bg-primary))',
            border: '1px solid var(--border-primary)',
            borderRadius: 6, padding: '4px 0',
            minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            fontSize: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {[
            ...(!ctxMenu.entry.isDir ? [{ id: 'open',      label: 'Open' }] : []),
            { id: 'rename',    label: 'Rename' },
            ...(!ctxMenu.entry.isDir ? [{ id: 'duplicate', label: 'Duplicate' }] : []),
            ...(!ctxMenu.entry.isDir ? [{ id: 'download',  label: 'Download' }] : []),
          ].map(item => (
            <div
              key={item.id}
              onClick={() => doCtxAction(item.id, ctxMenu.entry)}
              style={{ padding: '6px 14px', cursor: 'pointer', color: 'var(--text-primary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover, var(--bg-tertiary))'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflow: 'visible' }}>

        {/* Tab bar — tabs are draggable to reorder */}
        <div style={{
          display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)',
          borderBottom: `1px solid var(--border-primary)`, minHeight: 35, flexShrink: 0,
        }}>
          {/* Scrollable tab list */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', overflowX: 'auto', minWidth: 0, height: '100%' }}>
          {tabs.length === 0
            ? <span style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>No file open</span>
            : tabs.map(tab => {
              const active    = tab.path === activeTab;
              const isDragged = dragTab === tab.path;
              const isTarget  = dragOver === tab.path && dragOver !== dragTab;
              return (
                <button
                  key={tab.path}
                  type="button"
                  draggable
                  onClick={() => setActiveTab(tab.path)}
                  onDragStart={e => {
                    setDragTab(tab.path);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={e => { e.preventDefault(); setDragOver(tab.path); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => {
                    e.preventDefault();
                    if (!dragTab || dragTab === tab.path) { setDragTab(null); setDragOver(null); return; }
                    setTabs(prev => {
                      const from = prev.findIndex(t => t.path === dragTab);
                      const to   = prev.findIndex(t => t.path === tab.path);
                      if (from < 0 || to < 0) return prev;
                      const next = [...prev];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved!);
                      return next;
                    });
                    setDragTab(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => { setDragTab(null); setDragOver(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                    fontSize: 12, flexShrink: 0, cursor: 'grab',
                    border: 'none', borderRight: `1px solid var(--border-primary)`,
                    borderTop: active ? `1px solid var(--accent-blue)` : '1px solid transparent',
                    borderLeft: isTarget ? `2px solid var(--accent-blue)` : '2px solid transparent',
                    background: active ? 'var(--bg-primary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    opacity: isDragged ? 0.4 : 1,
                    fontFamily: FONT_STYLE.fontFamily,
                    transition: 'opacity 80ms, border-color 80ms',
                  }}
                >
                  {tab.docType
                    ? <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{DOC_ICONS[tab.docType] ?? '📄'}</span>
                    : <FileIcon size={12} style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                  }
                  <span>{tab.name}</span>
                  {tab.dirty && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0 }} />}
                  <span
                    role="button" tabIndex={0}
                    onClick={e => closeTab(e, tab.path)}
                    onKeyDown={e => e.key === 'Enter' && closeTab(e as unknown as React.MouseEvent, tab.path)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 3,
                      opacity: active ? 0.6 : 0, color: 'var(--text-primary)', cursor: 'pointer',
                      transition: 'opacity 80ms, background 80ms',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = active ? '0.6' : '0'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <XIcon size={10} weight="bold" />
                  </span>
                </button>
              );
            })}
          </div>{/* end scrollable tab list */}

          {/* Run button — always visible, runs the whole project */}
          <div style={{ flexShrink: 0, padding: '0 8px', borderLeft: `1px solid var(--border-primary)`, display: 'flex', alignItems: 'center', height: '100%' }}>
            {previewUrl ? (
              <button type="button" onClick={() => {
                setPreviewUrl(null);
                fetch(`${HTTP_BASE}/api/dev-server/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd }) }).catch(() => null);
              }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 11, border: `1px solid var(--accent-red)`, borderRadius: 3, background: 'transparent', color: 'var(--accent-red)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-red)', display: 'inline-block' }} /> Stop
              </button>
            ) : (
              <button type="button" disabled={previewLoading} onClick={async () => {
                setPreviewLoading(true);
                try {
                  const r = await fetch(`${HTTP_BASE}/api/dev-server/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd }) });
                  const d = await r.json() as { url?: string; error?: string };
                  if (d.url) setPreviewUrl(d.url); else setError(d.error ?? 'Failed to start dev server');
                } catch (e) { setError(String(e)); } finally { setPreviewLoading(false); }
              }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 11, border: `1px solid var(--accent-green)`, borderRadius: 3, background: 'transparent', color: 'var(--accent-green)', cursor: 'pointer', opacity: previewLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                {previewLoading ? 'Starting…' : 'Run'}
              </button>
            )}
          </div>
        </div>{/* end tab bar */}

        {/* Path + save toolbar — hidden for doc files which have their own toolbar */}
        {currentTab && !currentTab.docType && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 14px', background: 'var(--bg-tertiary)',
            borderBottom: `1px solid var(--border-primary)`, flexShrink: 0,
          }}>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FONT_STYLE.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTab.path.replace(cwd, '').replace(/^\//, '')}
            </span>
            {currentTab.dirty && (
              <button type="button" onClick={() => void save()} disabled={saving} style={{
                padding: '2px 10px', fontSize: 11, flexShrink: 0,
                border: `1px solid var(--accent-blue)`, borderRadius: 3,
                background: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer',
              }}>
                {saving ? 'Saving…' : 'Save  ⌘S'}
              </button>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: '4px 14px', fontSize: 11, color: '#FA4B42', background: 'rgba(229,53,43,0.08)', borderBottom: `1px solid rgba(229,53,43,0.2)`, flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* ── Document viewer or syntax-highlighted editor ─────────── */}
        {currentTab ? (
          currentTab.isExcel ? (
            /* ── Excel spreadsheet — ExcelEditor handles data loading internally ── */
            <React.Suspense fallback={<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text-tertiary)',fontSize:13 }}>Loading spreadsheet…</div>}>
              <ExcelEditor filePath={currentTab.path} style={{ flex: 1, minHeight: 0 }} />
            </React.Suspense>
          ) : currentTab.isPpt ? (
            /* ── PowerPoint — PptEditor handles data loading internally ── */
            <React.Suspense fallback={<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text-tertiary)',fontSize:13 }}>Loading presentation…</div>}>
              <PptEditor filePath={currentTab.path} style={{ flex: 1, minHeight: 0 }} />
            </React.Suspense>
          ) : currentTab.docType ? (
            /* ── Document viewer / editor ── */
            <div className="doc-word-shell">
              {/* Toolbar — meta info + save button only */}
              <div className="doc-word-toolbar">
                <span className="doc-word-toolbar-icon">{DOC_ICONS[currentTab.docType] ?? '📄'}</span>
                <span className="doc-word-toolbar-name">{currentTab.name}</span>
                <span className="doc-word-toolbar-sep">·</span>
                <span>{currentTab.docType.toUpperCase()}</span>
                <span className="doc-word-toolbar-sep">·</span>
                <span>{currentTab.docPages} page{currentTab.docPages !== 1 ? 's' : ''}</span>
                <span className="doc-word-toolbar-sep">·</span>
                <span>{currentTab.docWordCount?.toLocaleString()} words</span>
                {currentTab.docTruncated && <span className="doc-word-toolbar-truncated">⚠ truncated</span>}
                <span style={{ flex: 1 }} />
                {currentTab.dirty && (
                  <button type="button" className="doc-word-save-btn" onClick={() => void save()} disabled={saving}>
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
                  initialCursor={cursors[currentTab.path]}
                  onChange={(blocks: Block[]) => setTabs(prev => prev.map(t => t.path === activeTab ? { ...t, blocks, dirty: true } : t))}
                  onCursorChange={(cursor) => handleCursorChange(currentTab.path, cursor)}
                  style={{ flex: 1, minHeight: 0 }}
                />
              ) : (
                /* Other docs (PDF/XLSX/PPTX): markdown rendered on a white page */
                <div className="doc-word-canvas">
                  <div className="doc-word-page">
                    <div className="doc-word-view" dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(currentTab.content) }} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Syntax-highlighted editor ── */
            <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}>
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
                    position: 'relative', display: 'block',
                    width: '100%', minHeight: '100%',
                    paddingTop: PAD.top, paddingRight: PAD.right,
                    paddingBottom: PAD.bottom, paddingLeft: LN_WIDTH,
                    border: 'none', outline: 'none', resize: 'none',
                    background: 'transparent', color: 'transparent',
                    caretColor: 'var(--accent-blue)',
                    overflow: 'hidden', whiteSpace: 'pre',
                    wordBreak: 'normal', overflowWrap: 'normal',
                  }}
                  onChange={e => {
                    const val = e.target.value;
                    setTabs(prev => prev.map(t => t.path === activeTab ? { ...t, content: val, dirty: true } : t));
                  }}
                  onKeyDown={e => {
                    if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const s = ta.selectionStart, end = ta.selectionEnd;
                      const spaces = codeMode ? '  ' : '    ';
                      const next = currentTab.content.slice(0, s) + spaces + currentTab.content.slice(end);
                      setTabs(prev => prev.map(t => t.path === activeTab ? { ...t, content: next, dirty: true } : t));
                      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + spaces.length; });
                    }
                  }}
                />
              </div>
            </div>
          )
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Select a file from the tree to open it
          </div>
        )}
      </div>
    </div>
  );
}
