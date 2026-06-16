/**
 * PowerPoint Viewer/Editor — isolated module ported from bz-office slide-docs.
 * Only this file should be imported by the rest of bz-agent.
 *
 * Usage:
 *   import { PptEditor } from '#/ppt';
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, cloneDeep } from 'lodash';

const SlideCanvas = React.lazy(() => import('./components/Slide')) as any;

const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

export interface PptEditorProps {
  filePath: string;
  style?: React.CSSProperties;
}

// ── tiny uuid ──────────────────────────────────────────────────────────────
const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ── ThumbnailCanvas ────────────────────────────────────────────────────────
const THUMB_W = 896, THUMB_H = 504;

function ThumbnailCanvas({ slide }: { slide: any }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, THUMB_W, THUMB_H);
    ctx.fillStyle = slide?.bgColor || '#ffffff';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    (slide?.boxes || []).forEach((box: any) => {
      const { x, y, w, h } = box;
      if (box.canvasImage || (typeof box.text === 'string' && box.text.startsWith('data:image'))) {
        try {
          const img = box.canvasImage || (() => { const i = new Image(); i.src = box.text; return i; })();
          ctx.drawImage(img, x, y, w, h);
        } catch {}
        return;
      }
      if (typeof box.text === 'string' && box.text.startsWith('shape:')) {
        try {
          const sc = JSON.parse(box.text.slice(6));
          ctx.fillStyle = sc.bgColor || '#1473df'; ctx.strokeStyle = sc.borderColor || '#0d5bb5'; ctx.lineWidth = sc.borderWidth || 2;
          if (sc.type === 'circle') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
          else { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
        } catch {}
        return;
      }
      const bg = box.boxStyle?.bgColor || 'transparent';
      if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
      const text = box.text;
      if (text && typeof text === 'string' && !text.startsWith('data:') && !text.startsWith('shape:')) {
        const fs = Math.max(8, box.boxStyle?.fontSize || 14);
        ctx.fillStyle = box.boxStyle?.color || '#000000';
        ctx.font = `${box.boxStyle?.fontWeight || 400} ${fs}px Montserrat, sans-serif`;
        ctx.textBaseline = 'top';
        const pad = 5, maxW = w - pad * 2, lh = fs * 1.2;
        let cx = x + pad, cy = y + pad;
        text.split(' ').reduce((line: string, word: string) => {
          const test = line + (line ? ' ' : '') + word;
          if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, cy); cy += lh; return word; }
          return test;
        }, '');
      }
    });
  }, [JSON.stringify(slide)]);

  return (
    <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={ref} width={THUMB_W} height={THUMB_H} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

// ── icons ──────────────────────────────────────────────────────────────────
const Icon = ({ d, ...p }: { d: string; [k: string]: any }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d.split('|').map((seg, i) => <path key={i} d={seg} />)}
  </svg>
);
const LineIcon = ({ x1, y1, x2, y2, ...p }: any) => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" {...p}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} />
  </svg>
);

// ── Btn helper ─────────────────────────────────────────────────────────────
function Btn({ title, active, onClick, children, style }: { title?: string; active?: boolean; onClick?: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, cursor: 'pointer', border: 'none', flexShrink: 0,
        color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-blue-light)' : hover ? 'var(--bg-hover)' : 'transparent',
        ...style,
      }}
    >{children}</button>
  );
}

// ── main component ─────────────────────────────────────────────────────────
export function PptEditor({ filePath, style }: PptEditorProps) {
  const [slides, setSlides]           = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [slideIndex, setSlideIndex]   = useState(0);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel]     = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool]   = useState<string>('select');
  const [saveMsg, setSaveMsg]         = useState('');

  const canvasWrapRef = useRef<HTMLDivElement>(null);

  // ── load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!filePath) return;
    setLoading(true); setError('');
    fetch(`${HTTP_BASE}/api/ppt/load?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setSlides(d.slides || []);
        setSlideIndex(0);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [filePath]);

  // ── save ──────────────────────────────────────────────────────────────────
  const doSave = useCallback((slidesToSave: any[]) => {
    // Strip canvasImage (not JSON-serializable)
    const clean = slidesToSave.map(s => ({
      ...s,
      boxes: s.boxes?.map((b: any) => { const { canvasImage, ...rest } = b; return rest; }) || [],
    }));
    fetch(`${HTTP_BASE}/api/ppt/save`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, slides: clean }),
    })
      .then(() => { setSaveMsg('Saved'); setTimeout(() => setSaveMsg(''), 1500); })
      .catch(() => { setSaveMsg('Save failed'); setTimeout(() => setSaveMsg(''), 2000); });
  }, [filePath]);

  // ── fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const enterPresent = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvasWrapRef.current?.requestFullscreen();
  };

  // ── keyboard nav ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      const last = slides.length - 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setSlideIndex(i => clamp(i - 1, 0, last)); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); setSlideIndex(i => clamp(i + 1, 0, last)); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen, slides.length]);

  // ── slide mutation ─────────────────────────────────────────────────────────
  const setCurrentSlide = useCallback((newSlide: any) => {
    setSlides(prev => prev.map((s, i) => i === slideIndex ? newSlide : s));
  }, [slideIndex]);

  const saveCurrentSlide = useCallback((newSlide: any) => {
    const updated = slides.map((s, i) => i === slideIndex ? newSlide : s);
    setSlides(updated);
    doSave(updated);
  }, [slides, slideIndex, doSave]);

  const addSlide = () => {
    const s = [...slides, { bgColor: '#ffffff', boxes: [] }];
    setSlides(s);
    setSlideIndex(s.length - 1);
  };

  // ── toolbar helpers ───────────────────────────────────────────────────────
  const addStyleAtSelection = (styleFields: any) => {
    const slide = slides[slideIndex];
    const nc = cloneDeep(slide);
    const box = nc.boxes?.find((b: any) => b.isSelected);
    const sel = box?.styles?.find((s: any) => s.isSelection);
    if (!sel) return;
    box.styles.push({ start: sel.start, end: sel.end, ...styleFields });
    setCurrentSlide(nc);
  };

  const currentSlide = slides[slideIndex];
  const selectedBox  = currentSlide?.boxes?.find((b: any) => b.isSelected);
  const selStyle     = selectedBox?.styles?.find((s: any) => s.isSelection);
  const stylesInSel  = selectedBox?.styles?.filter((s: any) => s.start <= (selStyle?.end ?? -1) && s.end >= (selStyle?.start ?? Infinity));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topStyle: any = stylesInSel?.length ? Object.assign({}, ...cloneDeep(stylesInSel)) : {};

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: 13 }}>
      Loading presentation…
    </div>
  );
  if (error) return <div style={{ padding: 16, color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>;

  const Sep = () => <div style={{ width: 1, height: 20, background: 'var(--border-primary)', margin: '0 4px', flexShrink: 0 }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-primary)', fontFamily: 'var(--font-body)', fontSize: 13, ...style }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* New slide */}
        <Btn title="New slide" onClick={addSlide}>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="12" y1="7" x2="12" y2="13" /><line x1="9" y1="10" x2="15" y2="10" /></svg>
        </Btn>
        <Sep />
        {/* Tool buttons */}
        {([
          { id: 'select', title: 'Select', icon: <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg> },
          { id: 'text',   title: 'Text box', icon: <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg> },
          { id: 'shape',  title: 'Shape', icon: <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10" /></svg> },
          { id: 'line',   title: 'Line', icon: <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><line x1="5" y1="19" x2="19" y2="5" /></svg> },
        ] as { id: string; title: string; icon: React.ReactNode }[]).map(t => (
          <Btn key={t.id} title={t.title} active={activeTool === t.id} onClick={() => setActiveTool(t.id)}>{t.icon}</Btn>
        ))}
        {/* Image upload */}
        <Btn title="Insert image" style={{ position: 'relative', overflow: 'hidden' }}>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              const b64: string = await new Promise(res => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(file); });
              const img = new Image(); img.src = b64;
              img.onload = () => {
                const nc = cloneDeep(currentSlide);
                nc.boxes?.forEach((b: any) => { b.isSelected = false; });
                nc.boxes = nc.boxes || [];
                const h = Math.min(300, img.height), w = img.width * (h / img.height);
                nc.boxes.unshift({ id: uuidv4(), x: 100, y: 70, w, h, styles: [], boxStyle: { bgColor: 'transparent' }, isSelected: true, text: b64, canvasImage: img });
                saveCurrentSlide(nc);
              };
              e.target.value = '';
            }}
          />
        </Btn>
        <Sep />

        {/* Text formatting — only when a box is selected */}
        {selectedBox && (<>
          <Btn title="Bold" active={topStyle.fontWeight === 'bold'} onMouseDown={(e: React.MouseEvent) => e.preventDefault()} onClick={() => addStyleAtSelection({ fontWeight: topStyle.fontWeight === 'bold' ? 'normal' : 'bold' })}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /></svg>
          </Btn>
          <Btn title="Italic" active={topStyle.fontStyle === 'italic'} onMouseDown={(e: React.MouseEvent) => e.preventDefault()} onClick={() => addStyleAtSelection({ fontStyle: topStyle.fontStyle === 'italic' ? 'normal' : 'italic' })}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
          </Btn>
          <Btn title="Underline" active={topStyle.textDecoration === 'underline'} onMouseDown={(e: React.MouseEvent) => e.preventDefault()} onClick={() => addStyleAtSelection({ textDecoration: topStyle.textDecoration === 'underline' ? 'none' : 'underline' })}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>
          </Btn>
        </>)}

        {saveMsg && <span style={{ fontSize: 11, color: saveMsg.includes('fail') ? 'var(--accent-red)' : 'var(--accent-green)', marginLeft: 8 }}>{saveMsg}</span>}
      </div>

      {/* ── Workspace ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Thumbnail panel */}
        {!panelCollapsed && (
          <div style={{ width: 180, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Slides</span>
              <button onClick={() => setPanelCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slides.map((s, i) => (
                <div key={i} onClick={() => setSlideIndex(i)} style={{ position: 'relative', borderRadius: 5, border: `2px solid ${slideIndex === i ? 'var(--accent-blue)' : 'transparent'}`, cursor: 'pointer', overflow: 'hidden', background: s.bgColor || '#ffffff' }}>
                  <span style={{ position: 'absolute', top: 3, left: 3, width: 16, height: 16, background: 'rgba(0,0,0,0.5)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'white', zIndex: 2 }}>{i + 1}</span>
                  <ThumbnailCanvas slide={s} />
                </div>
              ))}
              <button onClick={addSlide} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, borderRadius: 5, border: '2px dashed var(--border-primary)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-body)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add slide
              </button>
            </div>
          </div>
        )}

        {/* Canvas area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-tertiary)', position: 'relative' }}>
          {panelCollapsed && (
            <button onClick={() => setPanelCollapsed(false)} style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', padding: 4, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            </button>
          )}

          <div
            ref={canvasWrapRef}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 32, overflow: 'auto', overscrollBehavior: 'none',
              ...(isFullscreen ? { padding: 0, background: '#000', width: '100vw', height: '100vh' } : {}),
            }}
          >
            <div style={{
              width: '100%', maxWidth: 896,
              aspectRatio: '16/9',
              background: currentSlide?.bgColor || '#ffffff',
              borderRadius: isFullscreen ? 0 : 8,
              boxShadow: isFullscreen ? 'none' : '0 8px 40px rgba(0,0,0,0.3)',
              position: 'relative', overflow: 'hidden',
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'center center',
              ...(isFullscreen ? { width: 'min(100vw, calc(100vh * 16 / 9))', height: 'min(100vh, calc(100vw * 9 / 16))', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, boxShadow: 'none', transform: 'none', aspectRatio: 'auto' } : {}),
            }}>
              <React.Suspense fallback={null}>
                {currentSlide && (
                  <SlideCanvas
                    config={currentSlide}
                    isPresentationMode={isFullscreen}
                    activeTool={activeTool}
                    setConfig={setCurrentSlide}
                    onSave={saveCurrentSlide}
                    defaultCursor="default"
                  />
                )}
              </React.Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{ height: 28, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)', flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span>Slide {slideIndex + 1} of {slides.length}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setZoomLevel(z => Math.max(z - 10, 50))} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)', border: 'none', background: 'transparent' }}>
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
            <span style={{ minWidth: 36, textAlign: 'center' }}>{zoomLevel}%</span>
            <button onClick={() => setZoomLevel(z => Math.min(z + 10, 200))} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)', border: 'none', background: 'transparent' }}>
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
          </div>
          {/* Present */}
          <button onClick={enterPresent} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'white', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            Present
          </button>
        </div>
      </div>
    </div>
  );
}
