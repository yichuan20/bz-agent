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
const getNextPosition = ({ x, y, text, i, ctx, tableState = null, styles = [], topMargin = 0 }) => {
  const char = text[i];
  const style = styles[i];
  const charWidth = ctx.measureText(char).width;

  // handle table
  if (TABLE_CHARS.includes(char)) {
    return getTableCharPosition({ x, y, i, text, tableState, topMargin });
  }

  let endX = END_X;
  let startX = START_X;
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

    y += LINE_HEIGHT;
    x = START_X + (styleToUse?.indent || 100);
    return { x, y, tableState };
  }

  const shouldStartNewLine = char === '\n' || isWordOverlappingEnd({ x, text, i, ctx, endX });
  if (shouldStartNewLine) {
    y += LINE_HEIGHT;
    x = startX;
    return { x, y, tableState };
  }

  x += charWidth;
  return { x, y, tableState };
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

  const startI = getStartI({ scrollY, ys: newYs, text, topMargin });

  // step 1: only calculate the coordinates and line height, not drawing
  let i = clamp(startI, 0, text.length);
  let x = newXs[i];
  let y = newYs[i];
  let tableState = null;

  let lineStartIndex = i;
  while (lineStartIndex > 0 && Math.abs(newYs[lineStartIndex - 1] - newYs[i]) < 0.1) {
    lineStartIndex--;
  }
  let lastY = newYs[i];

  while (i < text.length && i >= 0) {
    if (Math.abs(y - lastY) > 0.1) {
      lineStartIndex = i;
      lastY = y;
    }

    // Set font for measureText
    ctx.font = `${FONT_SIZE * SF}px Arial`;
    if (styles?.[i]?.fontSize) ctx.font = `${styles[i]?.fontSize * SF}px Arial`;
    if (styles?.[i]?.isBold) ctx.font = `bold ${ctx?.font}`;
    if (styles?.[i]?.isItalic) ctx.font = `italic ${ctx?.font}`;

    const spacePadding = 4 * SF;
    let currentX = x;

    if (i === 0 && styles?.[i]?.indent > 0) {
      currentX = START_X + styles?.[i]?.indent;
    }

    if (styles[i]?.imageUrl) {
      const imgWidth = (styles[i].imageWidth || 64) * SF;
      const imgHeight = (styles[i].imageHeight || 64) * SF;
      const vPadding = 8 * SF;
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

      newXs[i] = currentX + spacePadding;
      newYs[i] = y;

      x = currentX + imgWidth + spacePadding * 2;
      i++;
      continue;
    }

    newXs[i] = currentX;
    newYs[i] = y;

    const nextPos = getNextPosition({
      x: currentX,
      y,
      tableState,
      text,
      i,
      ctx,
      styles,
      topMargin,
    });

    x = nextPos.x;
    y = nextPos.y;
    tableState = nextPos.tableState;

    // Convert content Y to canvas Y for visibility check
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

  // Calculate number of pages needed based on max Y position
  const maxY = Math.max(...newYs.filter(y => y !== undefined), y);
  const contentHeight = maxY - topMargin - PAGE_MARGIN_TOP;
  const numPages = Math.max(1, Math.ceil(contentHeight / PAGE_CONTENT_HEIGHT) + 1);

  // Draw page backgrounds BEFORE drawing content
  drawPageSetup({ ctx, topMargin, scrollY, numPages, headerText, footerText, gapColor });

  // step 2: draw the document
  i = clamp(startI, 0, text.length);

  while (i < newXs.length && i < text.length) {
    x = newXs[i];
    y = newYs[i];
    // Convert content Y to canvas Y (with page gaps) for drawing
    const drawY = contentYToDrawY(y, topMargin) - scrollY;

    ctx.font = `${FONT_SIZE * SF}px Arial`;
    ctx.fillStyle = 'black';
    if (styles?.[i]?.bgColor) {
      drawBgBox({ x, y: drawY, ctx, char: text[i], bgColor: styles[i].bgColor });
    }
    if (styles?.[i]?.textColor) ctx.fillStyle = styles[i].textColor;
    if (styles?.[i]?.fontSize) ctx.font = `${styles[i]?.fontSize * SF}px Arial`;
    if (styles?.[i]?.isBold) ctx.font = `bold ${ctx?.font}`;
    if (styles?.[i]?.isItalic) ctx.font = `italic ${ctx?.font}`;
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

      // Draw caret before image if cursor is at image position (but not when caret should be hidden)
      if (i === selStart && i === selEnd && hideCaretAtIndex !== i && caretVisible) {
        drawCaret({ x, y: drawY, ctx });
      }

      if (!failedImageUrls.has(imageUrl)) {
        if (imageCache.has(imageUrl)) {
          const img = imageCache.get(imageUrl);
          if (img.complete && img.naturalHeight !== 0) {
            try {
              ctx.drawImage(img, x, drawY - imgHeight, imgWidth, imgHeight);
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
    // Use newYs[text.length] for correct y position after newlines
    const caretY = newYs[text.length] !== undefined ? newYs[text.length] : y;
    const caretDrawY = contentYToDrawY(caretY, topMargin) - scrollY;
    drawCaret({ x: newXs[text.length] || x, y: caretDrawY, ctx });
  }

  return [newXs, newYs];
};
