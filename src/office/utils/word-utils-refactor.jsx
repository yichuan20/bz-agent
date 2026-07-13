import { clamp } from 'lodash';

// Import constants
import {
  VIEW_W,
  VIEW_H,
  SF,
  FONT_SIZE,
  LINE_HEIGHT,
  START_X,
  START_Y,
  END_X,
  PAD,
  TABLE_CHARS,
  T_START,
  R_START,
  C_START,
  T_END,
  EMPTY_DOC,
  ARROW_KEYS,
  TEXT_WITH_TABLE,
  PAGE_HEIGHT,
  PAGE_GAP,
  PAGE_MARGIN_TOP,
  PAGE_MARGIN_BOTTOM,
  PAGE_CONTENT_HEIGHT,
} from './word-constants';

// Import image utilities
import {
  imageCache,
  failedImageUrls,
  loadingImages,
  setImageLoadCallback,
  clearImageCache,
  getImageLoadCallback,
} from './word-image-utils';

// Import text analysis
import {
  isWordOverlappingEnd,
  isListParagraph,
  isIndentedParagraph,
  getPrevNewlineIndex,
  isNumberedStyle,
  getPrevNewlineIndexFromPosition,
} from './word-text-analysis';

// Import table utilities
import {
  getTableCharPosition,
  getStartI,
  getNumberOfColumns,
  getNumberOfRows,
  drawTableLines,
} from './word-table-utils';

// Import render utilities
import {
  drawCaret,
  drawSelectionBox,
  drawCharBox,
  drawQueryBox,
  drawBgBox,
  drawPageSetup,
  drawLine,
  drawPrefix,
  getPageFromContentY,
  contentYToCanvasY,
} from './word-render-utils';

// Import mutation utilities
import {
  insertText,
  deleteText,
  moveCaret,
  safeCaret,
  scanAndRenumber,
} from './word-mutation';

// Import selection utilities
import {
  getNearestCharIndexFromEvent,
  addMultiClickSelection,
  getStartEnd,
} from './word-selection';

// Re-export everything for backward compatibility
export {
  // Constants
  VIEW_W,
  SF,
  FONT_SIZE,
  START_X,
  START_Y,
  END_X,
  T_START,
  R_START,
  C_START,
  T_END,
  TABLE_CHARS,
  ARROW_KEYS,
  TEXT_WITH_TABLE,
  EMPTY_DOC,
  PAGE_HEIGHT,
  PAGE_GAP,

  // Image utilities
  setImageLoadCallback,
  clearImageCache,

  // Text analysis
  isListParagraph,
  isIndentedParagraph,
  getPrevNewlineIndex,
  isNumberedStyle,
  getPrevNewlineIndexFromPosition,

  // Table utilities
  getNumberOfColumns,
  getNumberOfRows,

  // Mutation
  insertText,
  deleteText,
  moveCaret,
  safeCaret,
  scanAndRenumber,

  // Selection
  getNearestCharIndexFromEvent,
  addMultiClickSelection,
  getStartEnd,
};

// Re-export table utility functions from table-utils.jsx
export {
  parseTableTo2DArray,
  getTableInfo,
  deleteTableRow,
  addTableRow,
  addTableColumn,
  deleteTableColumn,
  deleteTable,
} from './table-utils';

/**
 * Convert content Y (continuous space) to canvas Y (with page gaps)
 * This is used when drawing to account for visual page separations
 * @param {number} contentY - Y position in continuous content space
 * @param {number} topMargin - Top margin before first page
 * @returns {number} - Y position on canvas with page gaps included
 */
const contentYToDrawY = (contentY, topMargin) => {
  // Calculate which page this Y falls on
  const firstPageContentStart = topMargin + PAGE_MARGIN_TOP;
  const relativeY = contentY - firstPageContentStart;

  if (relativeY < 0) return contentY;

  const pageNum = Math.floor(relativeY / PAGE_CONTENT_HEIGHT);
  const yWithinPage = relativeY % PAGE_CONTENT_HEIGHT;

  // New Y = page start + margin + position within page
  // Page start includes all previous pages plus their gaps
  const pageStartY = topMargin + (pageNum * (PAGE_HEIGHT + PAGE_GAP));
  return pageStartY + PAGE_MARGIN_TOP + yWithinPage;
};

/**
 * Calculates the next position after processing a character
 * Note: Positions are stored in "content space" (continuous Y coordinates)
 * Page gaps are only added when drawing
 */
const getNextPosition = ({ x, y, text, i, ctx, tableState = null, styles = [], topMargin = 0, lineSpacing = 1, effectiveEndX = END_X, effectiveStartX = START_X }) => {
  const char = text[i];
  const style = styles[i];
  const charWidth = ctx.measureText(char).width;
  const lh = LINE_HEIGHT * lineSpacing;

  // handle table
  if (TABLE_CHARS.includes(char)) {
    return getTableCharPosition({ x, y, i, text, tableState, topMargin });
  }

  let endX = effectiveEndX;
  let startX = effectiveStartX;
  if (tableState) {
    endX = START_X + tableState.columnWidth * (tableState.columnIndex + 1) - PAD;
    startX = START_X + tableState.columnWidth * tableState.columnIndex + PAD;
  }

  // TODO: clean up logic for starting new line
  const indentedStyle = isIndentedParagraph({ text, styles, i: i + 1 });
  const isListOrIndented = isListParagraph({ styles, text, i }) || indentedStyle;
  let shouldStartNewIndentedLine =
    style?.indent > 0 || (isWordOverlappingEnd({ x, text, i, ctx, endX }) && isListOrIndented);

  // first line indent handled in drawDoc
  if (i === 0) {
    shouldStartNewIndentedLine = false;
  }

  if (shouldStartNewIndentedLine) {
    let styleToUse = style;
    if (indentedStyle) {
      styleToUse = indentedStyle;
    }

    y += lh;
    x = START_X + (styleToUse?.indent || 100);
    return { x, y, tableState };
  }

  const shouldStartNewLine = char === '\n' || isWordOverlappingEnd({ x, text, i, ctx, endX });
  if (shouldStartNewLine) {
    y += lh;
    x = startX;
    return { x, y, tableState };
  }

  x += charWidth;
  return { x, y, tableState };
};

/**
 * Set ctx.font from a character style object
 */
const setCtxFont = (ctx, style, defaultSize) => {
  const fs = ((style?.fontSize || defaultSize) * SF);
  const ff = style?.fontFamily || 'Arial';
  const fw = style?.isBold ? 'bold' : 'normal';
  const fi = style?.isItalic ? 'italic' : 'normal';
  ctx.font = `${fi} ${fw} ${fs}px '${ff}', sans-serif`;
};

/**
 * Adjust x positions in newXs for text alignment (center/right/justify).
 * Called after pass 1 so all positions are known.
 */
const adjustForAlignment = (newXs, newYs, text, styles, ctx) => {
  // Group non-control char indices by their y position (visual line)
  const linesByY = new Map();
  for (let j = 0; j < newXs.length && j < text.length; j++) {
    if (TABLE_CHARS.includes(text[j]) || text[j] === '\n') continue;
    const ly = newYs[j];
    if (ly === undefined) continue;
    if (!linesByY.has(ly)) linesByY.set(ly, []);
    linesByY.get(ly).push(j);
  }

  for (const [, indices] of linesByY) {
    if (!indices.length) continue;
    const firstI = indices[0];

    // Find alignment stored on the preceding \n (or at index 0 for first paragraph)
    let nlIdx = firstI - 1;
    while (nlIdx > 0 && text[nlIdx] !== '\n') nlIdx--;
    const paraStyle = nlIdx >= 0 ? (styles[nlIdx] || styles[0]) : styles[0];
    const alignment = paraStyle?.alignment;
    if (!alignment || alignment === 'left') continue;

    // Measure line width using the last character
    const lastI = indices[indices.length - 1];
    setCtxFont(ctx, styles[lastI], FONT_SIZE);
    const lastW = ctx.measureText(text[lastI]).width;
    const lineW = newXs[lastI] + lastW - newXs[firstI];
    const availW = END_X - START_X;

    let offset = 0;
    if (alignment === 'center') offset = Math.max(0, (availW - lineW) / 2);
    else if (alignment === 'right') offset = Math.max(0, availW - lineW);
    // justify: skip for now (requires word spacing adjustments)

    if (offset > 0) {
      for (const idx of indices) newXs[idx] += offset;
    }
  }
};

/**
 * Main document rendering function
 * Draws the document on a canvas context
 */
export const drawDoc = ({ doc, ctx, scrollY, xs = [], ys = [], topMargin = 0, hideCaretAtIndex = null, caretVisible = true, headerText = '', footerText = '', gapColor = '#e8e8e8' }) => {
  if (!ctx) {
    return [];
  }

  const { text, selStart, selEnd, styles } = doc || EMPTY_DOC;

  const selSmaller = Math.min(selStart, selEnd);
  const selBigger = Math.max(selStart, selEnd);

  let newXs = [...xs];
  let newYs = [...ys];

  newXs[0] = START_X;
  newYs[0] = START_Y + topMargin;

  // Pre-collect placed square-wrap images (those with explicit imagePlacedX/Y coordinates).
  // These define "occupied zones" that text must flow around.
  const GAP = 8 * SF; // padding between text and image edge
  const occupiedZones = [];
  for (let si = 0; si < (styles?.length || 0); si++) {
    const s = styles?.[si];
    if (s?.imageUrl && s?.imageWrap === 'square' && s.imagePlacedX != null && s.imagePlacedY != null) {
      // imagePlacedX/Y stored in CSS px; convert to canvas px for layout
      const px = s.imagePlacedX * SF;
      const py = s.imagePlacedY * SF;
      occupiedZones.push({
        left:   px,
        right:  px + (s.imageWidth  || 64) * SF,
        top:    py - (s.imageHeight || 64) * SF,
        bottom: py,
      });
    }
  }

  // For a line at content-space Y, return the effective [startX, endX] range after
  // accounting for any occupied zones that intersect the line.
  const getLineRange = (lineY) => {
    let lStartX = START_X, lEndX = END_X;
    const mid = (START_X + END_X) / 2;
    for (const z of occupiedZones) {
      if (lineY > z.top - LINE_HEIGHT && lineY <= z.bottom + LINE_HEIGHT) {
        if (z.left >= mid) {
          lEndX = Math.min(lEndX, z.left - GAP);
        } else {
          lStartX = Math.max(lStartX, z.right + GAP);
        }
      }
    }
    return { startX: lStartX, endX: lEndX };
  };

  const startI = getStartI({ scrollY, ys: newYs, text, topMargin });

  // step 1: only calculate the coordinates and line height, not drawing
  let i = clamp(startI, 0, text.length);

  const isFloatImage = (s) => s?.imageUrl && (s?.imageWrap === 'square' || s?.imageWrap === 'behind');

  // When startI is inside a float-image zone, text y depends on the paragraph above
  // the image — which may have scrolled off screen. Back up to before the image so
  // the layout re-derives the correct flow y from stored positions.
  const startY = newYs[i] ?? (START_Y + topMargin);
  const nearAnyZone = occupiedZones.some(z => startY > z.top - LINE_HEIGHT && startY <= z.bottom + LINE_HEIGHT);
  if (nearAnyZone || isFloatImage(styles?.[i])) {
    for (let k = i - 1; k >= Math.max(0, i - 2000); k--) {
      if (isFloatImage(styles?.[k])) { i = k; break; }
    }
  }

  // Step back past float-image chars (they store placed coords, not flow y).
  while (i > 0 && isFloatImage(styles?.[i])) i--;

  // Step back to line start so x initialises at the correct boundary.
  while (i > 0 && newYs[i - 1] !== undefined && Math.abs(newYs[i - 1] - newYs[i]) < 0.1) {
    i--;
  }

  let y = newYs[i] ?? (START_Y + topMargin);
  const { startX: _initStartX } = getLineRange(y);
  let x = _initStartX;
  let tableState = null;

  let lineStartIndex = i;
  let lastY = newYs[i];
  let currentLineSpacing = 1;

  while (i < text.length && i >= 0) {
    if (Math.abs(y - lastY) > 0.1) {
      lineStartIndex = i;
      lastY = y;
    }

    // Set font for measureText
    setCtxFont(ctx, styles?.[i], FONT_SIZE);

    const spacePadding = 4 * SF;
    let currentX = x;

    if (i === 0 && styles?.[i]?.indent > 0) {
      currentX = START_X + styles?.[i]?.indent;
    }

    if (styles[i]?.imageUrl) {
      const imgWidth  = (styles[i].imageWidth  || 64) * SF;
      const imgHeight = (styles[i].imageHeight || 64) * SF;
      const vPadding  = 8 * SF;
      const wrap = styles[i]?.imageWrap || 'inline';

      if (wrap === 'square') {
        // imagePlacedX/Y stored in CSS px; convert to canvas px for layout
        const rawPx = styles[i].imagePlacedX;
        const rawPy = styles[i].imagePlacedY;
        newXs[i] = rawPx != null ? rawPx * SF : (END_X - imgWidth - spacePadding * 2);
        newYs[i] = rawPy != null ? rawPy * SF : y;
        i++; continue;  // x does NOT advance — zero width in text flow
      }

      if (wrap === 'behind') {
        // Use stored coordinates if available (preserves position across wrap mode switches).
        // Fall back to current inline flow position for a freshly-placed behind image.
        const rawPx = styles[i].imagePlacedX;
        const rawPy = styles[i].imagePlacedY;
        newXs[i] = rawPx != null ? rawPx * SF : currentX + spacePadding;
        newYs[i] = rawPy != null ? rawPy * SF : y;
        i++; continue;  // x does NOT advance
      }

      // 'inline' (default): expand line height to accommodate the image, advance x
      let prevLineY = START_Y + topMargin - LINE_HEIGHT;
      if (lineStartIndex > 0) {
        prevLineY = newYs[lineStartIndex - 1];
      }
      const currentGap = y - prevLineY;
      const effectiveGap = currentGap > 0.1 ? currentGap : LINE_HEIGHT;

      if (imgHeight + vPadding > effectiveGap + 0.1) {
        const diff = imgHeight + vPadding - effectiveGap;
        for (let k = lineStartIndex; k <= i; k++) {
          newYs[k] += diff;
        }
        y += diff;
        lastY += diff;
      }

      newXs[i] = currentX;  // store raw position; spacePadding applied at draw time only
      newYs[i] = y;
      x = currentX + imgWidth + spacePadding * 2;
      i++;
      continue;
    }

    newXs[i] = currentX;
    newYs[i] = y;

    const { startX: effStartX, endX: effEndX } = getLineRange(y);
    const nextPos = getNextPosition({
      x: currentX,
      y,
      tableState,
      text,
      i,
      ctx,
      styles,
      topMargin,
      lineSpacing: currentLineSpacing,
      effectiveEndX:   effEndX,
      effectiveStartX: effStartX,
    });

    const prevY = y;
    x = nextPos.x;
    y = nextPos.y;
    tableState = nextPos.tableState;

    // When a line break occurs, getNextPosition uses the OLD line's occupied-zone
    // range to set the new line's start x. This is wrong at zone boundaries (e.g.
    // transitioning from inside a square-wrap zone to below it). Re-derive x from
    // getLineRange for the NEW y so the first character on the new line is placed
    // at the correct left margin.
    if (!tableState && Math.abs(y - prevY) > 0.1) {
      const { startX: newLineStartX } = getLineRange(y);
      x = newLineStartX;
    }

    if (text[i] === '\n') {
      currentLineSpacing = styles[i]?.lineSpacing || 1;
    }

    const drawY = contentYToDrawY(y, topMargin);
    if (drawY - scrollY > VIEW_H * SF && !tableState && text?.[i] !== T_END) {
      newXs = newXs.slice(0, i + 1);
      newYs = newYs.slice(0, i + 1);
      break;
    }

    i++;
  }

  // Store position after last character for end-of-document caret
  if (i === text.length) {
    newXs[text.length] = x;
    newYs[text.length] = y;
  }

  // Pass 1.5b: Fix table rows that span page breaks.
  // After word-wrap is computed, any row whose content crosses a page boundary
  // is pushed entirely to the next page (same as Word's "keep rows together" behaviour).
  {
    const firstContentY = topMargin + PAGE_MARGIN_TOP;
    let ii = 0;
    while (ii < text.length) {
      if (text[ii] === T_START) {
        let jj = ii + 1;
        while (jj < text.length && text[jj] !== T_END) {
          if (text[jj] === R_START) {
            // Scan to the end of this row (next R_START or T_END)
            let kk = jj + 1;
            while (kk < text.length && text[kk] !== R_START && text[kk] !== T_END) {
              kk++;
            }
            const rowEnd = kk;

            // Find the row's starting Y (Y of first C_START) and its max content Y
            let rowStartY = null;
            let rowMaxY = -Infinity;
            for (let mm = jj; mm < rowEnd; mm++) {
              if (newYs[mm] !== undefined) {
                if (text[mm] === C_START && rowStartY === null) rowStartY = newYs[mm];
                if (newYs[mm] > rowMaxY) rowMaxY = newYs[mm];
              }
            }

            if (rowStartY !== null && isFinite(rowMaxY)) {
              const relStart = rowStartY - firstContentY;
              const relMax   = rowMaxY   - firstContentY;
              if (relStart >= 0 && relMax >= 0) {
                const startPage = Math.floor(relStart / PAGE_CONTENT_HEIGHT);
                const endPage   = Math.floor(relMax   / PAGE_CONTENT_HEIGHT);
                if (endPage > startPage) {
                  // Row crosses a page boundary — push it (and everything after) to next page
                  const nextPageStartY = firstContentY + endPage * PAGE_CONTENT_HEIGHT;
                  const shift = nextPageStartY - rowStartY;
                  for (let mm = jj; mm <= text.length; mm++) {
                    if (newYs[mm] !== undefined) newYs[mm] += shift;
                  }
                }
              }
            }

            jj = rowEnd;
          } else {
            jj++;
          }
        }
        ii = jj;
      }
      ii++;
    }
  }

  // Calculate number of pages needed based on max Y position
  const maxY = Math.max(...newYs.filter(y => y !== undefined), y);
  const contentHeight = maxY - topMargin - PAGE_MARGIN_TOP;
  const numPages = Math.max(1, Math.ceil(contentHeight / PAGE_CONTENT_HEIGHT) + 1);

  // Pass 1.5: adjust x positions for text alignment (center / right)
  adjustForAlignment(newXs, newYs, text, styles, ctx);

  // Draw page backgrounds BEFORE drawing content
  drawPageSetup({ ctx, topMargin, scrollY, numPages, headerText, footerText, gapColor });

  // Pre-draw: "behind text" images are drawn before text so text renders on top
  for (let bi = startI; bi < text.length && bi < newXs.length; bi++) {
    if (styles[bi]?.imageUrl && styles[bi]?.imageWrap === 'behind' && newXs[bi] != null && newYs[bi] != null) {
      const bx = newXs[bi];
      const by = newYs[bi];
      const bDrawY = contentYToDrawY(by, topMargin) - scrollY;
      const bImgW = (styles[bi].imageWidth  || 64) * SF;
      const bImgH = (styles[bi].imageHeight || 64) * SF;
      const bUrl  = styles[bi].imageUrl;
      if (!failedImageUrls.has(bUrl)) {
        if (imageCache.has(bUrl)) {
          const img = imageCache.get(bUrl);
          if (img.complete && img.naturalHeight !== 0) {
            try { ctx.drawImage(img, bx, bDrawY - bImgH, bImgW, bImgH); } catch (_) { /* ignore */ }
          }
        }
        // (loading initiated in the main draw pass below)
      }
    }
  }

  // step 2: draw the document (viewport-clipped — only paint visible chars)
  i = clamp(startI, 0, text.length);

  while (i < newXs.length && i < text.length) {
    x = newXs[i];
    y = newYs[i];
    // Convert content Y to canvas Y (with page gaps) for drawing
    const drawY = contentYToDrawY(y, topMargin) - scrollY;


    setCtxFont(ctx, styles?.[i], FONT_SIZE);
    ctx.fillStyle = 'black';
    if (styles?.[i]?.bgColor) {
      drawBgBox({ x, y: drawY, ctx, char: text[i], bgColor: styles[i].bgColor });
    }
    if (styles?.[i]?.textColor) ctx.fillStyle = styles[i].textColor;
    if (styles?.[i]?.url) ctx.fillStyle = 'blue';
    if (styles?.[i]?.isUnderlined) drawLine({ x, y: drawY, ctx, char: text[i], mode: 'underline' });
    if (styles?.[i]?.isStrikethrough) drawLine({ x, y: drawY, ctx, char: text[i], mode: 'strike' });
    // Draw prefix for first line (styles[0] has the prefix) or after newline (styles[i-1] has the prefix)
    // For first line: draw at i=0 using styles[0]
    // For other lines: only draw after newline character (text[i-1] === '\n')
    if (i === 0 && styles?.[0]?.prefix) {
      drawPrefix({ x: x - 50, y: drawY, ctx, style: styles[0] });
    } else if (text?.[i - 1] === '\n' && styles?.[i - 1]?.prefix) {
      drawPrefix({ x: x - 50, y: drawY, ctx, style: styles[i - 1] });
    }
    if (styles?.[i]?.queryId) drawQueryBox({ x, y: drawY, ctx, char: text[i], queryId: styles[i].queryId });

    if (styles[i]?.imageUrl) {
      const imageUrl = styles[i].imageUrl;
      const imgWidth = (styles[i].imageWidth || 64) * SF;
      const imgHeight = (styles[i].imageHeight || 64) * SF;

      // "behind" images were already painted in the pre-draw pass; skip here
      if (styles[i]?.imageWrap === 'behind') { i++; continue; }

      // Square-wrap images use their explicit placed coordinates for drawing
      if (styles[i]?.imageWrap === 'square') {
        const rawPx = styles[i].imagePlacedX;
        const rawPy = styles[i].imagePlacedY;
        if (rawPx != null && rawPy != null) {
          // imagePlacedX/Y in CSS px → canvas px
          const px = rawPx * SF;
          const py = rawPy * SF;
          const placedDrawY = contentYToDrawY(py, topMargin) - scrollY;
          if (!failedImageUrls.has(imageUrl) && imageCache.has(imageUrl)) {
            const img = imageCache.get(imageUrl);
            if (img.complete && img.naturalHeight !== 0) {
              try { ctx.drawImage(img, px, placedDrawY - imgHeight, imgWidth, imgHeight); }
              catch (e) { failedImageUrls.add(imageUrl); }
            }
          } else if (!failedImageUrls.has(imageUrl) && !loadingImages.has(imageUrl) && !imageCache.has(imageUrl)) {
            // kick off load (will re-render via callback)
            const img = new Image();
            img.crossOrigin = 'anonymous';
            loadingImages.set(imageUrl, img);
            const cb = getImageLoadCallback();
            img.onload = () => { imageCache.set(imageUrl, img); loadingImages.delete(imageUrl); cb?.(); };
            img.onerror = () => { failedImageUrls.add(imageUrl); loadingImages.delete(imageUrl); cb?.(); };
            img.src = imageUrl;
          }
          i++; continue;
        }
      }

      // Draw caret before image if cursor is at image position (but not when caret should be hidden)
      if (i === selStart && i === selEnd && hideCaretAtIndex !== i && caretVisible) {
        drawCaret({ x, y: drawY, ctx });
      }

      if (!failedImageUrls.has(imageUrl)) {
        if (imageCache.has(imageUrl)) {
          const img = imageCache.get(imageUrl);
          if (img.complete && img.naturalHeight !== 0) {
            try {
              ctx.drawImage(img, x + 4 * SF, drawY - imgHeight, imgWidth, imgHeight);
            } catch (error) {
              console.error('Error drawing image:', error);
              failedImageUrls.add(imageUrl);
              imageCache.delete(imageUrl);
            }
          }
        } else if (loadingImages.has(imageUrl)) {
          // Image is currently being loaded, skip to avoid duplicate requests
          // The callback will trigger a redraw when loading completes
        } else {
          // Create new Image object and start loading
          const img = new Image();
          img.crossOrigin = 'anonymous';
          loadingImages.set(imageUrl, img);

          const imageLoadCallback = getImageLoadCallback();
          img.onload = () => {
            imageCache.set(imageUrl, img);
            loadingImages.delete(imageUrl);
            if (imageLoadCallback) imageLoadCallback();
          };
          img.onerror = () => {
            failedImageUrls.add(imageUrl);
            imageCache.delete(imageUrl);
            loadingImages.delete(imageUrl);
            if (imageLoadCallback) imageLoadCallback();
          };
          try {
            img.src = imageUrl;
          } catch (error) {
            console.error('Error loading image:', error);
            failedImageUrls.add(imageUrl);
            loadingImages.delete(imageUrl);
          }
        }
      } else {
        // Draw placeholder for failed images
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(x, drawY - imgHeight, imgWidth, imgHeight);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, drawY - imgHeight, imgWidth, imgHeight);
        // Draw error indicator (X mark)
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        const centerX = x + imgWidth / 2;
        const centerY = drawY - imgHeight / 2;
        const markSize = Math.min(imgWidth, imgHeight) * 0.3;
        ctx.beginPath();
        ctx.moveTo(centerX - markSize / 2, centerY - markSize / 2);
        ctx.lineTo(centerX + markSize / 2, centerY + markSize / 2);
        ctx.moveTo(centerX + markSize / 2, centerY - markSize / 2);
        ctx.lineTo(centerX - markSize / 2, centerY + markSize / 2);
        ctx.stroke();
      }
      i++;
      continue;
    }

    const factChecking = window?.location?.href?.includes('factchecking=true');
    if (styles?.[i]?.metas && factChecking) {
      drawCharBox({ x, y: drawY, ctx, char: text[i], fill: '#00ff0022' });
    }

    if (i === selStart && i === selEnd && caretVisible) {
      drawCaret({ x, y: drawY, ctx });
    }

    if (i >= selSmaller && i < selBigger) {
      drawSelectionBox({ x, y: drawY, ctx, char: text[i] });
    }

    if (!TABLE_CHARS.includes(text[i]) && text[i] !== '\n') {
      ctx.fillText(text[i], x, drawY);
    }

    i++;
  }

  drawTableLines({ ctx, ys: newYs, text, startI, endI: i, scrollY, topMargin });

  if (selStart === selEnd && selStart === text.length && caretVisible) {
    const caretY = newYs[text.length] !== undefined ? newYs[text.length] : y;
    const caretDrawY = contentYToDrawY(caretY, topMargin) - scrollY;
    drawCaret({ x: newXs[text.length] || x, y: caretDrawY, ctx });
  }

  return [newXs, newYs];
};
