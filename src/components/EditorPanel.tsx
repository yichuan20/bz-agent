/**
 * EditorPanel — VS Code-style dark editor for worker/coder modes.
 *
 * Syntax highlighting uses the overlay technique:
 *   - bottom layer: <pre> with coloured <span>s (pointer-events:none)
 *   - top layer: transparent <textarea> that captures all input
 *   - both share identical font/padding so they stay pixel-aligned
 *   - the outer div scrolls; both layers follow
 */
import { useEffect, useRef, useState } from 'react';
import { FileIcon, FolderIcon, FolderOpenIcon, XIcon } from '@phosphor-icons/react';

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

function TreeNode({ entry, depth, selected, onSelect }: {
  entry: FsEntry; depth: number; selected: string | null; onSelect: (p: string) => void;
}) {
  const [open, setOpen]     = useState(depth === 0);
  const [kids, setKids]     = useState<FsEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const isActive = entry.path === selected && !entry.isDir;

  function load() {
    if (loaded) return;
    const HIDDEN = new Set(['.git','node_modules','__pycache__','.venv','.bzhub','dist','.next','.turbo']);
    fetch(`${HTTP_BASE}/files?path=${encodeURIComponent(entry.path)}`)
      .then(r => r.json())
      .then((d: { entries?: FsEntry[] }) => {
        setKids((d.entries ?? []).filter(e => !e.name.startsWith('.') && !HIDDEN.has(e.name)));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  const toggle = () => { if (!loaded) load(); setOpen(v => !v); };
  const name   = entry.name || entry.path.split('/').filter(Boolean).pop() || entry.path;

  return (
    <div>
      <button
        type="button"
        onClick={() => entry.isDir ? toggle() : onSelect(entry.path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', textAlign: 'left',
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          border: 'none', cursor: 'pointer', borderRadius: 3,
          background: isActive ? 'rgba(86,156,214,0.18)' : 'transparent',
          color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
          fontSize: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          transition: 'background 80ms',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        {entry.isDir
          ? open
            ? <FolderOpenIcon size={13} style={{ color: FOLDER_COLOR, flexShrink: 0 }} weight="duotone" />
            : <FolderIcon     size={13} style={{ color: FOLDER_COLOR, flexShrink: 0 }} weight="duotone" />
          : <FileIcon         size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        }
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </button>
      {entry.isDir && open && kids.map(k => (
        <TreeNode key={k.path} entry={k} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ── Editor panel ──────────────────────────────────────────────────────────────
interface Tab { path: string; name: string; content: string; dirty: boolean }

interface Props { cwd: string; codeMode: boolean; refreshKey?: number }

export function EditorPanel({ cwd, codeMode, refreshKey }: Props) {
  const [tabs,      setTabs]      = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [dragTab,   setDragTab]   = useState<string | null>(null);
  const [dragOver,  setDragOver]  = useState<string | null>(null);

  // The outer scrollable div — both highlight and textarea scroll with it
  const scrollRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const rootEntry: FsEntry = { name: cwd.split('/').filter(Boolean).pop() ?? cwd, path: cwd, isDir: true };
  const currentTab = tabs.find(t => t.path === activeTab) ?? null;

  // Open a file: fetch content and add a tab
  async function openFile(filePath: string) {
    if (tabs.find(t => t.path === filePath)) { setActiveTab(filePath); return; }
    setError('');
    try {
      const r = await fetch(`${HTTP_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
      const d = await r.json() as { content?: string; error?: string };
      if (d.error) { setError(d.error); return; }
      const name = filePath.split('/').pop() ?? filePath;
      setTabs(prev => [...prev, { path: filePath, name, content: d.content ?? '', dirty: false }]);
      setActiveTab(filePath);
    } catch (e) { setError(String(e)); }
  }

  // Reload active file when agent finishes a turn (increments refreshKey)
  useEffect(() => {
    if (!activeTab) return;
    fetch(`${HTTP_BASE}/api/file?path=${encodeURIComponent(activeTab)}`)
      .then(r => r.json())
      .then((d: { content?: string }) => {
        if (d.content !== undefined)
          setTabs(prev => prev.map(t => t.path === activeTab && !t.dirty ? { ...t, content: d.content! } : t));
      })
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, refreshKey]);

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

  async function save() {
    if (!currentTab?.dirty) return;
    setSaving(true);
    try {
      await fetch(`${HTTP_BASE}/api/file`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentTab.path, content: currentTab.content }),
      });
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

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden', borderRight: `1px solid var(--border-primary)` }}>

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
          <TreeNode entry={rootEntry} depth={0} selected={activeTab} onSelect={openFile} />
        </div>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflow: 'hidden' }}>

        {/* Tab bar — tabs are draggable to reorder */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', background: 'var(--bg-secondary)',
          borderBottom: `1px solid var(--border-primary)`, minHeight: 35, flexShrink: 0, overflowX: 'auto',
        }}>
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
                  <FileIcon size={12} style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
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
        </div>

        {/* Path + save toolbar */}
        {currentTab && (
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

        {/* ── Syntax-highlighted editor area ──────────────────────────── */}
        {currentTab ? (
          /* Outer scroll container — BOTH layers scroll together */
          <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}>
            {/* Inner sizing wrapper */}
            <div style={{ position: 'relative', minWidth: '100%', minHeight: '100%' }}>

              {/* Highlight layer (bottom, non-interactive) */}
              <HighlightLayer content={currentTab.content} filename={currentTab.name} />

              {/* Transparent textarea on top — captures all input, shows cursor only */}
              <textarea
                ref={textareaRef}
                value={currentTab.content}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                style={{
                  ...editorFont,
                  position: 'relative',         // flows in document, pushes height
                  display: 'block',
                  width: '100%',
                  minHeight: '100%',
                  // Padding MUST match HighlightLayer pixel-for-pixel
                  paddingTop:    PAD.top,
                  paddingRight:  PAD.right,
                  paddingBottom: PAD.bottom,
                  paddingLeft:   LN_WIDTH,  // = fixed line-number column width
                  border: 'none', outline: 'none', resize: 'none',
                  background: 'transparent',
                  color: 'transparent',           // hide text — highlight layer shows colours
                  caretColor: 'var(--accent-blue)',           // but show the cursor
                  overflow: 'hidden',             // outer div scrolls, not this element
                  whiteSpace: 'pre',
                  wordBreak: 'normal',
                  overflowWrap: 'normal',
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
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Select a file from the tree to open it
          </div>
        )}
      </div>
    </div>
  );
}
