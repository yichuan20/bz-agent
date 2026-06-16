import { clamp, cloneDeep } from 'lodash';
import { useEffect, useRef, useState } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import {
  addMultiClickSelection,
  ARROW_KEYS,
  deleteText,
  drawDoc,
  EMPTY_DOC,
  getNearestCharIndexFromEvent,
  getStartEnd,
  insertText,
  moveCaret,
  setImageLoadCallback,
  SF,
  VIEW_W,
  PAGE_HEIGHT,
  PAGE_GAP,
  deleteTableRow,
  addTableRow,
  addTableColumn,
  deleteTableColumn,
  deleteTable,
  R_START,
  C_START,
  T_END,
} from '../utils/word-utils-refactor';
import { getCellAtClick } from '../utils/table-utils';
import ImageResizeOverlay from './ImageResizeOverlay';
import TableContextMenu from './TableContextMenu';

const Container = ({ children, ...props }) => <div style={{overflow:'auto',overscrollBehavior:'none',height:'100%',width:'100%',background:'var(--bg-tertiary,#e8e8e8)',position:'relative',display:'grid',justifyContent:'center'}} {...props}>{children}</div>;

const Canvas = (props) => <canvas style={{height:'100%',width:VIEW_W,marginTop:0,border:'none'}} {...props} />;

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
  const [isFocussed, setIsFocussed] = useState(false);
  const [imageLoadTrigger, setImageLoadTrigger] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    tableInfo: null,
  });
  const [caretVisible, setCaretVisible] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

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

  // init: size
  useEffect(() => {
    initCanvasSize(canvasRef);
  }, [canvasRef]);

  // Listen for theme changes to re-render canvas
  useEffect(() => {
    const handleStorage = e => {
      if (e.key === 'theme') {
        setTheme(e.newValue || 'dark');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
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
  }, [selStart, selEnd, text?.length, styles?.length, isFocussed, selectedImageIndex]);

  // redrawing loop
  useEffect(() => {
    const ctx = canvasRef?.current?.getContext('2d');
    const gapColor = containerRef?.current
      ? getComputedStyle(containerRef.current).getPropertyValue('--bg-tertiary').trim() || '#e8e8e8'
      : '#e8e8e8';
    const [newXs, newYs] = drawDoc({ ctx, doc, scrollY, xs, ys, topMargin, hideCaretAtIndex: selectedImageIndex, caretVisible, gapColor });
    setXs(newXs || []);
    setYs(newYs || []);
  }, [
    text?.length,
    styles,
    selStart,
    selEnd,
    canvasRef,
    scrollY,
    null,
    imageLoadTrigger,
    selectedImageIndex,
    caretVisible,
    theme,
  ]);

  const onMouseDown = e => {
    e.preventDefault();
    document.activeElement.blur();

    const ind = getNearestCharIndexFromEvent(e, scrollY, xs, ys, text, topMargin);
    let clampedInd = clamp(ind, 0, text?.length);
    const clickX = e.nativeEvent.offsetX * SF;
    const clickY = e.nativeEvent.offsetY * SF + scrollY;

    // TABLE CLICK OVERRIDE: if the click landed visually inside a table cell,
    // always place the cursor inside that exact cell regardless of what
    // getNearestCharIndex computed (it can drift to adjacent cells/rows/lines).
    const clickedCell = getCellAtClick(clickX, clickY, text, xs, ys);
    if (clickedCell) {
      const { tStartIndex, tEndIndex, rowIndex, columnIndex } = clickedCell;

      // Locate [cellStart, cellEnd) for the clicked cell
      // cellStart = index of this cell's C_START
      // cellEnd   = index of the next separator (C_START / R_START / T_END)
      let row = -1, col = -1, cellStart = -1, cellEnd = tEndIndex + 1;
      for (let k = tStartIndex; k <= tEndIndex; k++) {
        if (text[k] === R_START) { row++; col = -1; }
        else if (text[k] === C_START) {
          col++;
          if (row === rowIndex && col === columnIndex) {
            cellStart = k;
            let sep = k + 1;
            while (sep <= tEndIndex &&
                   text[sep] !== C_START &&
                   text[sep] !== R_START &&
                   text[sep] !== T_END) sep++;
            cellEnd = sep;
            break;
          }
        }
      }

      if (cellStart >= 0) {
        const contentStart = cellStart + 1; // first typeable position in cell
        const contentEnd   = cellEnd;       // exclusive (= the separator char)

        if (contentStart >= contentEnd) {
          // Empty cell — cursor goes to contentStart (= separator), user types here
          clampedInd = contentStart;
        } else {
          // Find the content char whose x is closest to clickX
          let bestIdx  = contentStart;
          let bestDist = Infinity;
          for (let k = contentStart; k < contentEnd; k++) {
            const d = Math.abs((xs[k] || 0) - clickX);
            if (d < bestDist) { bestDist = d; bestIdx = k; }
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
    let newDoc = { ...doc, selStart: clampedInd, selEnd: clampedInd };
    newDoc = addMultiClickSelection(newDoc, e);

    onDocChange(newDoc);

    if (e.detail === 1 && styles?.[clampedInd]?.url) {
      setIsMouseDown(false);
      window.open(styles[clampedInd].url, '_blank');
    }
  };

  const handleImageResizeComplete = ({ width, height }) => {
    if (selectedImageIndex === null) {
      return;
    }

    const newDoc = cloneDeep(doc);
    const imageStyle = newDoc.styles[selectedImageIndex];
    if (imageStyle?.imageUrl) {
      newDoc.styles[selectedImageIndex] = {
        ...imageStyle,
        imageWidth: width,
        imageHeight: height,
      };
      onDocChange(newDoc);
    }
  };

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

  const onMouseUp = () => {
    setIsMouseDown(false);
  };

  const onMouseMove = e => {
    if (!isMouseDown) {
      return;
    }
    const ind = getNearestCharIndexFromEvent(e, scrollY, xs, ys, text, topMargin);
    onDocChange({ ...doc, selEnd: ind });
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
      console.log(`Current position: Row ${tableInfo.rowIndex + 1}, Column ${tableInfo.columnIndex + 1} (out of ${tableInfo.numRows} rows, ${tableInfo.numColumns} columns)`);

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

  const onKeyDown = e => {
    const hasSelection = doc.selStart !== doc.selEnd || (doc.text?.length > 0 && doc.selStart !== undefined);
    const shouldHandleKey = isFocussed || (hasSelection && document?.activeElement?.tagName === 'BODY');

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
      if (e.key === 'ArrowRight' &&
          currentIndex >= 0 &&
          currentIndex < styles?.length &&
          styles[currentIndex]?.imageUrl) {
        // Select the image instead of moving past it
        setSelectedImageIndex(currentIndex);
        setIsFocussed(true);
        return;
      }

      // Check if caret is after image and pressing ArrowLeft to select image
      if (e.key === 'ArrowLeft' &&
          currentIndex > 0 &&
          currentIndex <= styles?.length &&
          styles[currentIndex - 1]?.imageUrl) {
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

    if (e.key === 'Backspace') {
      const newDoc = deleteText({ doc });
      onDocChange(newDoc);
      return;
    }
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
