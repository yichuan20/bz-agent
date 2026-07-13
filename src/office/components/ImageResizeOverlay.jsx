import { useEffect, useRef, useState } from 'react';
import { SF } from '../utils/word-utils-refactor';
import { contentYToDrawY, drawYToContentY } from '../utils/word-render-utils';

// SVG icons representing each text-wrap mode
const InlineIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    {/* image block */}
    <rect x="3" y="3" width="12" height="7" rx="1" fill="currentColor" opacity="0.85"/>
    {/* text lines below */}
    <rect x="3" y="12" width="12" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="3" y="14.5" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
  </svg>
);

const SquareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    {/* image block right-floated */}
    <rect x="9" y="3" width="6" height="12" rx="1" fill="currentColor" opacity="0.85"/>
    {/* text lines left of image */}
    <rect x="2" y="4" width="5.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="2" y="7" width="5.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="2" y="10" width="5.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="2" y="13" width="5.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
  </svg>
);

const BehindIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    {/* text lines full-width (in front) */}
    <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="2" y="7" width="14" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="2" y="10" width="14" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="2" y="13" width="10" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    {/* image block behind (lighter, with border) */}
    <rect x="5" y="3" width="8" height="11" rx="1" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1"/>
  </svg>
);

const WRAP_MODES = [
  { id: 'inline', label: 'Inline with text', icon: <InlineIcon /> },
  { id: 'square', label: 'Square wrap',      icon: <SquareIcon /> },
  { id: 'behind', label: 'Behind text',      icon: <BehindIcon /> },
];

const HANDLES = [
  { id: 'tl', cursor: 'nwse-resize', style: { top: -5,  left: -5  } },
  { id: 't',  cursor: 'ns-resize',   style: { top: -5,  left: 'calc(50% - 5px)' } },
  { id: 'tr', cursor: 'nesw-resize', style: { top: -5,  right: -5 } },
  { id: 'l',  cursor: 'ew-resize',   style: { top: 'calc(50% - 5px)', left: -5  } },
  { id: 'r',  cursor: 'ew-resize',   style: { top: 'calc(50% - 5px)', right: -5 } },
  { id: 'bl', cursor: 'nesw-resize', style: { bottom: -5, left: -5  } },
  { id: 'b',  cursor: 'ns-resize',   style: { bottom: -5, left: 'calc(50% - 5px)' } },
  { id: 'br', cursor: 'nwse-resize', style: { bottom: -5, right: -5 } },
];

const ImageResizeOverlay = ({
  imageIndex,
  imageStyle,
  canvasRef,
  xs,
  ys,
  scrollY,
  topMargin = 0,
  onResizeComplete,
  onDelete,
  onWrapChange,
  onMove,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // ghostPos: container-relative CSS px position of the drop-preview outline; null when not dragging
  const [ghostPos, setGhostPos]     = useState(null);
  const [currentSize, setCurrentSize] = useState({ width: 0, height: 0 });
  const [resizeHandle, setResizeHandle] = useState(null);
  const resizeStartPosRef  = useRef({ x: 0, y: 0 });
  const resizeStartSizeRef = useRef({ width: 0, height: 0 });
  // drag start: client XY + overlay origin in container-relative CSS px
  const dragStartRef = useRef({ clientX: 0, clientY: 0, originLeft: 0, originTop: 0 });
  const ghostPosRef  = useRef(null); // readable from the mouseup closure without stale state

  useEffect(() => {
    if (imageStyle?.imageUrl && imageIndex !== null) {
      setCurrentSize({
        width:  imageStyle.imageWidth  || 64,
        height: imageStyle.imageHeight || 64,
      });
    }
  }, [imageStyle, imageIndex]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = e => {
      const dx = e.clientX - resizeStartPosRef.current.x;
      const dy = e.clientY - resizeStartPosRef.current.y;
      let newW = resizeStartSizeRef.current.width;
      let newH = resizeStartSizeRef.current.height;
      const h = resizeHandle;
      if (h.includes('r')) newW = Math.max(20, newW + dx);
      if (h.includes('l')) newW = Math.max(20, newW - dx);
      if (h.includes('b')) newH = Math.max(20, newH + dy);
      if (h.includes('t')) newH = Math.max(20, newH - dy);
      setCurrentSize({ width: Math.round(newW), height: Math.round(newH) });
    };

    const handleMouseUp = () => {
      onResizeComplete?.({ width: currentSize.width, height: currentSize.height });
      setIsResizing(false);
      setResizeHandle(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeHandle, currentSize, onResizeComplete]);

  // Ghost-drag effect: during drag we only move a dashed outline (ghostPos).
  // onMove is called ONCE on mouseup with the final position, avoiding live text reflow
  // and the multi-page coordinate conversion errors that accumulate with repeated deltas.
  useEffect(() => {
    if (!isDragging) return;
    const canvas  = canvasRef?.current;
    const container = canvas?.parentElement;

    const handleMouseMove = e => {
      const dx = e.clientX - dragStartRef.current.clientX;
      const dy = e.clientY - dragStartRef.current.clientY;
      const next = {
        left: dragStartRef.current.originLeft + dx,
        top:  dragStartRef.current.originTop  + dy,
      };
      setGhostPos(next);
      ghostPosRef.current = next;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      const ghost = ghostPosRef.current;
      if (!ghost || !canvas) { setGhostPos(null); return; }

      const canvasRect    = canvas.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect() ?? canvasRect;
      const canvasOffsetX = canvasRect.left - containerRect.left;
      const canvasOffsetY = canvasRect.top  - containerRect.top;

      // X: CSS px from canvas left edge = imagePlacedX (content-space X == draw-space X)
      const newX = Math.round(ghost.left - canvasOffsetX);

      // Y: ghost.top is container-relative CSS px (top-left of image).
      // Convert bottom of image to absolute draw-space canvas px, then to content-space.
      const imgBottomCSS   = ghost.top - canvasOffsetY + currentSize.height;
      const imgBottomDrawPx = imgBottomCSS * SF + scrollY;
      const newY = Math.round(drawYToContentY(imgBottomDrawPx, topMargin) / SF);

      onMove?.({ x: newX, y: newY });
      setGhostPos(null);
      ghostPosRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup',   handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup',   handleMouseUp);
    };
  }, [isDragging, canvasRef, scrollY, topMargin, onMove, currentSize]);

  const handleMoveStart = e => {
    e.stopPropagation();
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    if (imageStyle?.imageWrap === 'inline') return;
    const overlayStyle = getOverlayStyle();
    if (overlayStyle.display === 'none') return;
    dragStartRef.current = {
      clientX:    e.clientX,
      clientY:    e.clientY,
      originLeft: overlayStyle.left,
      originTop:  overlayStyle.top,
    };
    setIsDragging(true);
  };

  const handleResizeStart = (e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    if (!imageStyle?.imageUrl) return;
    resizeStartPosRef.current  = { x: e.clientX, y: e.clientY };
    resizeStartSizeRef.current = { width: currentSize.width, height: currentSize.height };
    setResizeHandle(handle);
    setIsResizing(true);
  };

  const getOverlayStyle = () => {
    if (imageIndex === null || !xs?.[imageIndex] || !ys?.[imageIndex] || !imageStyle?.imageUrl) {
      return { display: 'none' };
    }
    const canvas = canvasRef?.current;
    if (!canvas) return { display: 'none' };

    const container = canvas.parentElement;
    if (!container) return { display: 'none' };

    const imgW = currentSize.width  || imageStyle.imageWidth  || 64;
    const imgH = currentSize.height || imageStyle.imageHeight || 64;

    // ys[] is content-space; convert to canvas draw-space, then subtract scrollY
    const drawY     = contentYToDrawY(ys[imageIndex], topMargin) - scrollY;
    const canvasTop = drawY - imgH * SF;  // top-left of image in canvas px

    const canvasRect    = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top  - containerRect.top;

    return {
      position: 'absolute',
      left:   canvasOffsetX + xs[imageIndex] / SF + (imageStyle?.imageWrap === 'square' || imageStyle?.imageWrap === 'behind' ? 0 : 4),
      top:    canvasOffsetY + canvasTop / SF,
      width:  imgW,
      height: imgH,
      pointerEvents: 'none',
    };
  };

  if (imageIndex === null || !imageStyle?.imageUrl) return null;

  const overlayStyle = getOverlayStyle();
  if (overlayStyle.display === 'none') return null;

  const isMovable = imageStyle?.imageWrap && imageStyle.imageWrap !== 'inline';

  return (
    <>
    <div
      style={{ ...overlayStyle, cursor: isMovable ? 'move' : 'default', pointerEvents: isMovable ? 'all' : 'none', opacity: isDragging ? 0.35 : 1 }}
      onMouseDown={isMovable ? handleMoveStart : undefined}
    >
      {/* Selection border */}
      <div style={{
        position: 'absolute', inset: 0,
        border: '2px solid var(--accent-blue, #1473DF)',
        boxSizing: 'border-box', pointerEvents: 'none',
      }} />

      {/* Resize handles */}
      {HANDLES.map(h => (
        <div
          key={h.id}
          onMouseDown={e => handleResizeStart(e, h.id)}
          style={{
            position: 'absolute',
            width: 10, height: 10,
            background: 'var(--accent-blue, #1473DF)',
            borderRadius: 2,
            cursor: h.cursor,
            pointerEvents: 'all',
            ...h.style,
          }}
        />
      ))}

      {/* Toolbar strip below the image */}
      <div style={{
        position: 'absolute', top: '100%', left: 0,
        marginTop: 4,
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'var(--bg-primary, #fff)',
        border: '1px solid var(--border-primary, #ddd)',
        borderRadius: 6, padding: '4px 8px',
        whiteSpace: 'nowrap', pointerEvents: 'all',
        fontSize: 12, color: 'var(--text-primary, #222)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 10,
      }}>
        <span style={{ opacity: 0.5, fontSize: 11, marginRight: 2 }}>
          {Math.round(currentSize.width)} × {Math.round(currentSize.height)}
        </span>
        <span style={{ opacity: 0.2, margin: '0 2px' }}>|</span>

        {/* Wrap mode icon buttons */}
        {WRAP_MODES.map(m => {
          const active = (imageStyle?.imageWrap || 'inline') === m.id;
          return (
            <button
              key={m.id}
              title={m.label}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onWrapChange?.(m.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, padding: 0,
                background: active ? 'var(--accent-blue, #1473DF)' : 'transparent',
                border: active ? 'none' : '1px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                color: active ? '#fff' : 'var(--text-secondary, #555)',
                transition: 'background 0.15s',
              }}
            >
              {m.icon}
            </button>
          );
        })}

        <span style={{ opacity: 0.2, margin: '0 2px' }}>|</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onDelete}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, padding: 0,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#c00', borderRadius: 4,
          }}
          title="Delete image"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
    {ghostPos && (
      <div style={{
        position: 'absolute',
        left: ghostPos.left,
        top: ghostPos.top,
        width: currentSize.width,
        height: currentSize.height,
        border: '2px dashed #1473DF',
        background: 'rgba(20, 115, 223, 0.08)',
        pointerEvents: 'none',
        zIndex: 100,
        boxSizing: 'border-box',
      }} />
    )}
    </>
  );
};

export default ImageResizeOverlay;
