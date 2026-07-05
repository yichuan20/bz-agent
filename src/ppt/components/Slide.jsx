/* eslint-disable no-unused-vars */
import { cloneDeep, inRange, last } from 'lodash';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
const PPTX_PT_SCALE = CANVAS_WIDTH / 720;
const GRAB_DISTANCE = 10;
const SEL_COLOR = '#1a73e8';
const SEL_BORDER_W = 2;

// ── helpers ────────────────────────────────────────────────────────────────
const isBase64Image = text => typeof text === 'string' && text.startsWith('data:image');
const isShapeConfig = text => typeof text === 'string' && text.startsWith('shape:');
const parseShapeConfig = text => {
  if (!isShapeConfig(text)) return null;
  try { return JSON.parse(text.slice(6)); } catch { return null; }
};

// ── config mutation helpers ────────────────────────────────────────────────
const onSetSelectedBox = (boxId, config, setConfig) => {
  const nc = cloneDeep(config);
  nc.boxes = nc.boxes.map(b => ({ ...b, isSelected: b.id === boxId }));
  setConfig(nc);
};

const clearSelection = (config, setConfig) => {
  const nc = cloneDeep(config);
  nc.boxes.forEach(b => { b.isSelected = false; });
  setConfig(nc);
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

// ── image cache ────────────────────────────────────────────────────────────
const _imgCache = new Map();

// ── drawing helpers ────────────────────────────────────────────────────────
const drawResizeHandles = (ctx, config) => {
  if (!config.isSelected) return;
  const isImg = !!config.canvasImage || isBase64Image(config.text);
  const corners = [
    { x: config.x, y: config.y }, { x: config.x + config.w, y: config.y },
    { x: config.x, y: config.y + config.h }, { x: config.x + config.w, y: config.y + config.h },
  ];
  const edges = [
    { x: config.x + config.w / 2, y: config.y,               horiz: true  },
    { x: config.x + config.w / 2, y: config.y + config.h,    horiz: true  },
    { x: config.x,                y: config.y + config.h / 2, horiz: false },
    { x: config.x + config.w,     y: config.y + config.h / 2, horiz: false },
  ];
  corners.forEach(h => {
    ctx.beginPath(); ctx.arc(h.x, h.y, 5 * SF, 0, Math.PI * 2);
    ctx.fillStyle = SEL_COLOR; ctx.fill();
    ctx.lineWidth = 2 * SF; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  });
  if (!isImg) {
    edges.forEach(h => {
      const rx = h.horiz ? 7 * SF : 4 * SF;
      const ry = h.horiz ? 4 * SF : 7 * SF;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 2 * SF; ctx.strokeStyle = SEL_COLOR; ctx.stroke();
    });
  }
  const rhx = config.x + config.w / 2, rhy = config.y - 28 * SF;
  ctx.beginPath(); ctx.moveTo(rhx, config.y); ctx.lineTo(rhx, rhy + 8 * SF);
  ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 1.5 * SF; ctx.stroke();
  ctx.beginPath(); ctx.arc(rhx, rhy, 8 * SF, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 2 * SF; ctx.strokeStyle = SEL_COLOR; ctx.stroke();
  ctx.beginPath(); ctx.arc(rhx, rhy, 4 * SF, -Math.PI * 0.9, Math.PI * 0.25);
  ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 1.5 * SF; ctx.stroke();
  const aEnd = Math.PI * 0.25, ar = 4 * SF;
  const ax = rhx + Math.cos(aEnd) * ar, ay = rhy + Math.sin(aEnd) * ar;
  const perp = aEnd + Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + Math.cos(perp - 0.5) * 3.5 * SF, ay + Math.sin(perp - 0.5) * 3.5 * SF);
  ctx.lineTo(ax + Math.cos(perp + 0.5) * 3.5 * SF, ay + Math.sin(perp + 0.5) * 3.5 * SF);
  ctx.closePath(); ctx.fillStyle = SEL_COLOR; ctx.fill();
};

// editState = { caretPos: number, caretVisible: boolean } | null
// When editState is non-null this box is in text-editing mode.
const drawTextBox = (ctx, config, isHovered = false, ptScale = PPTX_PT_SCALE, editState = null) => {
  const { x, y, w, h } = config;
  const { type: lineType, lineEnd, lineWidth: lineW, color: lineColor } = config.boxStyle || {};

  if (lineType === 'line') {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
    ctx.strokeStyle = lineColor || '#000000'; ctx.lineWidth = lineW || 2;
    ctx.stroke();
    if (lineEnd === 'arrow') {
      const angle = Math.atan2(h, w);
      const len = Math.sqrt(w ** 2 + h ** 2) * 0.9;
      [angle + 0.05, angle - 0.05].forEach(a => {
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.lineTo(x + w, y + h); ctx.stroke();
      });
    }
    return;
  }

  const rotation = config.rotation || 0;
  if (rotation) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  const buildPath = () => {
    ctx.beginPath();
    const st = config.shapeType || 'rect';
    if (st === 'ellipse') {
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    } else if (st === 'roundRect' && (config.cornerRadius || 0) > 0) {
      const r = Math.min(Math.abs(w), Math.abs(h)) / 2 * ((config.cornerRadius || 0) / 100);
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
      }
    } else if (st === 'triangle' || st === 'isoscelesTri') {
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (st === 'rtTriangle') {
      ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (st === 'diamond') {
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
    } else if (st === 'parallelogram') {
      const sk = w * 0.2;
      ctx.moveTo(x + sk, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (st === 'trapezoid') {
      const sk = w * 0.2;
      ctx.moveTo(x + sk, y); ctx.lineTo(x + w - sk, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (st === 'pentagon') {
      const pts = [
        [x + w / 2, y], [x + w, y + h * 0.38], [x + w * 0.81, y + h], [x + w * 0.19, y + h], [x, y + h * 0.38],
      ];
      ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath();
    } else if (st === 'hexagon') {
      const q = w / 4;
      ctx.moveTo(x + q, y); ctx.lineTo(x + w - q, y); ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - q, y + h); ctx.lineTo(x + q, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
    } else if (st === 'plus' || st === 'mathPlus') {
      const aw = w / 3, ah = h / 3;
      ctx.moveTo(x + aw, y); ctx.lineTo(x + 2 * aw, y);
      ctx.lineTo(x + 2 * aw, y + ah); ctx.lineTo(x + w, y + ah);
      ctx.lineTo(x + w, y + 2 * ah); ctx.lineTo(x + 2 * aw, y + 2 * ah);
      ctx.lineTo(x + 2 * aw, y + h); ctx.lineTo(x + aw, y + h);
      ctx.lineTo(x + aw, y + 2 * ah); ctx.lineTo(x, y + 2 * ah);
      ctx.lineTo(x, y + ah); ctx.lineTo(x + aw, y + ah); ctx.closePath();
    } else if (st === 'mathMinus') {
      ctx.rect(x, y + h * 0.35, w, h * 0.3);
    } else if (st === 'mathMultiply') {
      const t = Math.min(w, h) * 0.18;
      ctx.moveTo(x, y + t); ctx.lineTo(x + t, y); ctx.lineTo(x + w / 2, y + h / 2 - t);
      ctx.lineTo(x + w - t, y); ctx.lineTo(x + w, y + t); ctx.lineTo(x + w / 2 + t, y + h / 2);
      ctx.lineTo(x + w, y + h - t); ctx.lineTo(x + w - t, y + h); ctx.lineTo(x + w / 2, y + h / 2 + t);
      ctx.lineTo(x + t, y + h); ctx.lineTo(x, y + h - t); ctx.lineTo(x + w / 2 - t, y + h / 2); ctx.closePath();
    } else if (st === 'rightArrow' || st === 'curvedRightArrow' || st === 'bentArrow') {
      const sw2 = h * 0.32, nx = x + w * 0.58;
      ctx.moveTo(x, y + h / 2 - sw2); ctx.lineTo(nx, y + h / 2 - sw2);
      ctx.lineTo(nx, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(nx, y + h);
      ctx.lineTo(nx, y + h / 2 + sw2); ctx.lineTo(x, y + h / 2 + sw2); ctx.closePath();
    } else if (st === 'leftArrow') {
      const sw2 = h * 0.32, nx = x + w * 0.42;
      ctx.moveTo(x + w, y + h / 2 - sw2); ctx.lineTo(nx, y + h / 2 - sw2);
      ctx.lineTo(nx, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(nx, y + h);
      ctx.lineTo(nx, y + h / 2 + sw2); ctx.lineTo(x + w, y + h / 2 + sw2); ctx.closePath();
    } else if (st === 'upArrow') {
      const sw2 = w * 0.32, ny = y + h * 0.42;
      ctx.moveTo(x + w / 2 - sw2, y + h); ctx.lineTo(x + w / 2 - sw2, ny);
      ctx.lineTo(x, ny); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, ny);
      ctx.lineTo(x + w / 2 + sw2, ny); ctx.lineTo(x + w / 2 + sw2, y + h); ctx.closePath();
    } else if (st === 'downArrow') {
      const sw2 = w * 0.32, ny = y + h * 0.58;
      ctx.moveTo(x + w / 2 - sw2, y); ctx.lineTo(x + w / 2 - sw2, ny);
      ctx.lineTo(x, ny); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x + w, ny);
      ctx.lineTo(x + w / 2 + sw2, ny); ctx.lineTo(x + w / 2 + sw2, y); ctx.closePath();
    } else if (st === 'chevron') {
      const tip = w * 0.25;
      ctx.moveTo(x, y); ctx.lineTo(x + w - tip, y); ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - tip, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + tip, y + h / 2); ctx.closePath();
    } else if (st === 'can') {
      const ry = Math.min(h * 0.12, w * 0.25);
      ctx.moveTo(x, y + ry);
      ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, 0);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
    } else if (st === 'cube') {
      const d = Math.min(w, h) * 0.22;
      ctx.moveTo(x, y + d); ctx.lineTo(x + d, y); ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h - d); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (st === 'snip1Rect') {
      const cr2 = Math.min(w, h) * 0.25;
      ctx.moveTo(x, y); ctx.lineTo(x + w - cr2, y); ctx.lineTo(x + w, y + cr2);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (st === 'round2SameRect') {
      const r2 = Math.min(w, h) * 0.15;
      ctx.moveTo(x + r2, y); ctx.lineTo(x + w - r2, y);
      ctx.arcTo(x + w, y, x + w, y + r2, r2); ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h); ctx.lineTo(x, y + r2);
      ctx.arcTo(x, y, x + r2, y, r2); ctx.closePath();
    } else if (st === 'round2DiagRect') {
      const r2 = Math.min(w, h) * 0.15;
      ctx.moveTo(x + r2, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r2);
      ctx.arcTo(x + w, y + h, x + w - r2, y + h, r2); ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + r2); ctx.arcTo(x, y, x + r2, y, r2); ctx.closePath();
    } else if (st === 'star5') {
      const cx2 = x + w / 2, cy2 = y + h / 2, ro = Math.min(w, h) / 2, ri = ro * 0.382;
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI / 5) - Math.PI / 2, r2 = i % 2 === 0 ? ro : ri;
        i === 0 ? ctx.moveTo(cx2 + r2 * Math.cos(a), cy2 + r2 * Math.sin(a))
                : ctx.lineTo(cx2 + r2 * Math.cos(a), cy2 + r2 * Math.sin(a));
      }
      ctx.closePath();
    } else if (st === 'star4') {
      const cx2 = x + w / 2, cy2 = y + h / 2, ro = Math.min(w, h) / 2, ri = ro * 0.5;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI / 4) - Math.PI / 4, r2 = i % 2 === 0 ? ro : ri;
        i === 0 ? ctx.moveTo(cx2 + r2 * Math.cos(a), cy2 + r2 * Math.sin(a))
                : ctx.lineTo(cx2 + r2 * Math.cos(a), cy2 + r2 * Math.sin(a));
      }
      ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
  };

  if (config.imageData) {
    if (!_imgCache.has(config.id)) {
      const img = new Image(); img.src = config.imageData;
      _imgCache.set(config.id, img);
    }
    try { ctx.drawImage(_imgCache.get(config.id), x, y, w, h); } catch {}
    if (isHovered && !config.isSelected) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.strokeStyle = 'rgba(26,115,232,0.35)'; ctx.lineWidth = 1 * SF; ctx.stroke(); }
    if (config.isSelected) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = SEL_BORDER_W * SF; ctx.stroke(); drawResizeHandles(ctx, config); }
    if (rotation) ctx.restore();
    return;
  }

  if (config.canvasImage || isBase64Image(config.text)) {
    let img = config.canvasImage;
    if (!img && isBase64Image(config.text)) {
      if (_imgCache.has(config.id)) {
        img = _imgCache.get(config.id);
      } else {
        const ni = new Image();
        ni.onload = () => { _imgCache.set(config.id, ni); config.canvasImage = ni; };
        ni.src = config.text;
        _imgCache.set(config.id, ni); // store even if not yet loaded, so we don't create multiple
        img = ni;
      }
    }
    if (img) { try { ctx.drawImage(img, x, y, w, h); } catch {} }
    if (isHovered && !config.isSelected) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.strokeStyle = 'rgba(26,115,232,0.35)'; ctx.lineWidth = 1 * SF; ctx.stroke(); }
    if (config.isSelected) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = SEL_BORDER_W * SF; ctx.stroke(); drawResizeHandles(ctx, config); }
    if (rotation) ctx.restore();
    return;
  }

  const sc = parseShapeConfig(config.text);
  if (sc) {
    ctx.fillStyle = sc.bgColor || '#1473df'; ctx.strokeStyle = sc.borderColor || '#0d5bb5';
    ctx.lineWidth = (sc.borderWidth || 2) * SF;
    if (sc.type === 'circle') {
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
    if (isHovered && !config.isSelected) { ctx.strokeStyle = 'rgba(26,115,232,0.35)'; ctx.lineWidth = 1 * SF; ctx.strokeRect(x, y, w, h); }
    if (config.isSelected) { ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = SEL_BORDER_W * SF; ctx.strokeRect(x, y, w, h); drawResizeHandles(ctx, config); }
    if (rotation) ctx.restore();
    return;
  }

  // ── Normal text / PPTX-imported shape ─────────────────────────────────────
  const fill = config.fill;
  const bgGrad = config.boxStyle?.bgGradient;
  const bgColor = (fill?.type === 'solid' && fill.color) ? fill.color : (config.boxStyle?.bgColor || 'transparent');
  if (bgGrad && bgGrad.stops && bgGrad.stops.length >= 2) {
    buildPath();
    const rad2 = bgGrad.angle * Math.PI / 180;
    const cx2 = x + w / 2, cy2 = y + h / 2;
    const len2 = Math.sqrt(w * w + h * h) / 2;
    const lg = ctx.createLinearGradient(cx2 - Math.cos(rad2) * len2, cy2 - Math.sin(rad2) * len2,
                                        cx2 + Math.cos(rad2) * len2, cy2 + Math.sin(rad2) * len2);
    bgGrad.stops.forEach(s => lg.addColorStop(s.pos, s.color));
    ctx.fillStyle = lg; ctx.fill();
  } else if (bgColor && bgColor !== 'transparent') {
    buildPath();
    const fillOpacity = fill?.opacity ?? 1;
    if (fillOpacity < 1) { ctx.save(); ctx.globalAlpha = fillOpacity; }
    ctx.fillStyle = bgColor; ctx.fill();
    if (fillOpacity < 1) ctx.restore();
  }

  const borderColor = config.boxStyle?.borderColor || 'transparent';
  const borderWidth = (config.boxStyle?.borderWidth || 0) * SF;
  if (borderColor !== 'transparent' && borderWidth > 0) {
    buildPath(); ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.stroke();
  }

  if (isHovered && !config.isSelected) { buildPath(); ctx.strokeStyle = 'rgba(26,115,232,0.35)'; ctx.lineWidth = 1 * SF; ctx.stroke(); }
  if (config.isSelected) { buildPath(); ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = SEL_BORDER_W * SF; ctx.stroke(); drawResizeHandles(ctx, config); }

  // ── Cylinder top-cap accent ────────────────────────────────────────────────
  if ((config.shapeType || 'rect') === 'can') {
    const ry2 = Math.min(h * 0.12, w * 0.25);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + ry2, w / 2, ry2, 0, 0, Math.PI * 2);
    if (bgColor && bgColor !== 'transparent') { ctx.fillStyle = bgColor; ctx.fill(); }
    if (borderColor !== 'transparent' && borderWidth > 0) { ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.stroke(); }
  }

  // ── Cube face-edge lines ───────────────────────────────────────────────────
  if ((config.shapeType || 'rect') === 'cube') {
    const d2 = Math.min(w, h) * 0.22;
    const lc = borderColor !== 'transparent' ? borderColor : 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(x, y + d2); ctx.lineTo(x + w - d2, y + d2); ctx.lineTo(x + w, y);
    ctx.moveTo(x + w - d2, y + d2); ctx.lineTo(x + w - d2, y + h);
    ctx.strokeStyle = lc; ctx.lineWidth = Math.max(1, borderWidth || 1 * SF); ctx.stroke();
  }

  // ── Text rendering ─────────────────────────────────────────────────────────
  // Use per-box internal margins from PPTX bodyPr (stored as canvas px in boxStyle),
  // falling back to a sensible default (91440 EMU ≈ 7.2pt on standard slides).
  const bs = config.boxStyle || {};
  const padL = (bs.padL != null ? bs.padL : 10) * SF;
  const padR = (bs.padR != null ? bs.padR : 10) * SF;
  const padT = (bs.padT != null ? bs.padT : 5)  * SF;
  const padB = (bs.padB != null ? bs.padB : 5)  * SF;
  const pad = padL; // legacy alias used by non-paragraph text paths below
  const maxW = w - padL - padR;
  ctx.textBaseline = 'top';

  // Rich paragraph mode — only when NOT in edit mode (editState is null)
  const hasParagraphs = config.paragraphs && config.paragraphs.length > 0 && !editState;

  // ── Pre-computed layout path (from backend ppt_layout.py) ─────────────────
  // layoutLines coords are in canvas px (no SF); multiply by SF for painting.
  if (hasParagraphs && config.layoutLines && config.layoutLines.length > 0) {
    ctx.textBaseline = 'top';
    for (const ln of config.layoutLines) {
      const lineY = (y / SF + ln.y) * SF;  // y is already in SF coords; ln.y is canvas px
      for (const seg of ln.segs) {
        const segX = (x / SF + seg.x) * SF;
        const fs = seg.fontSize * ptScale * SF;
        const fw = seg.bold ? 'bold' : 'normal';
        const fi = seg.italic ? 'italic' : 'normal';
        const ff = seg.fontFamily || 'Montserrat';
        ctx.font = `${fi} ${fw} ${fs}px '${ff}', Montserrat, sans-serif`;
        ctx.letterSpacing = ((seg.letterSpacing || 0) * ptScale * SF) + 'px';
        ctx.fillStyle = seg.color || '#000000';
        ctx.fillText(seg.text, segX, lineY);
      }
    }
    ctx.letterSpacing = '0px';
    // Still draw selection/hover handles if needed (handled by caller)
    if (rotation) ctx.restore();
    return;
  }

  if (hasParagraphs) {
    const defFF = config.boxStyle?.fontFamily || 'Montserrat';
    const defFS = (config.boxStyle?.fontSize || 16) * ptScale * SF;
    const defColor = config.boxStyle?.color || '#000000';
    const defAlign = config.boxStyle?.textAlign || 'left';
    const doAllCaps = config.boxStyle?.allCaps;
    const textAnchor = config.boxStyle?.textAnchor || 't';

    const _runFont = run => {
      const fs = (run.fontSize || config.boxStyle?.fontSize || 16) * ptScale * SF;
      const ff = run.fontFamily || defFF;
      const fw = run.bold || config.boxStyle?.fontWeight === 'bold' ? 'bold' : 'normal';
      const fi = run.italic ? 'italic' : 'normal';
      // letterSpacing stored in pt; convert to SF canvas pixels
      const ls = (run.letterSpacing || 0) * ptScale * SF;
      return { fs, ff, fw, fi, lh: fs * 1.2, ls };
    };
    const _runText = run => (doAllCaps || run.allCaps) ? run.text.toUpperCase() : run.text;
    // normAutofit: box was sized to fit content — add tolerance to absorb browser/PPT font-metric differences
    const wrapTolerance = config.boxStyle?.normAutofit ? defFS * 0.25 : 0;

    // Build display lines for a paragraph, flowing all runs horizontally together.
    // Returns [{segs:[{text,color,fs,ff,fw,fi,w}], lh}]
    const buildParaLines = para => {
      const lines = [];
      let segs = [], lineW = 0, lineH = defFS * 1.2;
      const flush = () => {
        lines.push({ segs, lh: lineH });
        segs = []; lineW = 0; lineH = defFS * 1.2;
      };
      for (const run of (para.runs || [])) {
        if (!run.text) continue;
        const { fs, ff, fw, fi, lh, ls } = _runFont(run);
        const color = run.color || defColor;
        ctx.font = `${fi} ${fw} ${fs}px '${ff}', Montserrat, sans-serif`;
        ctx.letterSpacing = ls + 'px';
        lineH = Math.max(lineH, lh);
        const parts = _runText(run).split('\n');
        for (let pi = 0; pi < parts.length; pi++) {
          if (pi > 0) {
            flush();
            lineH = Math.max(lineH, lh);
            ctx.font = `${fi} ${fw} ${fs}px '${ff}', Montserrat, sans-serif`;
            ctx.letterSpacing = ls + 'px';
          }
          // ctx.letterSpacing is already set; measureText incorporates it automatically
          const measure = str => ctx.measureText(str).width;
          const words = parts[pi].split(' ');
          let pending = '';
          for (let wi = 0; wi < words.length; wi++) {
            const sep = wi < words.length - 1 ? ' ' : '';
            const cand = pending + words[wi] + sep;
            const candW = measure(cand);
            if (lineW + candW > maxW + wrapTolerance && (segs.length > 0 || pending)) {
              if (pending) { const pw = measure(pending); segs.push({ text: pending, color, fs, ff, fw, fi, ls, w: pw }); lineW += pw; }
              flush();
              lineH = Math.max(lineH, lh);
              ctx.font = `${fi} ${fw} ${fs}px '${ff}', Montserrat, sans-serif`;
              ctx.letterSpacing = ls + 'px';
              pending = words[wi] + sep;
            } else { pending = cand; }
          }
          if (pending) { const pw = measure(pending); segs.push({ text: pending, color, fs, ff, fw, fi, ls, w: pw }); lineW += pw; }
        }
      }
      ctx.letterSpacing = '0px';
      if (segs.length > 0) flush();
      if (lines.length === 0) lines.push({ segs: [], lh: defFS * 1.2 * 0.5 });
      return lines;
    };

    // Pre-build all paragraph line-groups (needed for textAnchor height calc)
    const paraGroups = config.paragraphs.map(para => ({
      spaceBefore: ((para.spaceBefore || 0) * ptScale) * SF,
      align: para.align || defAlign,
      lines: (!para.runs || para.runs.length === 0)
        ? [{ segs: [], lh: defFS * 1.2 * 0.5 }]
        : buildParaLines(para),
    }));

    let totalH = 0;
    for (const pg of paraGroups) {
      totalH += pg.spaceBefore;
      for (const ln of pg.lines) totalH += ln.lh;
    }

    let ry = textAnchor === 'b' ? y + h - padB - totalH
           : textAnchor === 'ctr' ? y + padT + (h - padT - padB - totalH) / 2
           : y + padT;

    for (const pg of paraGroups) {
      ry += pg.spaceBefore;
      for (const ln of pg.lines) {
        const lineW2 = ln.segs.reduce((s, seg) => s + seg.w, 0);
        const lx = pg.align === 'center' ? x + w / 2 - lineW2 / 2
                 : pg.align === 'right'  ? x + w - padR - lineW2
                 : x + padL;
        let cx = lx;
        for (const seg of ln.segs) {
          ctx.font = `${seg.fi} ${seg.fw} ${seg.fs}px '${seg.ff}', Montserrat, sans-serif`;
          ctx.letterSpacing = (seg.ls || 0) + 'px';
          ctx.fillStyle = seg.color;
          ctx.fillText(seg.text, cx, ry);
          cx += seg.w;
        }
        ctx.letterSpacing = '0px';
        ry += ln.lh;
      }
    }
  } else {
    // Flat text — used for all user-created boxes and while editing
    const { fontSize, fontWeight, color } = config.boxStyle || {};
    const textAlign = config.boxStyle?.textAlign || 'left';
    const fontFamily = config.boxStyle?.fontFamily || 'Montserrat';
    const scaledFS = (fontSize || FONT_SIZE) * ptScale * SF;
    const lineHeight = scaledFS * 1.2;
    const rangeStyles = (config.styles || []).filter(s => !s.isSelection);
    const getCharStyle = ci => {
      const active = rangeStyles.filter(s => s.start <= ci && ci < s.end);
      return active.length ? Object.assign({}, ...active) : {};
    };
    const makeFont = (cs) => {
      const fw = cs.fontWeight || fontWeight || 400;
      const fi = cs.fontStyle || 'normal';
      return `${fi} ${fw} ${scaledFS}px '${fontFamily}', Montserrat, sans-serif`;
    };
    ctx.font = makeFont({});

    const caretPos = editState?.caretPos ?? -1;
    const caretVis = editState?.caretVisible ?? false;
    const selAnchor = editState?.selAnchor ?? caretPos;
    const selStart = Math.min(caretPos, selAnchor);
    const selEnd   = Math.max(caretPos, selAnchor);
    const hasSel   = selStart < selEnd;

    const drawCaret = (cx, cy) => {
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = '#111111';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + lineHeight); ctx.stroke();
      ctx.restore();
    };

    // Pass 1: build line structure with the same wrap condition as the original renderer
    const text = config.text || '';
    const lines = []; // [{chars:[{ci,ch,cs,chW,font}], nlCi:number|-1}]
    let curChars = [];
    let tempCx = x + pad;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        lines.push({ chars: curChars, nlCi: i }); curChars = []; tempCx = x + pad; continue;
      }
      if (tempCx > x + w - pad - scaledFS && curChars.length > 0) {
        lines.push({ chars: curChars, nlCi: -1 }); curChars = []; tempCx = x + pad;
      }
      const cs = getCharStyle(i);
      const chFont = makeFont(cs);
      if (ctx.font !== chFont) ctx.font = chFont;
      const chW = ctx.measureText(ch).width;
      curChars.push({ ci: i, ch, cs, chW, font: chFont });
      tempCx += chW;
    }
    lines.push({ chars: curChars, nlCi: -1 });

    // Pass 2: draw lines with alignment offset
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    let cy = y + pad;
    let caretDone = false;
    for (let li = 0; li < lines.length; li++) {
      const { chars: lc, nlCi } = lines[li];
      const lineW = lc.reduce((s, c) => s + c.chW, 0);
      const lx = textAlign === 'center' ? x + w / 2 - lineW / 2
               : textAlign === 'right'  ? x + w - pad - lineW
               : x + pad;
      let cx = lx;
      // Cursor before the first char of this line
      const firstCi = lc.length > 0 ? lc[0].ci : nlCi >= 0 ? nlCi : text.length;
      if (!caretDone && firstCi === caretPos && caretVis) { drawCaret(cx, cy); caretDone = true; }

      for (const { ci, ch, cs, chW, font: chFont } of lc) {
        if (ctx.font !== chFont) ctx.font = chFont;
        const fc = cs.color || color || '#000000';
        ctx.fillStyle = fc;
        if (hasSel && ci >= selStart && ci < selEnd) {
          ctx.save(); ctx.fillStyle = '#0b57d033'; ctx.fillRect(cx, cy, chW, lineHeight); ctx.restore();
          ctx.fillStyle = fc;
        }
        ctx.fillText(ch, cx, cy);
        if (cs.textDecoration === 'underline') {
          ctx.save(); ctx.strokeStyle = fc; ctx.lineWidth = Math.max(1, scaledFS * 0.05);
          ctx.beginPath(); ctx.moveTo(cx, cy + scaledFS * 1.05); ctx.lineTo(cx + chW, cy + scaledFS * 1.05); ctx.stroke();
          ctx.restore();
        }
        cx += chW;
        if (!caretDone && ci + 1 === caretPos && caretVis) { drawCaret(cx, cy); caretDone = true; }
      }
      // Newline char: selection highlight + cursor at end of line content
      if (nlCi >= 0) {
        if (hasSel && nlCi >= selStart && nlCi < selEnd) {
          ctx.save(); ctx.fillStyle = '#0b57d033'; ctx.fillRect(cx, cy, scaledFS * 0.35, lineHeight); ctx.restore();
        }
        if (!caretDone && nlCi === caretPos && caretVis) { drawCaret(cx, cy); caretDone = true; }
      }
      cy += lineHeight;
    }
    // Cursor at end of text (caretPos === text.length)
    if (!caretDone && caretPos === text.length && caretVis) {
      const ll = lines[lines.length - 1] || { chars: [] };
      const llW = ll.chars.reduce((s, c) => s + c.chW, 0);
      const llx = textAlign === 'center' ? x + w / 2 - llW / 2
                : textAlign === 'right'  ? x + w - pad - llW
                : x + pad;
      drawCaret(llx + llW, cy - lineHeight);
    }
    ctx.restore();
  }

  if (rotation) ctx.restore();
};

const scale = config => ({
  ...config,
  boxes: (config.boxes || []).map(b => ({ ...b, x: b.x * SF, y: b.y * SF, w: b.w * SF, h: b.h * SF })),
});

// editState = { boxId, caretPos, caretVisible } | null
export const drawConfig = (ctx, config, dragOffset = { x: 0, y: 0 }, isPresentationMode = false, hoveredBoxId = null, editState = null) => {
  ctx.clearRect(0, 0, CANVAS_WIDTH * SF, CANVAS_HEIGHT * SF);
  const W = CANVAS_WIDTH * SF, H = CANVAS_HEIGHT * SF;
  const grad = config?.bgGradient;
  if (grad && grad.stops && grad.stops.length >= 2) {
    const rad = grad.angle * Math.PI / 180;
    const cx = W / 2, cy = H / 2;
    const len = Math.sqrt(W * W + H * H) / 2;
    const lg = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
                                        cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
    grad.stops.forEach(s => lg.addColorStop(s.pos, s.color));
    ctx.fillStyle = lg;
  } else {
    ctx.fillStyle = config?.bgColor || 'transparent';
  }
  ctx.fillRect(0, 0, W, H);
  const _ptScale = config?.slideWidthPt ? CANVAS_WIDTH / config.slideWidthPt : PPTX_PT_SCALE;
  const sc = scale(config);
  const isDragging = dragOffset.x !== 0 || dragOffset.y !== 0;
  sc.boxes.forEach(box => {
    const boxEdit = editState?.boxId === box.id ? editState : null;
    if (isPresentationMode) { drawTextBox(ctx, { ...box, isSelected: false }, false, _ptScale, null); return; }
    if (box.isSelected && isDragging) {
      ctx.save(); ctx.globalAlpha = 0.3; drawTextBox(ctx, { ...box, isSelected: false }, false, _ptScale, null); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.7; drawTextBox(ctx, { ...box, x: box.x + dragOffset.x * SF, y: box.y + dragOffset.y * SF }, false, _ptScale, boxEdit); ctx.restore();
    } else {
      drawTextBox(ctx, box, box.id === hoveredBoxId && !box.isSelected, _ptScale, boxEdit);
    }
  });
};

// Legacy export — no longer stores cursor in config
export const isEditingText = () => null;

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
  const raw = e.nativeEvent || e;
  const { offsetX, offsetY } = raw;
  const cssW = raw.target?.offsetWidth || CANVAS_WIDTH;
  const cs = CANVAS_WIDTH / cssW;
  const [mx, my] = [offsetX * cs * SF, offsetY * cs * SF];
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

const locationToCursor = {
  topLeftCorner: 'nwse-resize', topRightCorner: 'nesw-resize',
  bottomLeftCorner: 'nesw-resize', bottomRightCorner: 'nwse-resize',
  leftEdge: 'ew-resize', rightEdge: 'ew-resize',
  topEdge: 'ns-resize', bottomEdge: 'ns-resize',
  border: 'move', inside: 'text',
};

// ── inline styled components ───────────────────────────────────────────────
const CtxMenu = ({ children, style, ...p }) => (
  <div style={{ position: 'fixed', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 9999, ...style }} {...p}>{children}</div>
);
const CtxItem = ({ children, disabled, style, ...p }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: 'var(--text-primary)', opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto', ...style }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    {...p}>{children}</div>
);
const CtxShortcut = ({ children }) => <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 20 }}>{children}</span>;
const CtxDivider = () => <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />;
const CtxSubmenu = ({ label, children, parentX }) => {
  const [open, setOpen] = useState(false);
  // Flip submenu to the left if parent menu is in the right half of the viewport
  const flipLeft = parentX > window.innerWidth / 2;
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <CtxItem style={{ justifyContent: 'space-between' }}>
        {label}<span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{flipLeft ? '◀' : '▶'}</span>
      </CtxItem>
      {open && (
        <div style={{ position: 'absolute', ...(flipLeft ? { right: '100%' } : { left: '100%' }), top: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 1001 }}>
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
  onEditEnd = null,
  onEditStateChange = null,
  isPresentationMode = false,
  defaultCursor = 'default',
  activeTool = null,
  activeShape = 'ellipse',
}) => {
  const canvasRef = useRef(null);
  const contextMenuRef = useRef(null);
  const [currentAction, setCurrentAction] = useState('');
  const [resizeHandle, setResizeHandle] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
  const [clipboard, setClipboard] = useState(null);
  const [hoveredBoxId, setHoveredBoxId] = useState(null);

  // Clean text-editing state — cursor lives here, NOT in config/box.styles
  const [editBoxId, setEditBoxId] = useState(null);
  const [caretPos, setCaretPos] = useState(0);
  const [selAnchor, setSelAnchor] = useState(0); // selection anchor; caretPos is the active end
  const [caretVisible, setCaretVisible] = useState(true);
  const caretBlinkRef = useRef(null);

  // Refs for stale-closure-safe event handlers
  const configRef = useRef(config);
  const editBoxIdRef = useRef(null);
  const caretPosRef = useRef(0);
  const selAnchorRef = useRef(0);
  const clipboardRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // Keep refs in sync with latest state every render
  useEffect(() => { configRef.current = config; });
  useEffect(() => {
    editBoxIdRef.current = editBoxId;
    caretPosRef.current = caretPos;
    selAnchorRef.current = selAnchor;
  }, [editBoxId, caretPos, selAnchor]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  // Notify parent of edit/selection state for toolbar integration
  useEffect(() => {
    if (!onEditStateChange) return;
    if (!editBoxId) { onEditStateChange(null); return; }
    const selStart = Math.min(caretPos, selAnchor);
    const selEnd   = Math.max(caretPos, selAnchor);
    onEditStateChange({ boxId: editBoxId, selStart, selEnd });
  }, [editBoxId, caretPos, selAnchor, onEditStateChange]);

  const stopBlink = useCallback(() => {
    clearInterval(caretBlinkRef.current);
    caretBlinkRef.current = null;
  }, []);

  const startBlink = useCallback(() => {
    stopBlink();
    setCaretVisible(true);
    caretBlinkRef.current = setInterval(() => setCaretVisible(v => !v), 530);
  }, [stopBlink]);

  const exitEdit = useCallback(() => {
    stopBlink();
    setEditBoxId(null);
    setCaretPos(0);
    setSelAnchor(0);
    editBoxIdRef.current = null;
    caretPosRef.current = 0;
    selAnchorRef.current = 0;
  }, [stopBlink]);

  const selectedBox = config.boxes?.find(b => b.isSelected);

  const handleCut = useCallback(() => {
    const sel = configRef.current.boxes?.find(b => b.isSelected);
    if (sel) { setClipboard(cloneDeep(sel)); onDeleteSelectedBox(configRef.current, setConfig); }
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, [setConfig]);

  const handleCopy = useCallback(() => {
    const sel = configRef.current.boxes?.find(b => b.isSelected);
    if (sel) setClipboard(cloneDeep(sel));
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  const handlePaste = useCallback(() => {
    const cb = clipboardRef.current;
    if (cb) {
      const nc = cloneDeep(configRef.current);
      const nb = { ...cloneDeep(cb), id: uuidv4(), x: cb.x + 20, y: cb.y + 20, isSelected: true };
      nc.boxes.forEach(b => { b.isSelected = false; });
      nc.boxes.push(nb);
      setConfig(nc);
    }
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, [setConfig]);

  const handleDelete       = useCallback(() => { onDeleteSelectedBox(configRef.current, setConfig); setContextMenu({ visible: false, x: 0, y: 0 }); }, [setConfig]);
  const handleBringToFront = useCallback(() => { const nc = cloneDeep(configRef.current); const i = nc.boxes.findIndex(b => b.isSelected); if (i !== -1) { const [box] = nc.boxes.splice(i, 1); nc.boxes.push(box); setConfig(nc); } setContextMenu({ visible: false, x: 0, y: 0 }); }, [setConfig]);
  const handleSendToBack   = useCallback(() => { const nc = cloneDeep(configRef.current); const i = nc.boxes.findIndex(b => b.isSelected); if (i !== -1) { const [box] = nc.boxes.splice(i, 1); nc.boxes.unshift(box); setConfig(nc); } setContextMenu({ visible: false, x: 0, y: 0 }); }, [setConfig]);
  const handleBringForward = useCallback(() => { const nc = cloneDeep(configRef.current); const i = nc.boxes.findIndex(b => b.isSelected); if (i !== -1 && i < nc.boxes.length - 1) { const [box] = nc.boxes.splice(i, 1); nc.boxes.splice(i + 1, 0, box); setConfig(nc); } setContextMenu({ visible: false, x: 0, y: 0 }); }, [setConfig]);
  const handleSendBackward = useCallback(() => { const nc = cloneDeep(configRef.current); const i = nc.boxes.findIndex(b => b.isSelected); if (i > 0) { const [box] = nc.boxes.splice(i, 1); nc.boxes.splice(i - 1, 0, box); setConfig(nc); } setContextMenu({ visible: false, x: 0, y: 0 }); }, [setConfig]);

  // Helper: collapse selection to a point and update both state + refs
  const setCaret = useCallback((pos, anchor) => {
    const a = anchor ?? pos;
    setCaretPos(pos); setSelAnchor(a);
    caretPosRef.current = pos; selAnchorRef.current = a;
  }, []);

  // Keyboard + paste handlers — registered once, use refs to avoid stale closures
  useEffect(() => {
    const onKeyDown = e => {
      const eid = editBoxIdRef.current;
      const cp  = caretPosRef.current;
      const sa  = selAnchorRef.current;
      const cfg = configRef.current;

      if (eid) {
        const nc  = cloneDeep(cfg);
        const box = nc.boxes.find(b => b.id === eid);
        if (!box) return;
        const text = box.text || '';
        const sStart = Math.min(cp, sa), sEnd = Math.max(cp, sa);
        const hasSel = sStart < sEnd;

        if (e.key === 'Escape') { exitEdit(); return; }

        // Cmd/Ctrl+A — select all
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault();
          setCaretPos(text.length); setSelAnchor(0);
          caretPosRef.current = text.length; selAnchorRef.current = 0;
          return;
        }

        // Arrow keys
        if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          if (e.shiftKey) {
            const np = Math.max(0, cp - 1);
            setCaretPos(np); caretPosRef.current = np; // selAnchor stays
          } else {
            const np = hasSel ? sStart : Math.max(0, cp - 1);
            setCaretPos(np); setSelAnchor(np); caretPosRef.current = np; selAnchorRef.current = np;
          }
          return;
        }
        if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          if (e.shiftKey) {
            const np = Math.min(text.length, cp + 1);
            setCaretPos(np); caretPosRef.current = np;
          } else {
            const np = hasSel ? sEnd : Math.min(text.length, cp + 1);
            setCaretPos(np); setSelAnchor(np); caretPosRef.current = np; selAnchorRef.current = np;
          }
          return;
        }

        // Backspace — delete selection or char before cursor
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (hasSel) {
            box.text = text.slice(0, sStart) + text.slice(sEnd);
            setCaretPos(sStart); setSelAnchor(sStart);
            caretPosRef.current = sStart; selAnchorRef.current = sStart;
          } else {
            if (cp === 0) return;
            box.text = text.slice(0, cp - 1) + text.slice(cp);
            const np = cp - 1;
            setCaretPos(np); setSelAnchor(np); caretPosRef.current = np; selAnchorRef.current = np;
          }
          setConfig(nc); return;
        }

        // Delete — delete selection or char after cursor
        if (e.key === 'Delete') {
          e.preventDefault();
          if (hasSel) {
            box.text = text.slice(0, sStart) + text.slice(sEnd);
            setCaretPos(sStart); setSelAnchor(sStart);
            caretPosRef.current = sStart; selAnchorRef.current = sStart;
          } else {
            box.text = text.slice(0, cp) + text.slice(cp + 1);
          }
          setConfig(nc); return;
        }

        // Enter / printable characters — replace selection then insert
        if (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
          e.preventDefault();
          const ch = e.key === 'Enter' ? '\n' : e.key;
          box.text = text.slice(0, sStart) + ch + text.slice(sEnd);
          const np = sStart + 1;
          setCaretPos(np); setSelAnchor(np); caretPosRef.current = np; selAnchorRef.current = np;
          setConfig(nc); return;
        }

        return; // consume all other keys while editing
      }

      // Non-editing shortcuts
      if (e.key === 'Backspace' || e.key === 'Delete') onDeleteSelectedBox(cfg, setConfig);
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') { e.preventDefault(); handleCut(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); handleCopy(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && clipboardRef.current) { e.preventDefault(); handlePaste(); }
    };

    const onPaste = e => {
      e.preventDefault();
      const eid = editBoxIdRef.current;
      const cp  = caretPosRef.current;
      const sa  = selAnchorRef.current;
      const cfg = configRef.current;
      const html = e.clipboardData.getData('text/html');
      if (!eid && html?.includes('<img')) { insertBoxesFromHtml(html, cfg, setConfig); return; }
      if (eid) {
        const txt = e.clipboardData.getData('text/plain');
        if (!txt) return;
        const nc  = cloneDeep(cfg);
        const box = nc.boxes.find(b => b.id === eid);
        if (!box) return;
        const t = box.text || '';
        const sStart = Math.min(cp, sa), sEnd = Math.max(cp, sa);
        box.text = t.slice(0, sStart) + txt + t.slice(sEnd);
        const np = sStart + txt.length;
        setCaretPos(np); setSelAnchor(np); caretPosRef.current = np; selAnchorRef.current = np;
        setConfig(nc);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, [exitEdit, handleCut, handleCopy, handlePaste, setConfig]);

  // Canvas draw — reruns on any config/edit/blink change
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const editState = editBoxId ? { boxId: editBoxId, caretPos, caretVisible, selAnchor } : null;
    drawConfig(ctx, config, dragOffsetRef.current, isPresentationMode, hoveredBoxId, editState);
  }, [JSON.stringify(config), isPresentationMode, hoveredBoxId, editBoxId, caretPos, caretVisible, selAnchor]);

  // Thumbnail — capture when not editing and nothing is selected
  useEffect(() => {
    if (editBoxId || !onEditEnd || isPresentationMode || !canvasRef.current) return;
    if (config.boxes?.some(b => b.isSelected)) return;
    const canvas = canvasRef.current;
    const rafId = requestAnimationFrame(() => { try { onEditEnd(canvas.toDataURL('image/jpeg', 0.5)); } catch {} });
    return () => cancelAnimationFrame(rafId);
  }, [editBoxId, JSON.stringify(config), isPresentationMode]);

  // Cleanup blink timer on unmount
  useEffect(() => () => clearInterval(caretBlinkRef.current), []);

  const clickOutsideCb = useCallback(() => {
    if (editBoxIdRef.current) exitEdit();
    clearSelection(configRef.current, setConfig);
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, [exitEdit, setConfig]);

  useClickOutside(canvasRef, clickOutsideCb);
  useClickOutside(contextMenuRef, () => setContextMenu({ visible: false, x: 0, y: 0 }));

  const ctx = canvasRef.current?.getContext('2d');

  return (
    <div style={isPresentationMode ? { display: 'block', width: '100%', height: '100%', position: 'relative' } : { display: 'grid', position: 'relative' }}>
      <canvas
        style={{ background: (() => { const g = config?.bgGradient; if (g && g.stops && g.stops.length >= 2) { const stops = g.stops.map(s => `${s.color} ${Math.round(s.pos * 100)}%`).join(', '); return `linear-gradient(${g.angle + 90}deg, ${stops})`; } return config?.bgColor || '#ffffff'; })(), width: '100%', height: isPresentationMode ? '100%' : 'auto', display: 'block' }}
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
          // Drag-to-select while in text edit mode
          if (e.buttons === 1 && editBoxId) {
            const [,, ci] = getBoxUnderMouse(e, config, ctx);
            if (ci !== caretPosRef.current) { setCaretPos(ci); caretPosRef.current = ci; }
            return;
          }
          if (e.buttons !== 1) return;
          const { movementX, movementY, offsetX, offsetY } = e.nativeEvent;
          const cssW = canvasRef.current?.offsetWidth || CANVAS_WIDTH;
          const cs = CANVAS_WIDTH / cssW;
          const resizes = ['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner','leftEdge','rightEdge','topEdge','bottomEdge'];
          if ((resizes.includes(loc) || currentAction === 'resizing') && currentAction !== 'moving' && !isDraggingRef.current) {
            const h = currentAction === 'resizing' ? resizeHandle : loc;
            onResizeSelectedBox(offsetX * cs * SF, offsetY * cs * SF, h, config, setConfig);
            setCurrentAction('resizing');
            if (!resizeHandle) setResizeHandle(loc);
            canvasRef.current.style.cursor = locationToCursor[h] || 'nwse-resize';
            return;
          }
          if (loc === 'inside' || loc === 'border' || currentAction === 'moving') {
            isDraggingRef.current = true;
            dragOffsetRef.current = { x: dragOffsetRef.current.x + movementX * cs, y: dragOffsetRef.current.y + movementY * cs };
            const c = canvasRef.current?.getContext('2d');
            if (c) drawConfig(c, config, dragOffsetRef.current, isPresentationMode, hoveredBoxId, null);
            canvasRef.current.style.cursor = 'move';
            setCurrentAction('moving');
          }
        }}
        onMouseDown={e => {
          if (isPresentationMode) return;
          const [box, loc] = getBoxUnderMouse(e, config, ctx);
          if (!box) {
            const _cssW = canvasRef.current?.offsetWidth || CANVAS_WIDTH;
            const _cs = CANVAS_WIDTH / _cssW;
            if (activeTool === 'shape') {
              const { offsetX, offsetY } = e.nativeEvent;
              const size = 100;
              const nc = cloneDeep(config); nc.boxes?.forEach(b => { b.isSelected = false; });
              if (!nc.boxes) nc.boxes = [];
              nc.boxes.push({ id: uuidv4(), x: offsetX * _cs - size / 2, y: offsetY * _cs - size / 2, w: size, h: size, shapeType: activeShape, fill: { type: 'solid', color: '#1473df' }, text: '', styles: [], boxStyle: { borderColor: '#0d5bb5', borderWidth: 2, bgColor: 'transparent' }, isSelected: true });
              onSave(nc); return;
            }
            if (activeTool === 'text') { onAddNewBox(e.nativeEvent.offsetX * _cs, e.nativeEvent.offsetY * _cs, 'Add text here', config, setConfig); return; }
            if (editBoxId) exitEdit();
            clearSelection(config, setConfig); return;
          }
          if (e.detail >= 2) e.stopPropagation();
          const curSel = config.boxes.find(b => b.isSelected);
          if (curSel?.id !== box.id) {
            if (editBoxId) exitEdit();
            onSetSelectedBox(box.id, config, setConfig); return;
          }
          if (loc === 'border') return;
          if (['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner','leftEdge','rightEdge','topEdge','bottomEdge'].includes(loc)) return;
          if (!!box.canvasImage || isBase64Image(box.text)) return;
          if (loc !== 'inside') return;
          // Reposition caret / selection while editing this box
          if (editBoxId === box.id) {
            const [,, ci] = getBoxUnderMouse(e, config, ctx);
            if (e.detail >= 3) {
              // Triple-click: select all
              const t = box.text || '';
              setCaretPos(t.length); setSelAnchor(0);
              caretPosRef.current = t.length; selAnchorRef.current = 0;
            } else {
              // Single/double-click mousedown: collapse cursor (word-select fires in onDoubleClick)
              setCaret(ci);
            }
            return;
          }
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
          const [box] = getBoxUnderMouse(e, config, ctx);
          if (!box) return;
          if (box.imageData || isBase64Image(box.text) || box.canvasImage || isShapeConfig(box.text)) return;

          // Already editing: select word at cursor
          if (editBoxId === box.id) {
            const text = box.text || '';
            const pos = caretPosRef.current;
            const isWord = c => /\w/.test(c);
            let ws = pos, we = pos;
            while (ws > 0 && isWord(text[ws - 1])) ws--;
            while (we < text.length && isWord(text[we])) we++;
            setCaretPos(we); setSelAnchor(ws);
            caretPosRef.current = we; selAnchorRef.current = ws;
            return;
          }

          if (box.paragraphs?.length) {
            // Flatten PPTX rich-text to editable flat text
            const nc = cloneDeep(config);
            const b = nc.boxes.find(b2 => b2.id === box.id);
            const flatText = box.paragraphs.map(p => (p.runs || []).map(r => r.text || '').join('')).join('\n');
            if (b) { b.text = flatText; delete b.paragraphs; }
            setConfig(nc);
            setEditBoxId(box.id);
            setCaretPos(flatText.length);
            editBoxIdRef.current = box.id;
            caretPosRef.current = flatText.length;
            startBlink();
            return;
          }

          const pos = box.text?.length ?? 0;
          setEditBoxId(box.id);
          setCaretPos(pos);
          editBoxIdRef.current = box.id;
          caretPosRef.current = pos;
          startBlink();
        }}
        onContextMenu={e => {
          e.preventDefault();
          if (isPresentationMode) return;
          setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
        }}
      />

      {contextMenu.visible && createPortal((() => {
        const MENU_W = 180, MENU_H = 240;
        const mx = Math.min(contextMenu.x, window.innerWidth  - MENU_W - 8);
        const my = Math.min(contextMenu.y, window.innerHeight - MENU_H - 8);
        return (
          <CtxMenu ref={contextMenuRef} style={{ left: mx, top: my }} onClick={e => e.stopPropagation()}>
            <CtxItem disabled={!selectedBox} onClick={handleCut}>Cut<CtxShortcut>⌘X</CtxShortcut></CtxItem>
            <CtxItem disabled={!selectedBox} onClick={handleCopy}>Copy<CtxShortcut>⌘C</CtxShortcut></CtxItem>
            <CtxItem disabled={!clipboard} onClick={handlePaste}>Paste<CtxShortcut>⌘V</CtxShortcut></CtxItem>
            <CtxDivider />
            <CtxItem disabled={!selectedBox} onClick={handleDelete}>Delete<CtxShortcut>⌫</CtxShortcut></CtxItem>
            <CtxDivider />
            <CtxSubmenu label="Order" parentX={mx}>
              <CtxItem onClick={handleBringToFront}>Bring to Front</CtxItem>
              <CtxItem onClick={handleBringForward}>Bring Forward</CtxItem>
              <CtxItem onClick={handleSendBackward}>Send Backward</CtxItem>
              <CtxItem onClick={handleSendToBack}>Send to Back</CtxItem>
            </CtxSubmenu>
          </CtxMenu>
        );
      })(), document.body)}
    </div>
  );
};

export default Slide;
