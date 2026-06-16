/* eslint-disable no-unused-vars */
import { clamp, cloneDeep, inRange, isNil, last, merge } from 'lodash';
import { useState, useRef, useEffect } from 'react';

// ── inline uuidv4 ──────────────────────────────────────────────────────────
const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ── inline useClickOutside ─────────────────────────────────────────────────
const useClickOutside = (ref, cb) => {
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) cb();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, cb]);
};

// ── constants ──────────────────────────────────────────────────────────────
export const SF = 4;
const FONT_SIZE = 16;
const LINE_HEIGHT = 16 * 1.2;
export const CANVAS_WIDTH = 896;
export const CANVAS_HEIGHT = 504;
const GRAB_DISTANCE = 10;

// ── helpers ────────────────────────────────────────────────────────────────
const isBase64Image = text => typeof text === 'string' && text.startsWith('data:image');

const isShapeConfig = text => typeof text === 'string' && text.startsWith('shape:');

const parseShapeConfig = text => {
  if (!isShapeConfig(text)) return null;
  try { return JSON.parse(text.slice(6)); } catch { return null; }
};

// ── config mutation helpers (pure functions) ───────────────────────────────
const onSetSelectedBox = (boxId, config, setConfig) => {
  const newConfig = cloneDeep(config);
  newConfig.boxes = newConfig.boxes.map(box => ({
    ...box,
    styles: (box.styles || []).filter(s => !s.isSelection),
    isSelected: box.id === boxId,
  }));
  setConfig(newConfig);
};

const onMoveSelectedBox = (dx, dy, config, setConfig) => {
  if (!config.boxes?.find(b => b.isSelected)) return;
  setConfig({
    ...config,
    boxes: config.boxes.map(b =>
      b.isSelected ? { ...b, x: b.x + dx / SF, y: b.y + dy / SF } : b
    ),
  });
};

const onResizeSelectedBox = (offsetX, offsetY, handleType, config, setConfig) => {
  const sel = config.boxes?.find(b => b.isSelected);
  if (!sel) return;
  const mouseX = offsetX / SF, mouseY = offsetY / SF;
  const { x: ox, y: oy, w: ow, h: oh } = sel;
  const ar = ow / oh;
  const isImg = !!sel.canvasImage || isBase64Image(sel.text);
  let [nx, ny, nw, nh] = [ox, oy, ow, oh];
  switch (handleType) {
    case 'bottomRightCorner': nw = mouseX - ox; nh = isImg ? nw / ar : mouseY - oy; break;
    case 'bottomLeftCorner':  nw = ox + ow - mouseX; nx = mouseX; nh = isImg ? nw / ar : mouseY - oy; break;
    case 'topRightCorner':    nw = mouseX - ox; if (isImg) { const h = nw / ar; ny = oy + oh - h; nh = h; } else { nh = oy + oh - mouseY; ny = mouseY; } break;
    case 'topLeftCorner':     nw = ox + ow - mouseX; nx = mouseX; if (isImg) { const h = nw / ar; ny = oy + oh - h; nh = h; } else { nh = oy + oh - mouseY; ny = mouseY; } break;
    case 'rightEdge':  nw = mouseX - ox; if (isImg) nh = nw / ar; break;
    case 'leftEdge':   nw = ox + ow - mouseX; nx = mouseX; if (isImg) nh = nw / ar; break;
    case 'bottomEdge': nh = mouseY - oy; if (isImg) nw = nh * ar; break;
    case 'topEdge':    nh = oy + oh - mouseY; ny = mouseY; if (isImg) nw = nh * ar; break;
  }
  if (nw < 20) nw = 20;
  if (nh < 20) nh = 20;
  setConfig({ ...config, boxes: config.boxes.map(b => b.isSelected ? { ...b, x: nx, y: ny, w: nw, h: nh } : b) });
};

const onDeleteSelectedBox = (config, setConfig) => {
  const nc = cloneDeep(config);
  const sel = nc.boxes.find(b => b.isSelected);
  if (!sel) return;
  nc.boxes = nc.boxes.filter(b => b.id !== sel.id);
  setConfig(nc);
};

const onAddNewBox = (x, y, text, config, setConfig) => {
  const nc = cloneDeep(config);
  const id = uuidv4();
  nc.boxes.forEach(b => { b.isSelected = false; });
  nc.boxes.push({
    id, x, y, w: 300, h: 200, text,
    styles: [],
    boxStyle: { bgColor: 'transparent', fontSize: 16, fontWeight: 400, color: '#000000', lineWidth: 0, type: 'text', lineStart: '', lineEnd: '' },
    isSelected: true,
  });
  setConfig(nc);
};

const updateCursor = (dCursor = {}, config, setConfig) => {
  const nc = cloneDeep(config);
  const sel = nc.boxes.find(b => b.isSelected);
  const ss = sel?.styles?.find(s => s.isSelection);
  let newStart = (dCursor.start ?? ss?.start ?? 0) + (dCursor.dStart ?? 0);
  let newEnd   = (dCursor.end   ?? ss?.end   ?? 0) + (dCursor.dEnd   ?? 0);
  newStart = clamp(newStart, 0, sel?.text?.length ?? 0);
  newEnd   = clamp(newEnd,   0, sel?.text?.length ?? 0);
  sel.styles = sel.styles.filter(s => !s.isSelection);
  sel.styles.push({ isSelection: true, start: newStart, end: newEnd });
  setConfig(nc);
};

const clearSelection = (config, setConfig) => {
  const nc = cloneDeep(config);
  nc.boxes.forEach(b => { b.isSelected = false; b.styles = (b.styles || []).filter(s => !s.isSelection); });
  setConfig(nc);
};

const updateCursorSelectWord = (charIndex, config, setConfig) => {
  const nc = cloneDeep(config);
  const sel = nc.boxes.find(b => b.isSelected);
  let s = charIndex; while (s >= 0 && sel.text[s] !== ' ') s--;
  let e = charIndex; while (e < sel.text?.length && sel.text[e] !== ' ') e++;
  sel.styles = sel.styles.filter(st => !st.isSelection);
  sel.styles.push({ isSelection: true, start: s + 1, end: e - 1 });
  setConfig(nc);
};

const updateCursorSelectAll = (config, setConfig) => {
  const nc = cloneDeep(config);
  const sel = nc.boxes.find(b => b.isSelected);
  if (!sel?.text) return;
  sel.styles = sel.styles.filter(st => !st.isSelection);
  sel.styles.push({ isSelection: true, start: 0, end: sel.text.length - 1 });
  setConfig(nc);
};

const insertTextAtSelection = (text, config, setConfig) => {
  const nc = cloneDeep(config);
  const sel = nc.boxes?.find(b => b.isSelected);
  const ss = sel?.styles?.find(s => s.isSelection)?.start;
  if (isNil(ss)) return;
  sel.text = (sel.text?.slice(0, ss) ?? '') + text + (sel.text?.slice(ss) ?? '');
  sel.styles = sel.styles.map(s => ({
    ...s,
    start: ss <= s.start ? s.start + text.length : s.start,
    end:   ss <= s.end   ? s.end   + text.length : s.end,
  }));
  setConfig(nc);
};

const deleteTextSelection = (config, setConfig) => {
  const nc = cloneDeep(config);
  const sel = nc.boxes.find(b => b.isSelected);
  const ss = sel.styles.find(s => s.isSelection)?.start;
  const se = sel.styles.find(s => s.isSelection)?.end;
  if (isNil(ss)) return;
  const span = ss === se ? -1 : se - ss + 1;
  const before = sel.text?.slice(0, ss + (span < 0 ? span : 0)) ?? '';
  const after  = sel.text?.slice(ss + (span < 0 ? 0 : span))   ?? '';
  sel.text = before + after;
  sel.styles = sel.styles.map(s => ({
    ...s,
    start: ss <= s.start ? s.start - Math.abs(span) : s.start,
    end:   ss <= s.end   ? s.end   - Math.abs(span) : s.end,
  }));
  setConfig(nc);
};

const toDataURL = url =>
  fetch(url).then(r => r.blob()).then(blob => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  }));

const insertBoxesFromHtml = async (htmlStr, config, setConfig) => {
  const src = htmlStr?.match(/src="([^"]*)"/)?.[1];
  const b64 = await toDataURL(src);
  const img = new Image();
  img.src = b64;
  img.onload = () => {
    const nc = cloneDeep(config);
    const id = uuidv4();
    nc.boxes.forEach(b => { b.isSelected = false; });
    nc.boxes.unshift({ id, x: 100, y: 100, w: img.width * (400 / img.height), h: 400, styles: [], boxStyle: { bgColor: 'transparent' }, isSelected: true, text: b64, canvasImage: img });
    setConfig(nc);
  };
};

// ── drawing helpers ────────────────────────────────────────────────────────
const drawResizeHandles = (ctx, config) => {
  if (!config.isSelected) return;
  const hs = 8 * SF;
  const isImg = !!config.canvasImage || isBase64Image(config.text);
  const corners = [
    { x: config.x, y: config.y }, { x: config.x + config.w, y: config.y },
    { x: config.x, y: config.y + config.h }, { x: config.x + config.w, y: config.y + config.h },
  ];
  const edges = [
    { x: config.x + config.w / 2, y: config.y }, { x: config.x + config.w / 2, y: config.y + config.h },
    { x: config.x, y: config.y + config.h / 2 }, { x: config.x + config.w, y: config.y + config.h / 2 },
  ];
  const handles = isImg ? corners : [...corners, ...edges];
  handles.forEach(h => {
    ctx.beginPath(); ctx.rect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    ctx.fillStyle = '#a0a0a0'; ctx.fill();
    ctx.lineWidth = 1 * SF; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  });
  const rhy = config.y - 30 * SF, rhx = config.x + config.w / 2;
  ctx.beginPath(); ctx.moveTo(rhx, config.y); ctx.lineTo(rhx, rhy + hs / 2);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 * SF; ctx.stroke();
  ctx.beginPath(); ctx.rect(rhx - hs / 2, rhy - hs / 2, hs, hs);
  ctx.fillStyle = '#a0a0a0'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 * SF; ctx.stroke();
};

const drawTextBox = (ctx, config, isHovered = false) => {
  ctx.beginPath();
  const { fontSize, fontWeight, color, lineWidth, type, lineEnd } = config.boxStyle || {};
  ctx.strokeStyle = 'transparent';
  if (lineWidth) { ctx.lineWidth = lineWidth; ctx.strokeStyle = color || '#000000'; }
  else ctx.lineWidth = 2;
  if (config.isSelected) ctx.strokeStyle = 'rgba(160,160,160,0.7)';

  if (type === 'line') {
    ctx.moveTo(config.x, config.y); ctx.lineTo(config.x + config.w, config.y + config.h); ctx.stroke();
    if (lineEnd === 'arrow') {
      const angle = Math.atan2(config.h, config.w);
      const len = Math.sqrt(config.w ** 2 + config.h ** 2) * 0.9;
      [angle + 0.05, angle - 0.05].forEach(a => {
        ctx.beginPath(); ctx.moveTo(config.x + Math.cos(a) * len, config.y + Math.sin(a) * len);
        ctx.lineTo(config.x + config.w, config.y + config.h); ctx.stroke();
      });
    }
    return;
  }

  const hasImage = config.canvasImage || isBase64Image(config.text);
  if (hasImage) {
    let img = config.canvasImage;
    if (!img && isBase64Image(config.text)) { img = new Image(); img.src = config.text; }
    if (img) { try { ctx.drawImage(img, config.x, config.y, config.w, config.h); } catch {} }
    if (isHovered && !config.isSelected) { ctx.beginPath(); ctx.rect(config.x, config.y, config.w, config.h); ctx.strokeStyle = 'rgba(160,160,160,0.4)'; ctx.lineWidth = 1 * SF; ctx.stroke(); }
    if (config.isSelected) { ctx.beginPath(); ctx.rect(config.x, config.y, config.w, config.h); ctx.strokeStyle = 'rgba(160,160,160,0.7)'; ctx.lineWidth = 1 * SF; ctx.stroke(); }
    drawResizeHandles(ctx, config);
    return;
  }

  const sc = parseShapeConfig(config.text);
  if (sc) {
    ctx.fillStyle = sc.bgColor || '#1473df'; ctx.strokeStyle = sc.borderColor || '#0d5bb5';
    ctx.lineWidth = (sc.borderWidth || 2) * SF;
    if (sc.type === 'circle') {
      ctx.beginPath(); ctx.ellipse(config.x + config.w / 2, config.y + config.h / 2, config.w / 2, config.h / 2, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else { ctx.fillRect(config.x, config.y, config.w, config.h); ctx.strokeRect(config.x, config.y, config.w, config.h); }
    if (isHovered && !config.isSelected) { ctx.strokeStyle = 'rgba(160,160,160,0.4)'; ctx.lineWidth = 1 * SF; ctx.strokeRect(config.x, config.y, config.w, config.h); }
    if (config.isSelected) { ctx.strokeStyle = 'rgba(160,160,160,0.7)'; ctx.lineWidth = 1 * SF; ctx.strokeRect(config.x, config.y, config.w, config.h); }
    drawResizeHandles(ctx, config);
    return;
  }

  const bgColor = config.boxStyle?.bgColor || 'transparent';
  const borderColor = config.boxStyle?.borderColor || 'transparent';
  const borderWidth = (config.boxStyle?.borderWidth || 0) * SF;
  ctx.fillStyle = bgColor; ctx.fillRect(config.x, config.y, config.w, config.h);
  if (borderColor !== 'transparent' && borderWidth > 0) { ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.strokeRect(config.x, config.y, config.w, config.h); }
  if (isHovered && !config.isSelected) { ctx.strokeStyle = 'rgba(160,160,160,0.4)'; ctx.lineWidth = 1 * SF; ctx.strokeRect(config.x, config.y, config.w, config.h); }
  if (config.isSelected) { ctx.strokeStyle = 'rgba(160,160,160,0.7)'; ctx.lineWidth = 1 * SF; ctx.strokeRect(config.x, config.y, config.w, config.h); }
  drawResizeHandles(ctx, config);

  const lineHeight = fontSize * 1.2 || LINE_HEIGHT;
  ctx.fillStyle = color || '#000000';
  const fontStr = `${fontWeight || 400} ${fontSize * SF || FONT_SIZE * SF}px Montserrat, sans-serif`;
  ctx.font = fontStr; ctx.textBaseline = 'top';
  const pad = 10 * SF;
  let ci = 0, cx = config.x + pad, cy = config.y + pad;
  const sStart = config.styles?.find(s => s.isSelection)?.start;

  while (ci < config.text?.length) {
    if (ci === sStart) {
      const lw = ctx.lineWidth, ss = ctx.strokeStyle;
      ctx.lineWidth = 3; ctx.strokeStyle = 'black';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + lineHeight * SF); ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = ss;
    }
    if (cx > config.x + config.w - pad - FONT_SIZE * SF || config.text[ci] === '\n') {
      cy += lineHeight * SF; cx = config.x + pad;
    }
    const charStyles = (config.styles || []).filter(s => s.start <= ci && s.end >= ci);
    const charStyle = merge({}, ...cloneDeep(charStyles));
    ctx.font = fontStr;
    if (charStyle.fontWeight) ctx.font = `${charStyle.fontWeight} ${fontSize * SF}px Montserrat, sans-serif`;
    const prevFill = ctx.fillStyle;
    if (charStyle.color) ctx.fillStyle = charStyle.color;
    let ch = config.text[ci];
    if (ch === '\n') ch = '';
    if (charStyle.isSelection && charStyle.start !== charStyle.end) {
      ctx.fillStyle = '#0000ff22';
      ctx.fillRect(cx, cy, ctx.measureText(ch).width, lineHeight * SF);
      ctx.fillStyle = charStyle.color || color || '#000000';
    }
    if (cy > config.y + config.h - pad - lineHeight * SF) break;
    ctx.fillText(ch, cx, cy); ctx.fillStyle = prevFill;
    cx += ctx.measureText(ch).width; ci++;
  }

  if (ci === sStart) {
    const lw = ctx.lineWidth, ss = ctx.strokeStyle;
    ctx.lineWidth = 3; ctx.strokeStyle = 'black';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + lineHeight * SF); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = ss;
  }
};

const scale = config => ({
  ...config,
  boxes: (config.boxes || []).map(b => ({ ...b, x: b.x * SF, y: b.y * SF, w: b.w * SF, h: b.h * SF })),
});

export const drawConfig = (ctx, config, dragOffset = { x: 0, y: 0 }, isPresentationMode = false, hoveredBoxId = null) => {
  ctx.clearRect(0, 0, CANVAS_WIDTH * SF, CANVAS_HEIGHT * SF);
  ctx.fillStyle = config?.bgColor || 'transparent'; ctx.fillRect(0, 0, CANVAS_WIDTH * SF, CANVAS_HEIGHT * SF);
  const sc = scale(config);
  const isDragging = dragOffset.x !== 0 || dragOffset.y !== 0;
  sc.boxes.forEach(box => {
    if (isPresentationMode) { drawTextBox(ctx, { ...box, isSelected: false }, false); return; }
    if (box.isSelected && isDragging) {
      ctx.save(); ctx.globalAlpha = 0.3; drawTextBox(ctx, { ...box, isSelected: false }, false); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.7; drawTextBox(ctx, { ...box, x: box.x + dragOffset.x * SF, y: box.y + dragOffset.y * SF }, false); ctx.restore();
    } else {
      drawTextBox(ctx, box, box.id === hoveredBoxId && !box.isSelected);
    }
  });
};

const getLocationForBox = (mouseX, mouseY, box) => {
  const { x, y, w, h } = box;
  const hr = 12 * SF;
  const near = (px, py) => Math.hypot(mouseX - px, mouseY - py) <= hr;
  if (near(x, y)) return 'topLeftCorner'; if (near(x + w, y)) return 'topRightCorner';
  if (near(x, y + h)) return 'bottomLeftCorner'; if (near(x + w, y + h)) return 'bottomRightCorner';
  if (near(x + w / 2, y)) return 'topEdge'; if (near(x + w / 2, y + h)) return 'bottomEdge';
  if (near(x, y + h / 2)) return 'leftEdge'; if (near(x + w, y + h / 2)) return 'rightEdge';
  const bp = 10 * SF;
  if (inRange(mouseX, x - GRAB_DISTANCE, x + bp) || inRange(mouseX, x + w - bp, x + w + GRAB_DISTANCE) ||
      inRange(mouseY, y - GRAB_DISTANCE, y + bp) || inRange(mouseY, y + h - bp, y + h + GRAB_DISTANCE)) return 'border';
  return 'inside';
};

const getBoxUnderMouse = (e, config, ctx) => {
  const { offsetX, offsetY } = e.nativeEvent || e;
  const [mx, my] = [offsetX * SF, offsetY * SF];
  const sc = scale(config);
  const sel = sc.boxes.find(b => b.isSelected);
  if (sel) {
    const loc = getLocationForBox(mx, my, sel);
    if (['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner','leftEdge','rightEdge','topEdge','bottomEdge'].includes(loc)) return [sel, loc, 0];
  }
  const hits = sc.boxes.filter(b => {
    const dx = b.w < 0 ? -1 : 1, dy = b.h < 0 ? -1 : 1;
    return inRange(mx, b.x - GRAB_DISTANCE * dx, b.x + b.w + GRAB_DISTANCE * dx) &&
           inRange(my, b.y - GRAB_DISTANCE * dy, b.y + b.h + GRAB_DISTANCE * dy);
  });
  const hit = last(hits);
  if (!hit) return [null, ''];
  const loc = getLocationForBox(mx, my, hit);
  const pad = 10 * SF;
  let ci = 0, cx = hit.x + pad, cy = hit.y + pad;
  const { fontSize, fontWeight } = hit.boxStyle || {};
  const lh = fontSize * 1.2 || LINE_HEIGHT;
  const font = `${fontWeight || 400} ${fontSize * SF || FONT_SIZE * SF}px Montserrat, sans-serif`;
  while (ci < hit.text?.length) {
    if (cx > hit.x + hit.w - pad - FONT_SIZE * SF || hit.text[ci] === '\n') { cy += lh * SF; cx = hit.x + pad; }
    ctx.font = font;
    let ch = hit.text[ci]; if (ch === '\n') ch = '';
    if (cy > hit.y + hit.h - pad - lh * SF) break;
    cx += ctx.measureText(ch).width;
    if (cx > mx && cy > my - lh * SF) break;
    ci++;
  }
  return [hit, loc, ci];
};

export const isEditingText = config => config?.boxes?.find(b => b.isSelected)?.styles?.find(s => s.isSelection);

const locationToCursor = {
  topLeftCorner: 'nwse-resize', topRightCorner: 'nesw-resize',
  bottomLeftCorner: 'nesw-resize', bottomRightCorner: 'nwse-resize',
  leftEdge: 'ew-resize', rightEdge: 'ew-resize',
  topEdge: 'ns-resize', bottomEdge: 'ns-resize',
  border: 'move', inside: 'text',
};

// ── inline styled components ───────────────────────────────────────────────
const CtxMenu = ({ children, style, ...p }) => (
  <div style={{ position: 'absolute', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 1000, ...style }} {...p}>{children}</div>
);
const CtxItem = ({ children, disabled, style, ...p }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: 'var(--text-primary)', opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto', ...style }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    {...p}>{children}</div>
);
const CtxShortcut = ({ children }) => <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 20 }}>{children}</span>;
const CtxDivider = () => <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />;

// Submenu with hover-controlled visibility using state
const CtxSubmenu = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <CtxItem style={{ justifyContent: 'space-between' }}>
        {label}<span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>▶</span>
      </CtxItem>
      {open && (
        <div style={{ position: 'absolute', left: '100%', top: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 1001 }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ── Slide component ────────────────────────────────────────────────────────
const Slide = ({
  config = { boxes: [] },
  setConfig = () => {},
  onSave = () => {},
  isPresentationMode = false,
  defaultCursor = 'default',
  activeTool = null,
}) => {
  const canvasRef = useRef(null);
  const contextMenuRef = useRef(null);
  const [currentAction, setCurrentAction] = useState('');
  const [resizeHandle, setResizeHandle] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
  const [clipboard, setClipboard] = useState(null);
  const [hoveredBoxId, setHoveredBoxId] = useState(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  useClickOutside(canvasRef, () => { clearSelection(config, setConfig); setContextMenu({ visible: false, x: 0, y: 0 }); });
  useClickOutside(contextMenuRef, () => setContextMenu({ visible: false, x: 0, y: 0 }));

  const selectedBox = config.boxes?.find(b => b.isSelected);

  const handleCut    = () => { if (selectedBox) { setClipboard(cloneDeep(selectedBox)); onDeleteSelectedBox(config, setConfig); } setContextMenu({ visible: false, x: 0, y: 0 }); };
  const handleCopy   = () => { if (selectedBox) setClipboard(cloneDeep(selectedBox)); setContextMenu({ visible: false, x: 0, y: 0 }); };
  const handlePaste  = () => {
    if (clipboard) {
      const nc = cloneDeep(config);
      const nb = { ...cloneDeep(clipboard), id: uuidv4(), x: clipboard.x + 20, y: clipboard.y + 20, isSelected: true };
      nc.boxes.forEach(b => { b.isSelected = false; }); nc.boxes.push(nb); setConfig(nc);
    }
    setContextMenu({ visible: false, x: 0, y: 0 });
  };
  const handleDelete = () => { onDeleteSelectedBox(config, setConfig); setContextMenu({ visible: false, x: 0, y: 0 }); };
  const handleBringToFront = () => { if (selectedBox) { const nc = cloneDeep(config); const i = nc.boxes.findIndex(b => b.id === selectedBox.id); if (i !== -1) { const [box] = nc.boxes.splice(i, 1); nc.boxes.push(box); setConfig(nc); } } setContextMenu({ visible: false, x: 0, y: 0 }); };
  const handleSendToBack   = () => { if (selectedBox) { const nc = cloneDeep(config); const i = nc.boxes.findIndex(b => b.id === selectedBox.id); if (i !== -1) { const [box] = nc.boxes.splice(i, 1); nc.boxes.unshift(box); setConfig(nc); } } setContextMenu({ visible: false, x: 0, y: 0 }); };
  const handleBringForward = () => { if (selectedBox) { const nc = cloneDeep(config); const i = nc.boxes.findIndex(b => b.id === selectedBox.id); if (i !== -1 && i < nc.boxes.length - 1) { const [box] = nc.boxes.splice(i, 1); nc.boxes.splice(i + 1, 0, box); setConfig(nc); } } setContextMenu({ visible: false, x: 0, y: 0 }); };
  const handleSendBackward = () => { if (selectedBox) { const nc = cloneDeep(config); const i = nc.boxes.findIndex(b => b.id === selectedBox.id); if (i > 0) { const [box] = nc.boxes.splice(i, 1); nc.boxes.splice(i - 1, 0, box); setConfig(nc); } } setContextMenu({ visible: false, x: 0, y: 0 }); };

  const onKeyDown = e => {
    if (e.key === 'ArrowRight') updateCursor({ dStart: 1, dEnd: 1 }, config, setConfig);
    if (e.key === 'ArrowLeft')  updateCursor({ dStart: -1, dEnd: -1 }, config, setConfig);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) insertTextAtSelection(e.key, config, setConfig);
    if (e.key === 'Enter') insertTextAtSelection('\n', config, setConfig);
    if (e.key === 'Backspace' && !isEditingText(config)) onDeleteSelectedBox(config, setConfig);
    if (e.key === 'Backspace' && isEditingText(config)) deleteTextSelection(config, setConfig);
    if (e.key === 'Delete' && !isEditingText(config)) onDeleteSelectedBox(config, setConfig);
    if ((e.metaKey || e.ctrlKey) && e.key === 'x' && !isEditingText(config)) { e.preventDefault(); handleCut(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isEditingText(config)) { e.preventDefault(); handleCopy(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !isEditingText(config) && clipboard) { e.preventDefault(); handlePaste(); }
  };

  const onPaste = e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html?.includes('<img')) { insertBoxesFromHtml(html, config, setConfig); return; }
    insertTextAtSelection(e.clipboardData.getData('text/plain'), config, setConfig);
  };

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawConfig(ctx, config, dragOffsetRef.current, isPresentationMode, hoveredBoxId);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('paste', onPaste); };
  }, [JSON.stringify(config), setConfig, isPresentationMode, hoveredBoxId]);

  const ctx = canvasRef.current?.getContext('2d');

  return (
    <div style={isPresentationMode ? { display: 'block', width: '100%', height: '100%', position: 'relative' } : { display: 'grid', position: 'relative' }}>
      <canvas
        style={{ background: config?.bgColor || '#ffffff', width: isPresentationMode ? '100%' : CANVAS_WIDTH, height: isPresentationMode ? '100%' : 'auto', marginLeft: 'auto', marginRight: 'auto', transformOrigin: 'top center', border: isPresentationMode ? 'none' : '1px solid var(--border-default)', display: 'block' }}
        width={CANVAS_WIDTH * SF}
        height={CANVAS_HEIGHT * SF}
        ref={canvasRef}
        onMouseMove={e => {
          if (isPresentationMode) { canvasRef.current.style.cursor = defaultCursor; return; }
          const [box, loc] = getBoxUnderMouse(e, config, ctx);
          const nid = box?.id || null;
          if (nid !== hoveredBoxId) setHoveredBoxId(nid);
          const isImg = !!box?.canvasImage || isBase64Image(box?.text);
          canvasRef.current.style.cursor = (isImg && loc === 'inside') ? 'move' : (locationToCursor[loc] || defaultCursor);
          if (e.buttons !== 1) return;
          if (isEditingText(config)) { const [,,ci] = getBoxUnderMouse(e, config, ctx); updateCursor({ end: ci }, config, setConfig); return; }
          const { movementX, movementY, offsetX, offsetY } = e.nativeEvent;
          const resizes = ['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner','leftEdge','rightEdge','topEdge','bottomEdge'];
          if ((resizes.includes(loc) || currentAction === 'resizing') && currentAction !== 'moving' && !isDraggingRef.current) {
            const h = currentAction === 'resizing' ? resizeHandle : loc;
            onResizeSelectedBox(offsetX * SF, offsetY * SF, h, config, setConfig);
            setCurrentAction('resizing');
            if (!resizeHandle) setResizeHandle(loc);
            canvasRef.current.style.cursor = locationToCursor[h] || 'nwse-resize';
            return;
          }
          if (loc === 'inside' || loc === 'border' || currentAction === 'moving') {
            isDraggingRef.current = true;
            dragOffsetRef.current = { x: dragOffsetRef.current.x + movementX, y: dragOffsetRef.current.y + movementY };
            const c = canvasRef.current?.getContext('2d');
            if (c) drawConfig(c, config, dragOffsetRef.current, isPresentationMode, hoveredBoxId);
            canvasRef.current.style.cursor = 'move';
            setCurrentAction('moving');
          }
        }}
        onMouseDown={e => {
          if (isPresentationMode) return;
          const [box, loc, ci] = getBoxUnderMouse(e, config, ctx);
          if (!box) {
            if (activeTool === 'shape') {
              const { offsetX, offsetY } = e.nativeEvent;
              const size = 100;
              const nc = cloneDeep(config); nc.boxes?.forEach(b => { b.isSelected = false; });
              if (!nc.boxes) nc.boxes = [];
              nc.boxes.push({ id: uuidv4(), x: offsetX - size / 2, y: offsetY - size / 2, w: size, h: size, text: `shape:${JSON.stringify({ type: 'circle', bgColor: '#1473df', borderColor: '#0d5bb5', borderWidth: 2 })}`, styles: [], boxStyle: {}, isSelected: true });
              onSave(nc); return;
            }
            if (activeTool === 'text') { onAddNewBox(e.nativeEvent.offsetX / SF, e.nativeEvent.offsetY / SF, 'Add text here', config, setConfig); return; }
            clearSelection(config, setConfig); return;
          }
          if (e.detail >= 2) e.stopPropagation();
          const curSel = config.boxes.find(b => b.isSelected);
          if (curSel?.id !== box.id) { onSetSelectedBox(box.id, config, setConfig); return; }
          if (loc === 'border') return;
          if (['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner','leftEdge','rightEdge','topEdge','bottomEdge'].includes(loc)) return;
          if (!!box.canvasImage || isBase64Image(box.text)) return;
          if (loc !== 'inside') return;
          if (e.detail === 3) { updateCursorSelectAll(config, setConfig); return; }
          if (e.detail === 2) { updateCursorSelectWord(ci, config, setConfig); return; }
          updateCursor({ start: ci, end: ci }, config, setConfig);
        }}
        onMouseUp={() => {
          if (isDraggingRef.current && (dragOffsetRef.current.x || dragOffsetRef.current.y)) {
            onMoveSelectedBox(dragOffsetRef.current.x * SF, dragOffsetRef.current.y * SF, config, setConfig);
          }
          isDraggingRef.current = false; dragOffsetRef.current = { x: 0, y: 0 };
          setCurrentAction(''); setResizeHandle('');
        }}
        onDoubleClick={e => {
          if (isPresentationMode) return;
          e.stopPropagation();
          const [box, , ci] = getBoxUnderMouse(e, config, ctx);
          if (!box || isEditingText(config)) return;
          updateCursor({ start: ci, end: ci }, config, setConfig);
        }}
        onContextMenu={e => {
          e.preventDefault();
          if (isPresentationMode) return;
          const rect = canvasRef.current.getBoundingClientRect();
          setContextMenu({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      />

      {contextMenu.visible && (
        <CtxMenu ref={contextMenuRef} style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <CtxItem disabled={!selectedBox} onClick={handleCut}>Cut<CtxShortcut>⌘X</CtxShortcut></CtxItem>
          <CtxItem disabled={!selectedBox} onClick={handleCopy}>Copy<CtxShortcut>⌘C</CtxShortcut></CtxItem>
          <CtxItem disabled={!clipboard} onClick={handlePaste}>Paste<CtxShortcut>⌘V</CtxShortcut></CtxItem>
          <CtxDivider />
          <CtxItem disabled={!selectedBox} onClick={handleDelete}>Delete<CtxShortcut>⌫</CtxShortcut></CtxItem>
          <CtxDivider />
          <CtxSubmenu label="Order">
            <CtxItem onClick={handleBringToFront}>Bring to Front</CtxItem>
            <CtxItem onClick={handleBringForward}>Bring Forward</CtxItem>
            <CtxItem onClick={handleSendBackward}>Send Backward</CtxItem>
            <CtxItem onClick={handleSendToBack}>Send to Back</CtxItem>
          </CtxSubmenu>
        </CtxMenu>
      )}
    </div>
  );
};

export default Slide;
