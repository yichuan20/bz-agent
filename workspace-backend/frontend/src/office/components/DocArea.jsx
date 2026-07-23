import { clamp, cloneDeep } from 'lodash';
import { useEffect, useRef, useState } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import {
  ARROW_KEYS,
  addMultiClickSelection,
  addTableColumn,
  addTableRow,
  C_START,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  deleteText,
  drawDoc,
  EMPTY_DOC,
  getStartEnd,
  insertText,
  moveCaret,
  PAGE_GAP,
  PAGE_HEIGHT,
  R_START,
  SF,
  setImageLoadCallback,
  T_END,
  VIEW_W,
} from '../utils/word-utils-refactor';

// ── Scratch-built cursor engine ───────────────────────────────────────────────
// xs[i] / ys[i] are in ABSOLUTE canvas pixel space (draw space, before scrollY).
// clickX = offsetX * SF,  clickY = offsetY * SF + scrollY
const LINE_SNAP = 4;

function findCursorIndex(clickX, clickY, xs, ys) {
  if (!xs || !ys || xs.length === 0) return 0;
  // Step 1: find the line whose Y is nearest to clickY
  let nearestLineY = null,
    minYDist = Infinity;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] == null) continue;
    const d = Math.abs(ys[i] - clickY);
    if (d < minYDist) {
      minYDist = d;
      nearestLineY = ys[i];
    }
  }
  if (nearestLineY === null) return 0;
  // Step 2: on that line, find the char with nearest X
  let bestIdx = 0,
    minXDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null || Math.abs(ys[i] - nearestLineY) > LINE_SNAP) continue;
    const d = Math.abs(xs[i] - clickX);
    if (d < minXDist) {
      minXDist = d;
      bestIdx = i;
    }
  }
  // Step 3: if click is past the char centre, advance to next char on same line
  if (xs[bestIdx] != null && clickX > xs[bestIdx]) {
    const next = bestIdx + 1;
    if (next < ys.length && ys[next] != null && Math.abs(ys[next] - nearestLineY) <= LINE_SNAP) {
      bestIdx = next;
    }
  }
  return Math.max(0, Math.min(bestIdx, xs.length - 1));
}

function paintCursor(ctx, xs, ys, selStart, scrollY, styles, topMargin) {
  const absX = xs[selStart],
    contentY = ys[selStart];
  if (absX == null || contentY == null) return;
  // ys are in content space — convert to canvas draw space
  const drawY = contentYToDrawY(contentY, topMargin) - scrollY;

  // Derive font size from the character just before the cursor (fallback to default)
  const refIdx = selStart > 0 ? selStart - 1 : 0;
  const fontSize = (styles?.[refIdx]?.fontSize ?? 16) * SF;

  const prev = { stroke: ctx.strokeStyle, width: ctx.lineWidth, cap: ctx.lineCap };
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2 * SF;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(absX, drawY - fontSize); // top of cursor (one font-size above baseline)
  ctx.lineTo(absX, drawY + fontSize * 0.2); // slight descender below baseline
  ctx.stroke();
  ctx.strokeStyle = prev.stroke;
  ctx.lineWidth = prev.width;
  ctx.lineCap = prev.cap;
}

import { getCellAtClick } from '../utils/table-utils';
// ─────────────────────────────────────────────────────────────────────────────
import { contentYToDrawY, drawYToContentY } from '../utils/word-render-utils';
import ImageResizeOverlay from './ImageResizeOverlay';
import TableContextMenu from './TableContextMenu';

const Container = ({ children, ...props }) => (
  <div
    style={{
      overflow: 'auto',
      overscrollBehavior: 'none',
      height: '100%',
      width: '100%',
      background: 'var(--bg-tertiary,#e8e8e8)',
      position: 'relative',
      display: 'grid',
      justifyContent: 'center',
    }}
    {...props}
  >
    {children}
  </div>
);

const Canvas = props => (
  <canvas style={{ height: '100%', width: VIEW_W, marginTop: 0, border: 'none' }} {...props} />
);

const initCanvasSize = canvasRef => {
  const canvas = canvasRef?.current;
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  canvas.style.height = `${rect.height}px`;

  canvas.setAttribute('height', rect.height * SF);
  canvas.setAttribute('width', rect.width * SF);
};

const DocArea = ({ className, doc = EMPTY_DOC, onDocChange = () => {}, topMargin = 160 }) => {
  doc = doc || EMPTY_DOC;

  const [scrollY, setScrollY] = useState(0);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [xs, setXs] = useState([]);
  const [ys, setYs] = useState([]);
  const xsRef = useRef([]);
  const ysRef = useRef([]);
  xsRef.current = xs;
  ysRef.current = ys;
  const [isFocussed, setIsFocussed] = useState(false);
  const [_canvasVersion, setCanvasVersion] = useState(0); // increments when canvas is resized
  // Track mousedown position to require a minimum drag distance before extending selection.
  // This prevents single-click jitter from accidentally creating a selection.
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const [_imageLoadTrigger, setImageLoadTrigger] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    tableInfo: null,
  });
  const [caretVisible, setCaretVisible] = useState(true);
  const [_theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light',
  );

  const canvasRef = useRef();
  const caretBlinkRef = useRef();
  const containerRef = useRef();
  const imageLoadCallbackRef = useRef();
  const contextMenuRef = useRef();
  const scrollSnapTimeoutRef = useRef();

  useClickOutside(canvasRef, () => {
    setIsFocussed(false);
    setSelectedImageIndex(null);
  });

  const { text, styles, selStart, selEnd } = doc;

  // Canvas sizing: use ResizeObserver so the canvas re-initialises when it
  // gets its real layout dimensions (e.g. after a key-triggered remount where
  // getBoundingClientRect() would return 0×0 on the first synchronous pass).
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) {
        initCanvasSize(canvasRef);
        setCanvasVersion(v => v + 1); // trigger redraw with correct dimensions
      }
    });
    observer.observe(canvas);
    // Also attempt immediately in case dimensions are already known
    initCanvasSize(canvasRef);
    return () => observer.disconnect();
  }, []);

  // Listen for theme changes (data-theme attribute on <html>) to re-render canvas
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  // Set up image load callback to trigger redraw
  useEffect(() => {
    imageLoadCallbackRef.current = () => {
      setImageLoadTrigger(prev => prev + 1);
    };
    setImageLoadCallback(() => {
      imageLoadCallbackRef.current?.();
    });
    return () => {
      setImageLoadCallback(null);
      imageLoadCallbackRef.current = null;
    };
  }, []);

  // Caret blinking effect
  useEffect(() => {
    if (isFocussed && selStart === selEnd) {
      // Reset caret to visible when cursor moves or user types
      setCaretVisible(true);

      // Clear any existing interval
      if (caretBlinkRef.current) {
        clearInterval(caretBlinkRef.current);
      }

      // Start blinking interval
      caretBlinkRef.current = setInterval(() => {
        setCaretVisible(prev => !prev);
      }, 530);

      return () => {
        if (caretBlinkRef.current) {
          clearInterval(caretBlinkRef.current);
        }
      };
    } else {
      // Not focused or has selection - keep caret visible (for selection rendering)
      setCaretVisible(true);
      if (caretBlinkRef.current) {
        clearInterval(caretBlinkRef.current);
      }
    }
  }, [isFocussed, selStart, selEnd]);

  // Close context menu on outside click
  useEffect(() => {
    const handleDocumentMouseDown = e => {
      if (contextMenu.visible && contextMenuRef.current) {
        const menuElement = contextMenuRef.current;
        if (menuElement && !menuElement.contains(e.target)) {
          setContextMenu({
            visible: false,
            x: 0,
            y: 0,
            tableInfo: null,
          });
        }
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleDocumentMouseDown);
      return () => {
        document.removeEventListener('mousedown', handleDocumentMouseDown);
      };
    }
  }, [contextMenu.visible]);

  // Clipboard + keyboard handlers — must be declared before the useEffect below
  // to avoid temporal dead zone (const is not hoisted like function declarations).
  const onCopy = e => {
    if (!isFocussed) {
      return;
    }
    e.preventDefault();
    const [start, end] = getStartEnd(doc);
    const selectedText = text?.slice(start, end);
    e.clipboardData.setData('text', selectedText);
  };

  const onCut = e => {
    if (!isFocussed) {
      return;
    }
    e.preventDefault();
    const [start, end] = getStartEnd(doc);
    const selectedText = text?.slice(start, end);
    e.clipboardData.setData('text', selectedText);

    const newDoc = deleteText({ doc });
    onDocChange(newDoc);
  };

  const onPaste = e => {
    if (!isFocussed) {
      return;
    }

    e.preventDefault();

    const textToInsert = e.clipboardData.getData('text');
    const newDoc = insertText({ doc, textToInsert });
    onDocChange(newDoc);
  };

  const onKeyDown = e => {
    const hasSelection =
      doc.selStart !== doc.selEnd || (doc.text?.length > 0 && doc.selStart !== undefined);
    const shouldHandleKey =
      isFocussed || (hasSelection && document?.activeElement?.tagName === 'BODY');

    if (!shouldHandleKey || document?.activeElement?.tagName !== 'BODY') {
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      // select all
      if (e?.metaKey && e.key === 'a') {
        e.preventDefault();
        onDocChange({ ...doc, selStart: 0, selEnd: text?.length });
      }

      return;
    }

    if (ARROW_KEYS.includes(e.key)) {
      // Special handling when image is selected
      if (selectedImageIndex !== null) {
        if (e.key === 'ArrowLeft') {
          // Move caret to position before the image (stay at imageIndex, just clear selection)
          const newDoc = { ...doc, selStart: selectedImageIndex, selEnd: selectedImageIndex };
          setSelectedImageIndex(null);
          onDocChange(newDoc);
          return;
        } else if (e.key === 'ArrowRight') {
          // Move caret to position after the image
          const newCaretIndex = Math.min(doc.text?.length || 0, selectedImageIndex + 1);
          const newDoc = { ...doc, selStart: newCaretIndex, selEnd: newCaretIndex };
          setSelectedImageIndex(null);
          onDocChange(newDoc);
          return;
        } else {
          // For ArrowUp/ArrowDown, clear image selection first
          setSelectedImageIndex(null);
        }
      }

      // Check if caret is at image position and pressing ArrowRight to select image
      const currentIndex = doc.selStart;
      if (
        e.key === 'ArrowRight' &&
        currentIndex >= 0 &&
        currentIndex < styles?.length &&
        styles[currentIndex]?.imageUrl
      ) {
        // Select the image instead of moving past it
        setSelectedImageIndex(currentIndex);
        setIsFocussed(true);
        return;
      }

      // Check if caret is after image and pressing ArrowLeft to select image
      if (
        e.key === 'ArrowLeft' &&
        currentIndex > 0 &&
        currentIndex <= styles?.length &&
        styles[currentIndex - 1]?.imageUrl
      ) {
        // Select the image instead of moving past it
        setSelectedImageIndex(currentIndex - 1);
        setIsFocussed(true);
        return;
      }

      const newDoc = moveCaret({ doc, key: e.key, xs, ys });

      // Clear image selection when moving (don't auto-select images)
      setSelectedImageIndex(null);

      onDocChange(newDoc);
      return;
    }

    // if character key
    if (e.key.length === 1 || e.key === 'Enter') {
      let charToInsert = e.key;

      if (e.key === 'Enter') {
        charToInsert = '\n';
      }

      const newDoc = insertText({ doc, textToInsert: charToInsert });
      onDocChange(newDoc);
      return;
    }

    // Delete selected image (Backspace or Delete key)
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedImageIndex !== null) {
      const newDoc = cloneDeep(doc);
      const i = selectedImageIndex;
      newDoc.text = newDoc.text.slice(0, i) + newDoc.text.slice(i + 1);
      newDoc.styles = [...newDoc.styles.slice(0, i), ...newDoc.styles.slice(i + 1)];
      newDoc.selStart = i;
      newDoc.selEnd = i;
      setSelectedImageIndex(null);
      onDocChange(newDoc);
      return;
    }

    if (e.key === 'Backspace') {
      const newDoc = deleteText({ doc });
      onDocChange(newDoc);
      return;
    }
  };

  // init event listeners
  useEffect(() => {
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);

    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: callbacks stable
  }, [onCopy, onCut, onKeyDown, onPaste]);

  // redrawing loop
  useEffect(() => {
    const canvas = canvasRef?.current;
    const ctx = canvas?.getContext('2d');
    const gapColor = containerRef?.current
      ? getComputedStyle(containerRef.current).getPropertyValue('--bg-tertiary').trim() || '#e8e8e8'
      : '#e8e8e8';
    // Pass caretVisible=false so drawDoc never paints the cursor itself.
    // Our scratch-built paintCursor handles it separately, using draw-space xs/ys.
    const [newXs, newYs] = drawDoc({
      ctx,
      doc,
      scrollY,
      xs: xsRef.current,
      ys: ysRef.current,
      topMargin,
      hideCaretAtIndex: selectedImageIndex,
      caretVisible: false,
      gapColor,
    });
    setXs(newXs || []);
    setYs(newYs || []);
    // Paint cursor on top using the new engine (draw-space coords)
    if (caretVisible && selStart === selEnd && selectedImageIndex == null) {
      paintCursor(ctx, newXs, newYs, selStart, scrollY, styles, topMargin);
    }
  // biome-ignore lint/correctness/useExhaustiveDependencies: xs/ys read via refs to avoid self-loop
  }, [styles, selStart, selEnd, scrollY, selectedImageIndex, caretVisible, doc, topMargin, _canvasVersion, _imageLoadTrigger]);

  const onMouseDown = e => {
    e.preventDefault();
    document.activeElement.blur();

    const clickX = e.nativeEvent.offsetX * SF;
    const clickCanvasY = e.nativeEvent.offsetY * SF + scrollY; // draw/canvas space
    const clickY = drawYToContentY(clickCanvasY, topMargin); // content space (for ys)

    // Pre-check: hit-test placed (non-inline) images BEFORE findCursorIndex.
    // findCursorIndex maps to the nearest text character, which may not be the image
    // character even when the click lands squarely on the image.
    for (let si = 0; si < (styles?.length || 0); si++) {
      const s = styles?.[si];
      if (!s?.imageUrl || s.imagePlacedX == null) continue;
      // imagePlacedX/Y are in CSS px; convert to canvas px for comparison with clickX/Y
      const spx = s.imagePlacedX * SF;
      const spy = s.imagePlacedY * SF;
      const imgW = (s.imageWidth || 64) * SF;
      const imgH = (s.imageHeight || 64) * SF;
      if (clickX >= spx && clickX <= spx + imgW && clickY >= spy - imgH && clickY <= spy) {
        setSelectedImageIndex(si);
        setIsFocussed(true);
        onDocChange({ ...doc, selStart: si, selEnd: si });
        setIsMouseDown(false);
        return;
      }
    }

    const ind = findCursorIndex(clickX, clickY, xs, ys);
    let clampedInd = clamp(ind, 0, text?.length);

    // TABLE CLICK OVERRIDE: getCellAtClick works in content-space ys — pass clickY (content)
    const clickedCell = getCellAtClick(clickX, clickY, text, xs, ys);
    if (clickedCell) {
      const { tStartIndex, tEndIndex, rowIndex, columnIndex } = clickedCell;

      // Locate [cellStart, cellEnd) for the clicked cell
      // cellStart = index of this cell's C_START
      // cellEnd   = index of the next separator (C_START / R_START / T_END)
      let row = -1,
        col = -1,
        cellStart = -1,
        cellEnd = tEndIndex + 1;
      for (let k = tStartIndex; k <= tEndIndex; k++) {
        if (text[k] === R_START) {
          row++;
          col = -1;
        } else if (text[k] === C_START) {
          col++;
          if (row === rowIndex && col === columnIndex) {
            cellStart = k;
            let sep = k + 1;
            while (
              sep <= tEndIndex &&
              text[sep] !== C_START &&
              text[sep] !== R_START &&
              text[sep] !== T_END
            )
              sep++;
            cellEnd = sep;
            break;
          }
        }
      }

      if (cellStart >= 0) {
        const contentStart = cellStart + 1; // first typeable position in cell
        const contentEnd = cellEnd; // exclusive (= the separator char)

        if (contentStart >= contentEnd) {
          // Empty cell — cursor goes to contentStart (= separator), user types here
          clampedInd = contentStart;
        } else {
          // Find the content char whose x is closest to clickX
          let bestIdx = contentStart;
          let bestDist = Infinity;
          for (let k = contentStart; k < contentEnd; k++) {
            const d = Math.abs((xs[k] || 0) - clickX);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = k;
            }
          }
          // If click is to the right of the last content char, place after it
          const lastK = contentEnd - 1;
          if (clickX > (xs[lastK] || 0) + 10) {
            bestIdx = contentEnd; // insert position after last content char
          }
          clampedInd = Math.min(bestIdx, contentEnd);
        }
      }
    }

    // Check if clicking on an image at current index
    if (styles?.[clampedInd]?.imageUrl) {
      setSelectedImageIndex(clampedInd);
      setIsFocussed(true);
      // Sync doc cursor position with image selection
      onDocChange({ ...doc, selStart: clampedInd, selEnd: clampedInd });
      setIsMouseDown(false);
      return;
    }

    // Check if clicking on the right half of the previous image
    // (getNearestCharIndex returns next char index when clicking image's right half)
    const prevInd = clampedInd - 1;
    if (prevInd >= 0 && styles?.[prevInd]?.imageUrl) {
      const imgWidth = (styles[prevInd].imageWidth || 64) * SF;
      const imgLeft = xs[prevInd];
      const imgRight = imgLeft + imgWidth;

      if (clickX >= imgLeft && clickX <= imgRight) {
        setSelectedImageIndex(prevInd);
        setIsFocussed(true);
        onDocChange({ ...doc, selStart: prevInd, selEnd: prevInd });
        setIsMouseDown(false);
        return;
      }
    }

    // Clear image selection when clicking outside image
    if (selectedImageIndex !== null) {
      setSelectedImageIndex(null);
    }

    setIsMouseDown(true);
    setIsFocussed(true);
    mouseDownPosRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    let newDoc = { ...doc, selStart: clampedInd, selEnd: clampedInd };
    newDoc = addMultiClickSelection(newDoc, e);

    onDocChange(newDoc);

    if (e.detail === 1 && styles?.[clampedInd]?.url) {
      setIsMouseDown(false);
      window.open(styles[clampedInd].url, '_blank');
    }
  };

  const handleImageResizeComplete = ({ width, height }) => {
    if (selectedImageIndex === null) return;
    const newDoc = cloneDeep(doc);
    const imageStyle = newDoc.styles[selectedImageIndex];
    if (imageStyle?.imageUrl) {
      newDoc.styles[selectedImageIndex] = { ...imageStyle, imageWidth: width, imageHeight: height };
      onDocChange(newDoc);
    }
  };

  const handleImageDelete = () => {
    if (selectedImageIndex === null) return;
    const newDoc = cloneDeep(doc);
    const i = selectedImageIndex;
    newDoc.text = newDoc.text.slice(0, i) + newDoc.text.slice(i + 1);
    newDoc.styles = [...newDoc.styles.slice(0, i), ...newDoc.styles.slice(i + 1)];
    newDoc.selStart = i;
    newDoc.selEnd = i;
    setSelectedImageIndex(null);
    onDocChange(newDoc);
  };

  const handleImageWrapChange = wrap => {
    if (selectedImageIndex === null) return;
    const newDoc = cloneDeep(doc);
    const cur = newDoc.styles[selectedImageIndex];
    const update = { ...cur, imageWrap: wrap };
    // When switching to a non-inline mode for the first time, seed explicit coordinates
    // from the image's current canvas position so it stays in place.
    if (wrap !== 'inline' && cur.imagePlacedX == null && xs[selectedImageIndex] != null) {
      // Store in CSS px (canvas px ÷ SF) so position is device-independent
      update.imagePlacedX = xs[selectedImageIndex] / SF + 4; // +4px: xs stores raw x, spacePadding added at draw time
      update.imagePlacedY = ys[selectedImageIndex] / SF;
    }
    // When switching back to inline, clear placed coordinates
    if (wrap === 'inline') {
      delete update.imagePlacedX;
      delete update.imagePlacedY;
    }
    newDoc.styles[selectedImageIndex] = update;
    onDocChange(newDoc);
  };

  const handleImageMove = ({ x, y }) => {
    if (selectedImageIndex === null) return;
    const newDoc = cloneDeep(doc);
    newDoc.styles[selectedImageIndex] = {
      ...newDoc.styles[selectedImageIndex],
      imagePlacedX: x,
      imagePlacedY: y,
    };
    onDocChange(newDoc);
  };

  const onMouseUp = () => {
    setIsMouseDown(false);
  };

  // Global mouseup — resets drag state even if mouse is released outside the canvas.
  useEffect(() => {
    const handler = () => setIsMouseDown(false);
    document.addEventListener('mouseup', handler);
    return () => document.removeEventListener('mouseup', handler);
  }, []);

  const MIN_DRAG_PX = 4; // pixels before a click becomes a drag-selection
  const onMouseMove = e => {
    if (!isMouseDown) return;
    const dx = e.clientX - mouseDownPosRef.current.x;
    const dy = e.clientY - mouseDownPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) < MIN_DRAG_PX) return; // ignore micro-jitter
    const mx = e.nativeEvent.offsetX * SF;
    const my = drawYToContentY(e.nativeEvent.offsetY * SF + scrollY, topMargin);
    const ind = findCursorIndex(mx, my, xs, ys);
    onDocChange({ ...doc, selEnd: clamp(ind, 0, text?.length) });
  };

  const onWheel = e => {
    const newScrollY = Math.max(0, scrollY + e?.nativeEvent?.deltaY * SF);
    setScrollY(newScrollY);

    // Clear existing snap timeout
    if (scrollSnapTimeoutRef.current) {
      clearTimeout(scrollSnapTimeoutRef.current);
    }

    // Set timeout to snap to nearest page after scrolling stops
    scrollSnapTimeoutRef.current = setTimeout(() => {
      const pageWithGap = PAGE_HEIGHT + PAGE_GAP;
      // Calculate which page top is nearest to current scroll position
      const currentPage = Math.round((newScrollY - topMargin) / pageWithGap);
      const pageSnapY = topMargin + currentPage * pageWithGap;

      // Allow snapping to 0 (show top margin) or to page boundaries
      // Choose whichever is closer
      const distanceToZero = newScrollY; // distance from scrollY=0
      const distanceToPage = Math.abs(newScrollY - pageSnapY);

      let snapY;
      if (distanceToZero < distanceToPage && distanceToZero < 100 * SF) {
        snapY = 0;
      } else if (distanceToPage < 100 * SF && pageSnapY >= 0) {
        snapY = pageSnapY;
      } else {
        return; // Don't snap
      }

      if (snapY !== newScrollY) {
        setScrollY(snapY);
      }
    }, 150);
  };

  const handleContextMenu = e => {
    e.preventDefault();

    // Calculate click position in canvas coordinates
    const { offsetX, offsetY } = e?.nativeEvent ?? {};
    const clickX = offsetX * SF;
    const clickY = offsetY * SF + scrollY;

    // Use getCellAtClick to find the cell based on visual position
    const tableInfo = getCellAtClick(clickX, clickY, text, xs, ys);

    if (tableInfo) {
      // Print current table row and column information
      console.log('Table Info:', {
        rowIndex: tableInfo.rowIndex,
        columnIndex: tableInfo.columnIndex,
        numRows: tableInfo.numRows,
        numColumns: tableInfo.numColumns,
        tStartIndex: tableInfo.tStartIndex,
        tEndIndex: tableInfo.tEndIndex,
      });
      console.log(
        `Current position: Row ${tableInfo.rowIndex + 1}, Column ${tableInfo.columnIndex + 1} (out of ${tableInfo.numRows} rows, ${tableInfo.numColumns} columns)`,
      );

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          initialScrollY: scrollY,
          tableInfo,
        });
      }
    }
  };

  const handleCloseContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      tableInfo: null,
    });
  };

  const handleDeleteRow = () => {
    if (!contextMenu.tableInfo) {
      return;
    }
    const newDoc = deleteTableRow(doc, contextMenu.tableInfo);
    onDocChange(newDoc);
  };

  const handleAddRow = () => {
    if (!contextMenu.tableInfo) {
      return;
    }
    const newDoc = addTableRow(doc, contextMenu.tableInfo);
    onDocChange(newDoc);
  };

  const handleAddColumn = () => {
    if (!contextMenu.tableInfo) {
      return;
    }
    const newDoc = addTableColumn(doc, contextMenu.tableInfo);
    onDocChange(newDoc);
  };

  const handleDeleteColumn = () => {
    if (!contextMenu.tableInfo) {
      return;
    }
    const newDoc = deleteTableColumn(doc, contextMenu.tableInfo);
    onDocChange(newDoc);
  };

  const handleDeleteTable = () => {
    if (!contextMenu.tableInfo) {
      return;
    }
    const newDoc = deleteTable(doc, contextMenu.tableInfo);
    onDocChange(newDoc);
  };

  return (
    <Container ref={containerRef} className={className} onMouseLeave={() => setIsFocussed(false)}>
      <Canvas
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onContextMenu={handleContextMenu}
        ref={canvasRef}
      />
      {selectedImageIndex !== null && (
        <ImageResizeOverlay
          imageIndex={selectedImageIndex}
          imageStyle={styles?.[selectedImageIndex]}
          canvasRef={canvasRef}
          xs={xs}
          ys={ys}
          scrollY={scrollY}
          topMargin={topMargin}
          onResizeComplete={handleImageResizeComplete}
          onDelete={handleImageDelete}
          onWrapChange={handleImageWrapChange}
          onMove={handleImageMove}
        />
      )}
      <TableContextMenu
        ref={contextMenuRef}
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        tableInfo={contextMenu.tableInfo}
        onClose={handleCloseContextMenu}
        onDeleteRow={handleDeleteRow}
        onDeleteColumn={handleDeleteColumn}
        onAddRow={handleAddRow}
        onAddColumn={handleAddColumn}
        onDeleteTable={handleDeleteTable}
      />
    </Container>
  );
};

export default DocArea;
