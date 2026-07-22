/**
 * PowerPoint Viewer/Editor — isolated module ported from bz-office slide-docs.
 * Only this file should be imported by the rest of bz-agent.
 *
 * Usage:
 *   import { PptEditor } from '#/ppt';
 */

import { clamp, cloneDeep } from 'lodash';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH, drawConfig, SF } from './components/Slide';

const SlideCanvas = React.lazy(() => import('./components/Slide')) as any;

import { HTTP_BASE } from '#/lib/api';

export interface PptEditorProps {
  filePath: string;
  style?: React.CSSProperties;
  onDirty?: () => void;
  onClean?: () => void;
  saveRef?: { current: (() => void) | null };
}

// ── tiny uuid ──────────────────────────────────────────────────────────────
const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ── Thumbnail render queue — one render per animation frame ───────────────
const _thumbQueue: Array<() => void> = [];
let _thumbRunning = false;
function _processThumbQueue() {
  if (!_thumbQueue.length) {
    _thumbRunning = false;
    return;
  }
  _thumbQueue.shift()?.();
  requestAnimationFrame(_processThumbQueue);
}
function _enqueueThumb(fn: () => void, priority = false) {
  if (priority) _thumbQueue.unshift(fn);
  else _thumbQueue.push(fn);
  if (!_thumbRunning) {
    _thumbRunning = true;
    requestAnimationFrame(_processThumbQueue);
  }
}

// Thumbnail canvas size — quarter of full resolution is plenty for the sidebar
const THUMB_W = Math.round(CANVAS_WIDTH / 2);
const THUMB_H = Math.round(CANVAS_HEIGHT / 2);

// ── ThumbnailCanvas ────────────────────────────────────────────────────────
function ThumbnailCanvas({ slide, priority }: { slide: any; priority?: boolean }) {
  const [url, setUrl] = useState('');
  // Change key: tracks all visual properties except large base64 image payloads.
  const _changeKey =
    slide?.boxes
      ?.map((b: any) => {
        const t = b.text || '';
        const textPart = t.startsWith('data:image') || t.startsWith('shape:') ? `img:${b.id}` : t;
        const fill =
          typeof b.fill === 'object' ? `${b.fill?.color}:${b.fill?.opacity}` : b.fill || '';
        return `${b.id}:${b.x}:${b.y}:${b.w}:${b.h}:${b.type}:${fill}:${b.cornerRadius || 0}:${b.opacity || 1}:${textPart}`;
      })
      .join('\x1f') +
    `|${slide?.bgColor}|${JSON.stringify(slide?.bgGradient)}|${slide?.slideWidthPt}`;

  useEffect(() => {
    if (!slide) return;
    let cancelled = false;
    const boxes: any[] = slide?.boxes || [];
    // Pre-load PPTX-imported base64 images (no canvasImage yet) so the one-shot draw succeeds.
    const imageBoxes = boxes.filter((b: any) => {
      const t = b.text || '';
      return t.startsWith('data:image') && !b.canvasImage;
    });
    const loadAll: Promise<void> =
      imageBoxes.length === 0
        ? Promise.resolve()
        : (Promise.all(
            imageBoxes.map(
              (b: any) =>
                new Promise<void>(resolve => {
                  const img = new Image();
                  img.onload = () => {
                    b.canvasImage = img;
                    resolve();
                  };
                  img.onerror = () => resolve();
                  img.src = b.text;
                }),
            ),
          ) as unknown as Promise<void>);
    loadAll.then(() => {
      if (cancelled) return;
      _enqueueThumb(() => {
        const oc = document.createElement('canvas');
        oc.width = THUMB_W;
        oc.height = THUMB_H;
        const ctx = oc.getContext('2d')!;
        ctx.save();
        // Scale so drawConfig's SF-multiplied coordinates fit into THUMB_W×THUMB_H
        ctx.scale(THUMB_W / (CANVAS_WIDTH * SF), THUMB_H / (CANVAS_HEIGHT * SF));
        drawConfig(ctx, slide, { x: 0, y: 0 }, true, null);
        ctx.restore();
        setUrl(oc.toDataURL('image/jpeg', 0.75));
      }, priority);
    });
    return () => {
      cancelled = true;
    };
  }, [priority, slide]);

  return <img src={url} style={{ width: '100%', display: 'block' }} />;
}

// ── Btn helper ─────────────────────────────────────────────────────────────
function Btn({
  title,
  active,
  onClick,
  onMouseDown,
  children,
  style,
}: {
  title?: string;
  active?: boolean;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 5,
        cursor: 'pointer',
        border: 'none',
        flexShrink: 0,
        color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-blue-light)' : hover ? 'var(--bg-hover)' : 'transparent',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Font family dropdown (matches Word/Excel style) ────────────────────────
function FontFamilyPicker({
  value,
  onChange,
  fonts,
}: {
  value: string;
  onChange: (f: string) => void;
  fonts: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--text-secondary)',
          height: 26,
          border: '1px solid var(--border-default, var(--border-primary))',
          background: 'transparent',
          minWidth: 110,
          maxWidth: 150,
        }}
      >
        <span
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {value}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="10"
          height="10"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 180,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--bg-elevated, var(--bg-primary))',
            border: '1px solid var(--border-default, var(--border-primary))',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            padding: 4,
            zIndex: 9999,
          }}
        >
          {fonts.map(f => (
            <div
              key={f}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(f);
                setOpen(false);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: f,
                color: f === value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                background:
                  f === value
                    ? 'color-mix(in srgb, var(--accent-blue) 12%, transparent)'
                    : 'transparent',
              }}
            >
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Color utilities ────────────────────────────────────────────────────────
function parseColorInput(color: string): { hex: string; alpha: number } {
  if (!color || color === 'transparent') return { hex: '#000000', alpha: 0 };
  if (color.startsWith('rgba(')) {
    const p = color.slice(5, -1).split(',');
    const r = parseInt(p[0] ?? '0', 10),
      g = parseInt(p[1] ?? '0', 10),
      b = parseInt(p[2] ?? '0', 10);
    const a = parseFloat(p[3] ?? '1');
    return {
      hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
      alpha: a,
    };
  }
  if (color.startsWith('rgb(')) {
    const p = color.slice(4, -1).split(',');
    const r = parseInt(p[0] ?? '0', 10),
      g = parseInt(p[1] ?? '0', 10),
      b = parseInt(p[2] ?? '0', 10);
    return {
      hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
      alpha: 1,
    };
  }
  if (color.startsWith('#')) {
    const h =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    return { hex: h.slice(0, 7), alpha: 1 };
  }
  return { hex: '#000000', alpha: 1 };
}

function toRgbaString(hex: string, alpha: number): string {
  if (alpha <= 0) return 'transparent';
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  if (alpha >= 0.999) return hex;
  return `rgba(${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)},${alpha.toFixed(2)})`;
}

// ── ColorPicker ────────────────────────────────────────────────────────────
// Office theme palette + standard 10×10 grid
const OFFICE_COLORS = [
  '#000000',
  '#ffffff',
  '#44546a',
  '#e7e6e6',
  '#4472c4',
  '#ed7d31',
  '#a5a5a5',
  '#ffc000',
  '#5b9bd5',
  '#70ad47',
];
const STD_COLORS: string[] = (() => {
  const cols: string[] = [];
  // grays
  for (let i = 0; i <= 9; i++) {
    const v = Math.round((i * 255) / 9);
    cols.push(`#${v.toString(16).padStart(2, '0').repeat(3)}`);
  }
  // hues at full sat
  const hues = [0, 30, 45, 60, 120, 180, 210, 240, 270, 300];
  for (const sat of [1, 0.7, 0.5, 0.35, 0.2, 0.12]) {
    for (const h of hues) {
      const s = sat,
        l = sat > 0.7 ? 0.5 : sat > 0.4 ? 0.38 : sat > 0.25 ? 0.3 : 0.22;
      const c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
        m = l - c / 2;
      let r = 0,
        g = 0,
        b = 0;
      if (h < 60) {
        r = c;
        g = x;
      } else if (h < 120) {
        r = x;
        g = c;
      } else if (h < 180) {
        g = c;
        b = x;
      } else if (h < 240) {
        g = x;
        b = c;
      } else if (h < 300) {
        r = x;
        b = c;
      } else {
        r = c;
        b = x;
      }
      cols.push(
        `#${Math.round((r + m) * 255)
          .toString(16)
          .padStart(2, '0')}${Math.round((g + m) * 255)
          .toString(16)
          .padStart(2, '0')}${Math.round((b + m) * 255)
          .toString(16)
          .padStart(2, '0')}`,
      );
    }
  }
  return cols;
})();

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return `#${Math.round((r + m) * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round((g + m) * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round((b + m) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}
function hexToHsv(hex: string): [number, number, number] {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const r = parseInt(m[1]!, 16) / 255,
    g = parseInt(m[2]!, 16) / 255,
    b = parseInt(m[3]!, 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, max ? d / max : 0, max];
}

function AdvancedColorPicker({
  hex,
  alpha,
  onChange,
  onClose,
}: {
  hex: string;
  alpha: number;
  onChange: (hex: string, alpha: number) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(hex));
  const [localAlpha, setLocalAlpha] = useState(alpha);
  const [hexInput, setHexInput] = useState(hex.replace('#', ''));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingSv = useRef(false);
  const draggingH = useRef(false);
  const draggingA = useRef(false);

  const W = 220,
    H = 140,
    SH = 14;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    // SV gradient
    const gW = ctx.createLinearGradient(0, 0, W, 0);
    gW.addColorStop(0, '#fff');
    gW.addColorStop(1, hsvToHex(hsv[0], 1, 1));
    ctx.fillStyle = gW;
    ctx.fillRect(0, 0, W, H);
    const gB = ctx.createLinearGradient(0, 0, 0, H);
    gB.addColorStop(0, 'transparent');
    gB.addColorStop(1, '#000');
    ctx.fillStyle = gB;
    ctx.fillRect(0, 0, W, H);
    // dot
    const sx = hsv[1] * W,
      sy = (1 - hsv[2]) * H;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv]);

  const pickSv = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / W));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / H));
    const nh: [number, number, number] = [hsv[0], s, v];
    setHsv(nh);
    setHexInput(hsvToHex(nh[0], nh[1], nh[2]).replace('#', ''));
    onChange(hsvToHex(nh[0], nh[1], nh[2]), localAlpha);
  };

  const currentHex = hsvToHex(hsv[0], hsv[1], hsv[2]);

  return (
    <div style={{ padding: 12, width: W + 24 }}>
      {/* SV canvas */}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ borderRadius: 6, cursor: 'crosshair', display: 'block', marginBottom: 8 }}
        onMouseDown={e => {
          draggingSv.current = true;
          pickSv(e);
        }}
        onMouseMove={e => {
          if (draggingSv.current) pickSv(e);
        }}
        onMouseUp={() => {
          draggingSv.current = false;
        }}
        onMouseLeave={() => {
          draggingSv.current = false;
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* color preview */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
            background: 'repeating-linear-gradient(45deg,#ccc 0,#ccc 4px,#fff 4px,#fff 8px)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: toRgbaString(currentHex, localAlpha),
            }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Hue slider */}
          <div
            style={{
              position: 'relative',
              height: SH,
              borderRadius: SH / 2,
              background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
              cursor: 'pointer',
            }}
            onMouseDown={e => {
              draggingH.current = true;
              const r = e.currentTarget.getBoundingClientRect();
              const h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360));
              const nh: [number, number, number] = [h, hsv[1], hsv[2]];
              setHsv(nh);
              setHexInput(hsvToHex(h, hsv[1], hsv[2]).replace('#', ''));
              onChange(hsvToHex(h, hsv[1], hsv[2]), localAlpha);
            }}
            onMouseMove={e => {
              if (!draggingH.current) return;
              const r = e.currentTarget.getBoundingClientRect();
              const h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360));
              const nh: [number, number, number] = [h, hsv[1], hsv[2]];
              setHsv(nh);
              setHexInput(hsvToHex(h, hsv[1], hsv[2]).replace('#', ''));
              onChange(hsvToHex(h, hsv[1], hsv[2]), localAlpha);
            }}
            onMouseUp={() => {
              draggingH.current = false;
            }}
            onMouseLeave={() => {
              draggingH.current = false;
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -1,
                width: SH + 2,
                height: SH + 2,
                borderRadius: '50%',
                background: hsvToHex(hsv[0], 1, 1),
                border: '2px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                left: `calc(${(hsv[0] / 360) * 100}% - ${SH / 2}px)`,
                pointerEvents: 'none',
              }}
            />
          </div>
          {/* Alpha slider */}
          <div
            style={{
              position: 'relative',
              height: SH,
              borderRadius: SH / 2,
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onMouseDown={e => {
              draggingA.current = true;
              const r = e.currentTarget.getBoundingClientRect();
              const a = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
              setLocalAlpha(a);
              onChange(currentHex, a);
            }}
            onMouseMove={e => {
              if (!draggingA.current) return;
              const r = e.currentTarget.getBoundingClientRect();
              const a = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
              setLocalAlpha(a);
              onChange(currentHex, a);
            }}
            onMouseUp={() => {
              draggingA.current = false;
            }}
            onMouseLeave={() => {
              draggingA.current = false;
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'repeating-linear-gradient(45deg,#ccc 0,#ccc 3px,#fff 3px,#fff 6px)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(to right, transparent, ${currentHex})`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -1,
                width: SH + 2,
                height: SH + 2,
                borderRadius: '50%',
                background: toRgbaString(currentHex, localAlpha),
                border: '2px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                left: `calc(${localAlpha * 100}% - ${SH / 2}px)`,
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
      {/* Hex + RGBA inputs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 9, color: '#888', marginBottom: 2, textAlign: 'center' }}>
            Hex
          </div>
          <input
            value={hexInput}
            onChange={e => {
              setHexInput(e.target.value);
              const h = `#${e.target.value.replace('#', '')}`;
              if (/^#[0-9a-f]{6}$/i.test(h)) {
                setHsv(hexToHsv(h));
                onChange(h, localAlpha);
              }
            }}
            style={{
              width: '100%',
              height: 26,
              fontSize: 11,
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              textAlign: 'center',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {(['R', 'G', 'B'] as const).map((ch, ci) => {
          const vals = [
            parseInt(currentHex.slice(1, 3), 16),
            parseInt(currentHex.slice(3, 5), 16),
            parseInt(currentHex.slice(5, 7), 16),
          ];
          return (
            <div key={ch} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 2, textAlign: 'center' }}>
                {ch}
              </div>
              <input
                type="number"
                min={0}
                max={255}
                value={vals[ci]}
                onChange={e => {
                  const nv = [...vals];
                  nv[ci] = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                  const nh = `#${nv.map(v => v.toString(16).padStart(2, '0')).join('')}`;
                  setHsv(hexToHsv(nh));
                  setHexInput(nh.replace('#', ''));
                  onChange(nh, localAlpha);
                }}
                style={{
                  width: '100%',
                  height: 26,
                  fontSize: 11,
                  border: '1px solid var(--border-primary)',
                  borderRadius: 4,
                  textAlign: 'center',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          );
        })}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: '#888', marginBottom: 2, textAlign: 'center' }}>A</div>
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(localAlpha * 100)}
            onChange={e => {
              const a = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) / 100;
              setLocalAlpha(a);
              onChange(currentHex, a);
            }}
            style={{
              width: '100%',
              height: 26,
              fontSize: 11,
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              textAlign: 'center',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          onClick={onClose}
          style={{
            padding: '4px 14px',
            fontSize: 12,
            borderRadius: 5,
            border: '1px solid var(--border-primary)',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onChange(currentHex, localAlpha);
            onClose();
          }}
          style={{
            padding: '4px 14px',
            fontSize: 12,
            borderRadius: 5,
            border: 'none',
            background: '#f0a500',
            cursor: 'pointer',
            color: '#fff',
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  color,
  onChange,
  allowNone,
  noneLabel = 'None',
  icon,
}: {
  label: string;
  color: string;
  onChange: (c: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { hex, alpha } = parseColorInput(color);
  const isNone = !color || color === 'transparent' || alpha <= 0;
  const previewBg = isNone
    ? 'repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)'
    : color;

  const Swatch = ({ c, active }: { c: string; active?: boolean }) => (
    <div
      title={c}
      onClick={() => {
        onChange(toRgbaString(c, 1));
      }}
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: c,
        cursor: 'pointer',
        flexShrink: 0,
        border: active ? '2px solid var(--accent-blue)' : '1px solid rgba(0,0,0,0.12)',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {active && (
        <div
          style={{
            position: 'absolute',
            inset: 2,
            borderRadius: '50%',
            border: '1.5px solid #fff',
          }}
        />
      )}
    </div>
  );

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        title={label}
        onClick={() => {
          setOpen(o => !o);
          setShowAdvanced(false);
        }}
        style={{
          width: 30,
          height: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          borderRadius: 5,
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          padding: 0,
          color: 'var(--text-secondary)',
        }}
      >
        {icon ?? <span style={{ fontSize: 12, lineHeight: 1, fontWeight: 700 }}>A</span>}
        <div
          style={{
            width: 18,
            height: 3,
            borderRadius: 2,
            background: previewBg,
            border: '0.5px solid rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              marginTop: 4,
              background: 'var(--bg-elevated,#fff)',
              border: '1px solid var(--border-primary)',
              borderRadius: 10,
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {showAdvanced ? (
              <AdvancedColorPicker
                hex={isNone ? '#000000' : hex}
                alpha={isNone ? 1 : alpha}
                onChange={(h, a) => onChange(toRgbaString(h, a))}
                onClose={() => setShowAdvanced(false)}
              />
            ) : (
              <div style={{ padding: 12, width: 224 }}>
                {/* Office theme */}
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#999',
                    letterSpacing: '0.6px',
                    marginBottom: 6,
                  }}
                >
                  OFFICE THEME
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {OFFICE_COLORS.map(c => (
                    <Swatch
                      key={c}
                      c={c}
                      active={!isNone && c.toLowerCase() === hex.toLowerCase()}
                    />
                  ))}
                </div>
                <div
                  style={{ height: 1, background: 'var(--border-primary)', margin: '0 0 10px' }}
                />
                {/* Standard grid */}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
                  {STD_COLORS.map((c, i) => (
                    <Swatch
                      key={i}
                      c={c}
                      active={!isNone && c.toLowerCase() === hex.toLowerCase()}
                    />
                  ))}
                </div>
                <div
                  style={{ height: 1, background: 'var(--border-primary)', margin: '0 0 8px' }}
                />
                {/* Custom / eyedropper row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <button
                    title="Custom color"
                    onClick={() => setShowAdvanced(true)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      border: '1.5px dashed #aaa',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#666',
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      fill="none"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                  <span
                    style={{ fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => setShowAdvanced(true)}
                  >
                    Custom color…
                  </span>
                </div>
                {/* Transparent */}
                {allowNone && (
                  <button
                    onClick={() => {
                      onChange('transparent');
                      setOpen(false);
                    }}
                    style={{
                      width: '100%',
                      height: 34,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRadius: 6,
                      border: '1px solid var(--border-primary)',
                      background: isNone ? '#f0f0f0' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    >
                      <line x1="2" y1="2" x2="22" y2="22" />
                      <path d="M3 3h18v18H3z" />
                    </svg>
                    {noneLabel || 'Transparent'}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shape catalogue ────────────────────────────────────────────────────────
const SHAPE_GROUPS: Array<{ group: string; shapes: Array<{ id: string; label: string }> }> = [
  {
    group: 'Basic',
    shapes: [
      { id: 'rect', label: 'Rectangle' },
      { id: 'roundRect', label: 'Rounded rect' },
      { id: 'ellipse', label: 'Ellipse' },
      { id: 'triangle', label: 'Triangle' },
      { id: 'rtTriangle', label: 'Right triangle' },
      { id: 'diamond', label: 'Diamond' },
      { id: 'parallelogram', label: 'Parallelogram' },
      { id: 'trapezoid', label: 'Trapezoid' },
    ],
  },
  {
    group: 'Polygons',
    shapes: [
      { id: 'pentagon', label: 'Pentagon' },
      { id: 'hexagon', label: 'Hexagon' },
      { id: 'plus', label: 'Plus' },
      { id: 'star4', label: '4-point star' },
      { id: 'star5', label: '5-point star' },
    ],
  },
  {
    group: 'Arrows',
    shapes: [
      { id: 'rightArrow', label: 'Right arrow' },
      { id: 'leftArrow', label: 'Left arrow' },
      { id: 'upArrow', label: 'Up arrow' },
      { id: 'downArrow', label: 'Down arrow' },
      { id: 'chevron', label: 'Chevron' },
    ],
  },
  {
    group: '3D / Special',
    shapes: [
      { id: 'can', label: 'Cylinder' },
      { id: 'cube', label: 'Cube' },
      { id: 'snip1Rect', label: 'Snipped rect' },
    ],
  },
];

function ShapeIcon({ id, size = 14 }: { id: string; size?: number }) {
  const p: React.SVGProps<SVGSVGElement> = {
    viewBox: '0 0 20 20',
    width: size,
    height: size,
    stroke: 'currentColor',
    strokeWidth: 1.5,
    fill: 'none',
    style: { flexShrink: 0 },
  };
  switch (id) {
    case 'rect':
      return (
        <svg {...p}>
          <rect x="1" y="4" width="18" height="12" />
        </svg>
      );
    case 'roundRect':
      return (
        <svg {...p}>
          <rect x="1" y="4" width="18" height="12" rx="3" />
        </svg>
      );
    case 'ellipse':
      return (
        <svg {...p}>
          <ellipse cx="10" cy="10" rx="9" ry="6" />
        </svg>
      );
    case 'triangle':
      return (
        <svg {...p}>
          <polygon points="10,2 19,18 1,18" />
        </svg>
      );
    case 'rtTriangle':
      return (
        <svg {...p}>
          <polygon points="1,18 19,18 1,2" />
        </svg>
      );
    case 'diamond':
      return (
        <svg {...p}>
          <polygon points="10,1 19,10 10,19 1,10" />
        </svg>
      );
    case 'parallelogram':
      return (
        <svg {...p}>
          <polygon points="5,16 19,16 15,4 1,4" />
        </svg>
      );
    case 'trapezoid':
      return (
        <svg {...p}>
          <polygon points="4,16 16,16 14,4 6,4" />
        </svg>
      );
    case 'pentagon':
      return (
        <svg {...p}>
          <polygon points="10,1 19,7.5 15.5,18 4.5,18 1,7.5" />
        </svg>
      );
    case 'hexagon':
      return (
        <svg {...p}>
          <polygon points="14.5,3 18.5,10 14.5,17 5.5,17 1.5,10 5.5,3" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...p}>
          <rect x="7" y="1" width="6" height="18" />
          <rect x="1" y="7" width="18" height="6" />
        </svg>
      );
    case 'star4':
      return (
        <svg {...p}>
          <polygon points="10,1 12,8 19,10 12,12 10,19 8,12 1,10 8,8" />
        </svg>
      );
    case 'star5':
      return (
        <svg {...p}>
          <polygon points="10,1 12.4,7.5 19.5,7.5 14,12 16.2,18.5 10,14.5 3.8,18.5 6,12 0.5,7.5 7.6,7.5" />
        </svg>
      );
    case 'rightArrow':
      return (
        <svg {...p}>
          <polygon points="1,7 13,7 13,4 19,10 13,16 13,13 1,13" />
        </svg>
      );
    case 'leftArrow':
      return (
        <svg {...p}>
          <polygon points="19,7 7,7 7,4 1,10 7,16 7,13 19,13" />
        </svg>
      );
    case 'upArrow':
      return (
        <svg {...p}>
          <polygon points="7,19 7,7 4,7 10,1 16,7 13,7 13,19" />
        </svg>
      );
    case 'downArrow':
      return (
        <svg {...p}>
          <polygon points="7,1 7,13 4,13 10,19 16,13 13,13 13,1" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...p}>
          <polygon points="1,4 15,4 19,10 15,16 1,16 5,10" />
        </svg>
      );
    case 'can':
      return (
        <svg {...p}>
          <ellipse cx="10" cy="5" rx="8" ry="2.5" />
          <line x1="2" y1="5" x2="2" y2="16" />
          <line x1="18" y1="5" x2="18" y2="16" />
          <ellipse cx="10" cy="16" rx="8" ry="2.5" />
        </svg>
      );
    case 'cube':
      return (
        <svg {...p}>
          <rect x="5" y="7" width="13" height="11" />
          <polygon points="5,7 2,4 15,4 18,7" />
          <line x1="15" y1="4" x2="15" y2="15" />
        </svg>
      );
    case 'snip1Rect':
      return (
        <svg {...p}>
          <polygon points="1,4 14,4 19,9 19,16 1,16" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <rect x="1" y="4" width="18" height="12" />
        </svg>
      );
  }
}

// ── main component ─────────────────────────────────────────────────────────
export function PptEditor({ filePath, style, onDirty, onClean, saveRef }: PptEditorProps) {
  const [slides, setSlides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slideIndex, setSlideIndex] = useState(0);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [slideEditState, setSlideEditState] = useState<{
    boxId: string;
    selStart: number;
    selEnd: number;
  } | null>(null);
  const [slideClipboard, setSlideClipboard] = useState<any>(null);
  const [thumbCtxMenu, setThumbCtxMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    idx: number;
  }>({ visible: false, x: 0, y: 0, idx: 0 });
  const thumbPanelRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [selectedShape, setSelectedShape] = useState<string>('ellipse');
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const shapePickerRef = useRef<HTMLDivElement>(null);

  // ── load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError('');
    fetch(`${HTTP_BASE}/api/v1/ppt/load?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) {
          setError(d.error);
          setLoading(false);
          return;
        }
        setSlides(d.slides || []);
        setSlideIndex(0);
        setLoading(false);
      })
      .catch(e => {
        setError(String(e));
        setLoading(false);
      });
  }, [filePath]);

  // ── save ──────────────────────────────────────────────────────────────────
  const doSave = useCallback(
    (slidesToSave: any[]) => {
      // Strip canvasImage (not JSON-serializable)
      const clean = slidesToSave.map(s => ({
        ...s,
        boxes:
          s.boxes?.map((b: any) => {
            const { canvasImage, ...rest } = b;
            return rest;
          }) || [],
      }));
      fetch(`${HTTP_BASE}/api/v1/ppt/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, slides: clean }),
      })
        .then(() => {
          setSaveMsg('Saved');
          setTimeout(() => setSaveMsg(''), 1500);
          onClean?.();
        })
        .catch(() => {
          setSaveMsg('Save failed');
          setTimeout(() => setSaveMsg(''), 2000);
        });
    },
    [filePath, onClean],
  );

  // Keep saveRef current — only when slides are loaded (never capture empty initial state)
  useEffect(() => {
    if (saveRef) saveRef.current = slides.length > 0 ? () => doSave(slides) : null;
    return () => {
      if (saveRef) saveRef.current = null;
    }; // clear on unmount
  }, [slides, doSave, saveRef]);

  // ── fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── close shape picker on outside click ───────────────────────────────────
  useEffect(() => {
    if (!showShapePicker) return;
    const handle = (e: MouseEvent) => {
      if (shapePickerRef.current && !shapePickerRef.current.contains(e.target as Node)) {
        setShowShapePicker(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showShapePicker]);

  const enterPresent = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvasWrapRef.current?.requestFullscreen();
  };

  // ── keyboard nav ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      const last = slides.length - 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSlideIndex(i => clamp(i - 1, 0, last));
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setSlideIndex(i => clamp(i + 1, 0, last));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen, slides.length]);

  // ── slide mutation ─────────────────────────────────────────────────────────
  const setCurrentSlide = useCallback(
    (newSlide: any) => {
      setSlides(prev => prev.map((s, i) => (i === slideIndex ? newSlide : s)));
      onDirty?.();
    },
    [slideIndex, onDirty],
  );

  const saveCurrentSlide = useCallback(
    (newSlide: any) => {
      const updated = slides.map((s, i) => (i === slideIndex ? newSlide : s));
      setSlides(updated);
      doSave(updated);
    },
    [slides, slideIndex, doSave],
  );

  const addSlide = () => {
    const s = [...slides, { bgColor: '#ffffff', boxes: [] }];
    setSlides(s);
    setSlideIndex(s.length - 1);
    onDirty?.();
  };

  // ── slide panel operations ────────────────────────────────────────────────
  const closeThumbCtx = () => setThumbCtxMenu(m => ({ ...m, visible: false }));

  const duplicateSlide = (idx: number) => {
    const ns = cloneDeep(slides);
    const copy = { ...cloneDeep(ns[idx]), id: uuidv4() };
    ns.splice(idx + 1, 0, copy);
    setSlides(ns);
    setSlideIndex(idx + 1);
    onDirty?.();
  };

  const deleteSlide = (idx: number) => {
    if (slides.length <= 1) return;
    const ns = cloneDeep(slides);
    ns.splice(idx, 1);
    setSlides(ns);
    setSlideIndex(Math.min(idx, ns.length - 1));
    onDirty?.();
  };

  const cutSlide = (idx: number) => {
    setSlideClipboard(cloneDeep(slides[idx]));
    deleteSlide(idx);
  };

  const copySlide = (idx: number) => setSlideClipboard(cloneDeep(slides[idx]));

  const pasteSlide = (idx: number) => {
    if (!slideClipboard) return;
    const ns = cloneDeep(slides);
    ns.splice(idx + 1, 0, { ...cloneDeep(slideClipboard), id: uuidv4() });
    setSlides(ns);
    setSlideIndex(idx + 1);
    onDirty?.();
  };

  const insertSlideAfter = (idx: number) => {
    const ns = cloneDeep(slides);
    ns.splice(idx + 1, 0, { bgColor: '#ffffff', boxes: [] });
    setSlides(ns);
    setSlideIndex(idx + 1);
    onDirty?.();
  };

  const moveSlide = (from: number, to: number) => {
    const ns = cloneDeep(slides);
    const [s] = ns.splice(from, 1);
    ns.splice(to, 0, s);
    setSlides(ns);
    setSlideIndex(to);
    onDirty?.();
  };

  // ── toolbar helpers ───────────────────────────────────────────────────────
  const addStyleAtSelection = (styleFields: any) => {
    if (!slideEditState || slideEditState.selStart === slideEditState.selEnd) return;
    const slide = slides[slideIndex];
    const nc = cloneDeep(slide);
    const box = nc.boxes?.find((b: any) => b.id === slideEditState.boxId);
    if (!box) return;
    if (!box.styles) box.styles = [];
    box.styles.push({ start: slideEditState.selStart, end: slideEditState.selEnd, ...styleFields });
    setCurrentSlide(nc);
  };

  const updateBoxStyle = (fields: any) => {
    const slide = slides[slideIndex];
    const nc = cloneDeep(slide);
    const box = nc.boxes?.find((b: any) => b.isSelected);
    if (!box) return;
    box.boxStyle = { ...(box.boxStyle || {}), ...fields };
    setCurrentSlide(nc);
  };

  const updateFill = (color: string) => {
    const slide = slides[slideIndex];
    const nc = cloneDeep(slide);
    const box = nc.boxes?.find((b: any) => b.isSelected);
    if (!box) return;
    if (!color || color === 'transparent') {
      box.fill = { type: 'none' };
      box.boxStyle = { ...(box.boxStyle || {}), bgColor: 'transparent' };
    } else {
      const { hex, alpha } = parseColorInput(color);
      box.fill = { type: 'solid', color: hex, ...(alpha < 0.999 ? { opacity: alpha } : {}) };
      box.boxStyle = { ...(box.boxStyle || {}), bgColor: hex };
    }
    setCurrentSlide(nc);
  };

  const updateTextColor = (color: string) => {
    if (slideEditState && slideEditState.selStart !== slideEditState.selEnd) {
      addStyleAtSelection({ color: color || '#000000' });
    } else {
      updateBoxStyle({ color: color || '#000000' });
    }
  };

  const updateBorderColor = (color: string) => {
    const slide = slides[slideIndex];
    const nc = cloneDeep(slide);
    const box = nc.boxes?.find((b: any) => b.isSelected);
    if (!box) return;
    const bs = { ...(box.boxStyle || {}) };
    bs.borderColor = color;
    if (!color || color === 'transparent') {
      bs.borderWidth = 0;
    } else if (!bs.borderWidth || bs.borderWidth === 0) {
      bs.borderWidth = 1;
    }
    box.boxStyle = bs;
    setCurrentSlide(nc);
  };

  const currentSlide = slides[slideIndex];
  const selectedBox = currentSlide?.boxes?.find((b: any) => b.isSelected);
  // Derive topStyle from the live selection state exposed by Slide
  const stylesInSel =
    slideEditState && selectedBox?.id === slideEditState.boxId
      ? (selectedBox?.styles || []).filter(
          (s: any) =>
            !s.isSelection && s.start < slideEditState.selEnd && s.end > slideEditState.selStart,
        )
      : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topStyle: any = stylesInSel.length ? Object.assign({}, ...cloneDeep(stylesInSel)) : {};

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
        Loading presentation…
      </div>
    );
  if (error)
    return <div style={{ padding: 16, color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>;

  const Sep = () => (
    <div
      style={{
        width: 1,
        height: 20,
        background: 'var(--border-primary)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-primary)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        ...style,
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '5px 12px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-primary)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
        onMouseDown={e => e.nativeEvent.stopPropagation()}
      >
        {/* New slide */}
        <Btn title="New slide" onClick={addSlide}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="12" y1="7" x2="12" y2="13" />
            <line x1="9" y1="10" x2="15" y2="10" />
          </svg>
        </Btn>
        <Sep />
        {/* Tool buttons */}
        {(
          [
            {
              id: 'select',
              title: 'Select',
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                >
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
              ),
            },
            {
              id: 'text',
              title: 'Text box',
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                >
                  <polyline points="4 7 4 4 20 4 20 7" />
                  <line x1="9" y1="20" x2="15" y2="20" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              ),
            },
            {
              id: 'line',
              title: 'Line',
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                >
                  <line x1="5" y1="19" x2="19" y2="5" />
                </svg>
              ),
            },
          ] as { id: string; title: string; icon: React.ReactNode }[]
        ).map(t => (
          <Btn
            key={t.id}
            title={t.title}
            active={activeTool === t.id}
            onClick={() => setActiveTool(t.id)}
          >
            {t.icon}
          </Btn>
        ))}
        {/* Shape tool — split button with shape picker */}
        <div ref={shapePickerRef} style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
          <Btn
            title={
              SHAPE_GROUPS.flatMap(g => g.shapes).find(s => s.id === selectedShape)?.label ??
              'Shape'
            }
            active={activeTool === 'shape'}
            onClick={() => setActiveTool('shape')}
            style={{ borderRadius: '5px 0 0 5px', paddingRight: 1 }}
          >
            <ShapeIcon id={selectedShape} size={14} />
          </Btn>
          <Btn
            title="Choose shape"
            onClick={() => setShowShapePicker(p => !p)}
            style={{ width: 14, borderRadius: '0 5px 5px 0', paddingLeft: 0 }}
          >
            <svg
              viewBox="0 0 10 6"
              width="8"
              height="5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            >
              <polyline points="1,1 5,5 9,1" />
            </svg>
          </Btn>
          {showShapePicker && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 9999,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 8,
                padding: '6px 8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                minWidth: 210,
              }}
            >
              {SHAPE_GROUPS.map(g => (
                <div key={g.group} style={{ marginBottom: 4 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '3px 2px 2px',
                    }}
                  >
                    {g.group}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {g.shapes.map(s => {
                      const isActive = selectedShape === s.id;
                      return (
                        <button
                          key={s.id}
                          title={s.label}
                          onClick={() => {
                            setSelectedShape(s.id);
                            setActiveTool('shape');
                            setShowShapePicker(false);
                          }}
                          style={{
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            border: 'none',
                            cursor: 'pointer',
                            background: isActive ? 'var(--accent-blue-light)' : 'transparent',
                            color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                          }}
                          onMouseEnter={e => {
                            if (!isActive)
                              (e.currentTarget as HTMLButtonElement).style.background =
                                'var(--bg-hover)';
                          }}
                          onMouseLeave={e => {
                            if (!isActive)
                              (e.currentTarget as HTMLButtonElement).style.background =
                                'transparent';
                          }}
                        >
                          <ShapeIcon id={s.id} size={16} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Image upload */}
        <Btn title="Insert image" style={{ position: 'relative', overflow: 'hidden' }}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <input
            type="file"
            accept="image/*"
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const b64: string = await new Promise(res => {
                const r = new FileReader();
                r.onloadend = () => res(r.result as string);
                r.readAsDataURL(file);
              });
              const img = new Image();
              img.src = b64;
              img.onload = () => {
                const nc = cloneDeep(currentSlide);
                nc.boxes?.forEach((b: any) => {
                  b.isSelected = false;
                });
                nc.boxes = nc.boxes || [];
                const h = Math.min(300, img.height),
                  w = img.width * (h / img.height);
                nc.boxes.unshift({
                  id: uuidv4(),
                  x: 100,
                  y: 70,
                  w,
                  h,
                  styles: [],
                  boxStyle: { bgColor: 'transparent' },
                  isSelected: true,
                  text: b64,
                  canvasImage: img,
                });
                saveCurrentSlide(nc);
              };
              e.target.value = '';
            }}
          />
        </Btn>
        <Sep />

        {/* Text formatting — only when a box is selected */}
        {selectedBox && (
          <>
            <Btn
              title="Bold"
              active={topStyle.fontWeight === 'bold'}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() =>
                addStyleAtSelection({
                  fontWeight: topStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                })
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
              </svg>
            </Btn>
            <Btn
              title="Italic"
              active={topStyle.fontStyle === 'italic'}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() =>
                addStyleAtSelection({
                  fontStyle: topStyle.fontStyle === 'italic' ? 'normal' : 'italic',
                })
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <line x1="19" y1="4" x2="10" y2="4" />
                <line x1="14" y1="20" x2="5" y2="20" />
                <line x1="15" y1="4" x2="9" y2="20" />
              </svg>
            </Btn>
            <Btn
              title="Underline"
              active={topStyle.textDecoration === 'underline'}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() =>
                addStyleAtSelection({
                  textDecoration: topStyle.textDecoration === 'underline' ? 'none' : 'underline',
                })
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <path d="M6 3v7a6 6 0 0 0 12 0V3" />
                <line x1="4" y1="21" x2="20" y2="21" />
              </svg>
            </Btn>
            <Sep />
            {/* Text alignment */}
            {(['left', 'center', 'right'] as const).map(al => (
              <Btn
                key={al}
                title={`Align ${al}`}
                active={(selectedBox.boxStyle?.textAlign || 'left') === al}
                onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                onClick={() => updateBoxStyle({ textAlign: al })}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                >
                  {al === 'left' && (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="15" y2="12" />
                      <line x1="3" y1="18" x2="18" y2="18" />
                    </>
                  )}
                  {al === 'center' && (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="6" y1="12" x2="18" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                    </>
                  )}
                  {al === 'right' && (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="9" y1="12" x2="21" y2="12" />
                      <line x1="6" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </Btn>
            ))}
            <Sep />
            {/* Font size */}
            <input
              type="number"
              min="6"
              max="200"
              step="1"
              value={selectedBox.boxStyle?.fontSize ?? 16}
              onChange={e =>
                updateBoxStyle({ fontSize: Math.max(6, parseInt(e.target.value, 10) || 16) })
              }
              onMouseDown={e => e.stopPropagation()}
              title="Font size"
              style={{
                width: 42,
                height: 24,
                fontSize: 11,
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                textAlign: 'center',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                paddingLeft: 4,
              }}
            />
            {/* Font family picker */}
            <FontFamilyPicker
              value={selectedBox.boxStyle?.fontFamily || 'Montserrat'}
              onChange={f => updateBoxStyle({ fontFamily: f })}
              fonts={[
                'Montserrat',
                'Martian Mono',
                'Arial',
                'Georgia',
                'Times New Roman',
                'Courier New',
              ]}
            />
            <Sep />
            {/* Font color */}
            <ColorPicker
              label="Font color"
              color={topStyle.color || selectedBox.boxStyle?.color || '#000000'}
              onChange={updateTextColor}
              icon={
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none">
                  <text x="3" y="17" fontSize="16" fontWeight="bold" fontFamily="sans-serif">
                    A
                  </text>
                </svg>
              }
            />
            {/* Fill color */}
            <ColorPicker
              label="Fill color"
              color={
                selectedBox.fill?.type === 'solid' && selectedBox.fill?.color
                  ? toRgbaString(selectedBox.fill.color, selectedBox.fill.opacity ?? 1)
                  : selectedBox.boxStyle?.bgColor || 'transparent'
              }
              onChange={updateFill}
              allowNone
              noneLabel="No fill"
              icon={
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none">
                  <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 0 0 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" />
                  <path d="M0 20h24v4H0z" fill="currentColor" opacity="0.3" />
                </svg>
              }
            />
            {/* Border color */}
            <ColorPicker
              label="Border color"
              color={selectedBox.boxStyle?.borderColor || 'transparent'}
              onChange={updateBorderColor}
              allowNone
              noneLabel="No border"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  fill="none"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
              }
            />
            {/* Border width — only shown when border is active */}
            {selectedBox.boxStyle?.borderColor &&
              selectedBox.boxStyle.borderColor !== 'transparent' && (
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={selectedBox.boxStyle?.borderWidth ?? 1}
                  onChange={e =>
                    updateBoxStyle({ borderWidth: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  title="Border width (px)"
                  style={{
                    width: 38,
                    height: 24,
                    fontSize: 11,
                    border: '1px solid var(--border-primary)',
                    borderRadius: 4,
                    textAlign: 'center',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    paddingLeft: 4,
                  }}
                />
              )}
          </>
        )}

        {saveMsg && (
          <span
            style={{
              fontSize: 11,
              color: saveMsg.includes('fail') ? 'var(--accent-red)' : 'var(--accent-green)',
              marginLeft: 8,
            }}
          >
            {saveMsg}
          </span>
        )}
      </div>

      {/* ── Workspace ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Thumbnail panel */}
        {!panelCollapsed && (
          <div
            ref={thumbPanelRef}
            style={{
              width: 180,
              background: 'var(--bg-secondary)',
              borderRight: '1px solid var(--border-primary)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              position: 'relative',
            }}
            onClick={closeThumbCtx}
          >
            <div
              style={{
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 10px',
                borderBottom: '1px solid var(--border-primary)',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Slides
              </span>
              <button
                onClick={() => setPanelCollapsed(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {slides.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setSlideIndex(i)}
                  onContextMenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSlideIndex(i);
                    setThumbCtxMenu({ visible: true, x: e.clientX, y: e.clientY, idx: i });
                  }}
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    borderRadius: 5,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    background: (() => {
                      const g = s.bgGradient;
                      if (g?.stops && g.stops.length >= 2) {
                        const st = g.stops
                          .map((p: any) => `${p.color} ${Math.round(p.pos * 100)}%`)
                          .join(', ');
                        return `linear-gradient(${g.angle + 90}deg, ${st})`;
                      }
                      return s.bgColor || '#ffffff';
                    })(),
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: 3,
                      width: 16,
                      height: 16,
                      background: 'rgba(0,0,0,0.5)',
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'white',
                      zIndex: 2,
                    }}
                  >
                    {i + 1}
                  </span>
                  <ThumbnailCanvas slide={s} priority={i === slideIndex} />
                  {slideIndex === i && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 5,
                        border: '2px solid var(--accent-blue)',
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    />
                  )}
                </div>
              ))}
              <button
                onClick={addSlide}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: 6,
                  borderRadius: 5,
                  border: '2px dashed var(--border-primary)',
                  background: 'transparent',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)';
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add slide
              </button>
            </div>

            {/* Thumbnail right-click context menu — rendered inside panel for stacking, positioned fixed to avoid scroll drift */}
            {thumbCtxMenu.visible &&
              (() => {
                const idx = thumbCtxMenu.idx;
                const MENU_H = 310; // approximate menu height
                const MENU_W = 220;
                const top = Math.min(thumbCtxMenu.y, window.innerHeight - MENU_H - 8);
                const left = Math.min(thumbCtxMenu.x, window.innerWidth - MENU_W - 8);
                const menuStyle: React.CSSProperties = {
                  position: 'fixed',
                  top,
                  left,
                  zIndex: 9999,
                  background: 'var(--bg-elevated, #fff)',
                  border: '1px solid var(--border-default, #ddd)',
                  borderRadius: 8,
                  padding: '4px 0',
                  minWidth: MENU_W,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  fontSize: 13,
                  fontFamily: 'var(--font-body)',
                  color: 'var(--text-primary)',
                };
                const item = (
                  label: string,
                  shortcut: string,
                  onClick: () => void,
                  disabled = false,
                ): React.ReactNode => (
                  <div
                    key={label}
                    onClick={e => {
                      e.stopPropagation();
                      if (!disabled) {
                        onClick();
                        closeThumbCtx();
                      }
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '5px 14px',
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                      gap: 24,
                      color: 'var(--text-primary)',
                    }}
                    onMouseEnter={e => {
                      if (!disabled)
                        (e.currentTarget as HTMLElement).style.background =
                          'var(--bg-hover, #f0f0f0)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <span>{label}</span>
                    {shortcut && (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                        {shortcut}
                      </span>
                    )}
                  </div>
                );
                const sep = (k: string) => (
                  <div
                    key={k}
                    style={{
                      height: 1,
                      background: 'var(--border-primary, #eee)',
                      margin: '4px 0',
                    }}
                  />
                );
                return (
                  <div style={menuStyle} onClick={e => e.stopPropagation()}>
                    {item('Cut', '⌘X', () => cutSlide(idx))}
                    {item('Copy', '⌘C', () => copySlide(idx))}
                    {item('Paste', '⌘V', () => pasteSlide(idx), !slideClipboard)}
                    {sep('s1')}
                    {item('Delete slide', '⌫', () => deleteSlide(idx), slides.length <= 1)}
                    {sep('s2')}
                    {item('New slide', '⌘M', () => insertSlideAfter(idx))}
                    {item('Duplicate slide', '', () => duplicateSlide(idx))}
                    {sep('s3')}
                    {item('Move to beginning', '⌘⇧↑', () => moveSlide(idx, 0), idx === 0)}
                    {item(
                      'Move to end',
                      '⌘⇧↓',
                      () => moveSlide(idx, slides.length - 1),
                      idx === slides.length - 1,
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {/* Canvas area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--bg-tertiary)',
            position: 'relative',
          }}
        >
          {panelCollapsed && (
            <button
              onClick={() => setPanelCollapsed(false)}
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                zIndex: 10,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 4,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
          )}

          <div
            ref={canvasWrapRef}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              overflow: 'auto',
              overscrollBehavior: 'none',
              ...(isFullscreen
                ? { padding: 0, background: '#000', width: '100vw', height: '100vh' }
                : {}),
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 896,
                aspectRatio: '16/9',
                background: currentSlide?.bgColor || '#ffffff',
                borderRadius: isFullscreen ? 0 : 8,
                boxShadow: isFullscreen ? 'none' : '0 8px 40px rgba(0,0,0,0.3)',
                position: 'relative',
                overflow: 'hidden',
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
                ...(isFullscreen
                  ? {
                      width: 'min(100vw, calc(100vh * 16 / 9))',
                      height: 'min(100vh, calc(100vw * 9 / 16))',
                      maxWidth: '100vw',
                      maxHeight: '100vh',
                      borderRadius: 0,
                      boxShadow: 'none',
                      transform: 'none',
                      aspectRatio: 'auto',
                    }
                  : {}),
              }}
            >
              <React.Suspense fallback={null}>
                {currentSlide && (
                  <SlideCanvas
                    config={currentSlide}
                    isPresentationMode={isFullscreen}
                    activeTool={activeTool}
                    activeShape={selectedShape}
                    setConfig={setCurrentSlide}
                    onSave={saveCurrentSlide}
                    onEditStateChange={setSlideEditState}
                    defaultCursor="default"
                  />
                )}
              </React.Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div
        style={{
          height: 28,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-primary)',
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
      >
        <span>
          Slide {slideIndex + 1} of {slides.length}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setZoomLevel(z => Math.max(z - 10, 50))}
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                border: 'none',
                background: 'transparent',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <span style={{ minWidth: 36, textAlign: 'center' }}>{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(z + 10, 200))}
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                border: 'none',
                background: 'transparent',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
          </div>
          {/* Present */}
          <button
            onClick={enterPresent}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              background: 'var(--accent-blue)',
              border: 'none',
              borderRadius: 4,
              color: 'white',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Present
          </button>
        </div>
      </div>
    </div>
  );
}
