import {
  T_START,
  R_START,
  C_START,
  T_END,
  START_X,
  END_X,
  LINE_HEIGHT,
  PAD,
  PAGE_CONTENT_HEIGHT,
  PAGE_MARGIN_TOP,
  PAGE_MARGIN_BOTTOM,
  PAGE_HEIGHT,
  PAGE_GAP,
} from './word-constants';
import { contentYToDrawY } from './word-render-utils';

/**
 * Gets the position after a table control character
 * @param {number} topMargin - Top margin for page break calculations
 */
export const getTableCharPosition = ({ text, i, x, y, tableState, topMargin = 0 }) => {
  const char = text[i];

  if (tableState?.maxRowY) {
    tableState.maxRowY = Math.max(tableState.maxRowY, y);
  }

  if (char === T_START) {
    const numColumns = getNumberOfColumns({ text, tStartI: i });
    tableState = {
      columnIndex: -1,
      columnWidth: (END_X - START_X) / numColumns,
      maxRowY: y,
      rowStartY: y,
    };
    x = START_X;
  }

  if (char === T_END) {
    y = tableState?.maxRowY + LINE_HEIGHT;
    x = START_X;
    tableState = null;
  }

  if (char === R_START) {
    tableState.columnIndex = -1;
    let newRowY = tableState.maxRowY + LINE_HEIGHT;

    // Check if new row would be too close to page boundary
    // Push to next page if less than 2 lines remaining
    const firstPageContentStart = topMargin + PAGE_MARGIN_TOP;
    const relativeY = newRowY - firstPageContentStart;
    if (relativeY > 0) {
      const positionInPage = relativeY % PAGE_CONTENT_HEIGHT;
      const remainingOnPage = PAGE_CONTENT_HEIGHT - positionInPage;

      // If less than 2 lines worth of space, push to next page
      const minRowSpace = LINE_HEIGHT * 2;
      if (remainingOnPage < minRowSpace && remainingOnPage > 0) {
        newRowY += remainingOnPage;
        // Add top padding so table border doesn't overlap with page header
        // Border is drawn at (rowY - LINE_HEIGHT + PAD), so add LINE_HEIGHT to give room
        newRowY += LINE_HEIGHT;
      }
    }

    tableState.rowStartY = newRowY;
    tableState.maxRowY = newRowY;
    x = START_X;
    y = newRowY;
  }

  if (char === C_START) {
    tableState.columnIndex += 1;

    x = START_X + tableState.columnIndex * tableState.columnWidth + PAD;
    y = tableState.rowStartY;
  }

  return { x, y, tableState };
};

/**
 * Gets the starting index for rendering based on scroll position
 * @param {number} scrollY - Current scroll position (canvas space)
 * @param {number[]} ys - Y coordinates array (content space)
 * @param {string} text - Document text
 * @param {number} topMargin - Top margin before first page (for coordinate conversion)
 */
export const getStartI = ({ scrollY, ys = [], text, topMargin = 0 }) => {
  let i = 0;
  let tableStart = 0;
  let inTable = false;

  while (i < ys.length) {
    if (text?.[i] === T_START) {
      tableStart = i;
      inTable = true;
    }
    if (text?.[i] === T_END) {
      inTable = false;
    }

    const drawY = contentYToDrawY(ys[i], topMargin);
    if (drawY - scrollY > 0) {
      break;
    }

    i++;
  }

  // paint whole table, to avoid layout issues
  return inTable ? tableStart : i;
};

/**
 * Gets the number of columns in a table
 */
export const getNumberOfColumns = ({ text, tStartI }) => {
  let i = tStartI + 2;
  let numColumns = 0;

  while (text?.[i] !== R_START) {
    if (text?.[i] === C_START) {
      numColumns++;
    }

    if (text?.[i] === T_END || i >= text?.length) {
      break;
    }

    i++;
  }

  return numColumns;
};

/**
 * Gets the number of rows in a table
 */
export const getNumberOfRows = ({ text, tStartI }) => {
  let i = tStartI + 2;
  let numRows = 1;

  while (text?.[i] !== T_END && i < text?.length) {
    if (text?.[i] === R_START) {
      numRows++;
    }
    i++;
  }

  return numRows;
};

/**
 * Gets the page number for an absolute canvas Y position
 */
const getPageNum = (absY, topMargin) => {
  if (absY < topMargin) return 0;
  const pageWithGap = PAGE_HEIGHT + PAGE_GAP;
  return Math.floor((absY - topMargin) / pageWithGap);
};

/**
 * Gets the content area top Y of a page in absolute canvas coordinates
 * (accounts for page margin - content starts below the header area)
 */
const getPageContentTop = (pageNum, topMargin) => {
  return topMargin + pageNum * (PAGE_HEIGHT + PAGE_GAP) + PAGE_MARGIN_TOP;
};

/**
 * Gets the content area bottom Y of a page in absolute canvas coordinates
 * (accounts for page margin - content ends above the footer area)
 */
const getPageContentBottom = (pageNum, topMargin) => {
  return topMargin + pageNum * (PAGE_HEIGHT + PAGE_GAP) + PAGE_HEIGHT - PAGE_MARGIN_BOTTOM;
};

/**
 * Collects row information from a table
 * Returns array of { startY, endY } for each row (in absolute draw coordinates)
 */
const collectRowInfo = ({ text, ys, tStartI, topMargin }) => {
  const rows = [];
  let i = tStartI;
  let currentRowStartY = null;
  let currentRowMaxY = null;

  while (i < text.length && text[i] !== T_END) {
    if (text[i] === R_START) {
      // Save previous row with its actual content extent
      if (currentRowStartY !== null) {
        rows.push({ startY: currentRowStartY, endY: currentRowMaxY });
      }
      currentRowStartY = null;
      currentRowMaxY = null;
    }

    if (text[i] === C_START) {
      const cellY = contentYToDrawY(ys[i], topMargin);
      // First C_START in row sets the row start position
      if (currentRowStartY === null) {
        currentRowStartY = cellY;
        currentRowMaxY = cellY;
      }
    }

    // Track the max Y of every actual cell character (not table control chars).
    // This gives the real row height including wrapped lines.
    if (
      currentRowStartY !== null &&
      ys[i] !== undefined &&
      text[i] !== T_START && text[i] !== T_END &&
      text[i] !== R_START && text[i] !== C_START
    ) {
      const charDrawY = contentYToDrawY(ys[i], topMargin);
      if (charDrawY > currentRowMaxY) currentRowMaxY = charDrawY;
    }

    i++;
  }

  // Save last row
  if (currentRowStartY !== null) {
    if (text[i] === T_END) {
      const endY = contentYToDrawY(ys[i], topMargin);
      currentRowMaxY = Math.max(currentRowMaxY, endY);
    }
    rows.push({ startY: currentRowStartY, endY: currentRowMaxY });
  }

  return rows;
};

/**
 * Draws a complete table section border (rectangle with column dividers)
 */
const drawTableSection = (ctx, topY, bottomY, numColumns, scrollY) => {
  const screenTop = topY - scrollY;
  const screenBottom = bottomY - scrollY;

  // Draw outer rectangle
  ctx.moveTo(START_X, screenTop);
  ctx.lineTo(END_X, screenTop);
  ctx.lineTo(END_X, screenBottom);
  ctx.lineTo(START_X, screenBottom);
  ctx.lineTo(START_X, screenTop);

  // Draw column dividers
  const columnWidth = (END_X - START_X) / numColumns;
  for (let col = 1; col < numColumns; col++) {
    const lineX = START_X + columnWidth * col;
    ctx.moveTo(lineX, screenTop);
    ctx.lineTo(lineX, screenBottom);
  }
};

/**
 * Draws table grid lines on the canvas
 * Uses a page-aware approach: identifies page boundaries within tables
 * and draws complete borders for each page section
 * @param {number} topMargin - Top margin for coordinate conversion
 */
export const drawTableLines = ({ ctx, ys = [], text, startI, endI, scrollY, topMargin = 0 }) => {
  let i = startI;
  ctx.lineWidth = 1;
  ctx.beginPath();

  while (i < endI) {
    if (text?.[i] === T_START) {
      const tStartI = i;
      const numColumns = getNumberOfColumns({ text, tStartI });

      // Find T_END
      let tEndI = i;
      while (tEndI < text.length && text[tEndI] !== T_END) tEndI++;

      // Collect row information
      const rows = collectRowInfo({ text, ys, tStartI, topMargin });

      if (rows.length === 0) {
        i++;
        continue;
      }

      // Get table bounds (with padding)
      const tableTop = rows[0].startY - LINE_HEIGHT + PAD;
      const tableBottom = rows[rows.length - 1].endY + PAD;

      // Determine which pages the table spans
      const startPage = getPageNum(tableTop, topMargin);
      const endPage = getPageNum(tableBottom, topMargin);

      // Draw borders for each page section
      for (let page = startPage; page <= endPage; page++) {
        // Page white-area bounds (includes margins) — borders may draw in the margin area
        const pageStart = topMargin + page * (PAGE_HEIGHT + PAGE_GAP);
        const pageEnd   = pageStart + PAGE_HEIGHT;
        // Content area bounds — used for row filtering and row-separator clamping
        const pageContentTop    = getPageContentTop(page, topMargin);
        const pageContentBottom = getPageContentBottom(page, topMargin);

        // Find rows that are on this page (within content area)
        const rowsOnPage = rows.filter(row => {
          const rowTop    = row.startY - LINE_HEIGHT + PAD;
          const rowBottom = row.endY + PAD;
          return rowBottom > pageContentTop && rowTop < pageContentBottom;
        });

        if (rowsOnPage.length === 0) continue;

        // Section bounds clamped to the white-page area (not the content area) so
        // top/bottom borders can sit in the margin while never bleeding into the gap.
        const firstRowOnPage = rowsOnPage[0];
        const lastRowOnPage  = rowsOnPage[rowsOnPage.length - 1];
        const sectionTop    = Math.max(firstRowOnPage.startY - LINE_HEIGHT + PAD, pageStart);
        const sectionBottom = Math.min(lastRowOnPage.endY + PAD, pageEnd);

        if (sectionBottom <= sectionTop) continue;

        // Draw complete border for this section
        drawTableSection(ctx, sectionTop, sectionBottom, numColumns, scrollY);

        // Draw row separator lines for rows on this page
        for (let r = 1; r < rowsOnPage.length; r++) {
          const rowLineY = rowsOnPage[r].startY - LINE_HEIGHT + PAD;
          // Only draw if line is within this page's content area
          if (rowLineY > pageContentTop && rowLineY < pageContentBottom) {
            const screenY = rowLineY - scrollY;
            ctx.moveTo(START_X, screenY);
            ctx.lineTo(END_X, screenY);
          }
        }
      }

      // Skip to T_END
      i = tEndI;
    }

    i++;
  }

  ctx.stroke();
};

// Row boundary helpers for deletion

/**
 * Find the row boundaries for deletion
 */
export const getRowBoundaries = (text, position) => {
  // Find R_START before current position
  let rowStart = position;
  while (rowStart > 0 && text[rowStart] !== R_START) {
    rowStart--;
  }

  // Find row end (next R_START or T_END)
  let rowEnd = position;
  while (rowEnd < text.length) {
    if (text[rowEnd] === R_START && rowEnd > rowStart) {
      break;
    }
    if (text[rowEnd] === T_END) {
      break;
    }
    rowEnd++;
  }

  return { rowStart, rowEnd };
};

/**
 * Check if cursor is at the first cell of a row (right after R_START C_START)
 */
export const isAtRowFirstCellStart = (text, position) => {
  // Check if previous chars are C_START and R_START
  if (position < 2) return false;
  return text[position - 1] === C_START && text[position - 2] === R_START;
};

/**
 * Count number of rows in a table
 */
export const countTableRows = (text, tStartIndex) => {
  let count = 0;
  let i = tStartIndex;
  while (i < text.length && text[i] !== T_END) {
    if (text[i] === R_START) {
      count++;
    }
    i++;
  }
  return count;
};

/**
 * Find T_START index for current table
 */
export const findTableStart = (text, position) => {
  let i = position;
  while (i >= 0) {
    if (text[i] === T_START) {
      return i;
    }
    i--;
  }
  return -1;
};

/**
 * Find T_END index for current table
 */
export const findTableEnd = (text, position) => {
  let i = position;
  while (i < text.length) {
    if (text[i] === T_END) {
      return i;
    }
    i++;
  }
  return -1;
};
