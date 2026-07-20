/* eslint-disable no-unused-vars */

import { isNil, range } from 'lodash';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSearchParamsState from '../hooks/useSearchParamsState';
import { COLORS } from '../utils/common';
import {
  CELL_PADDING,
  CONTROL_KEYS,
  FONT_SIZE_MULTIPLIER,
  SCROLL_X_SENSITIVITY,
  SCROLL_Y_SENSITIVITY,
  SF,
} from '../utils/excel-constants';
import {
  ALPHABET_EXTENDED,
  DEFAULT_CELL_HEIGHT,
  drawHorizontalLine,
  drawVerticalLine,
  getArrayOfCellLocationsFromSelection,
  getCellLocationFromOffset,
  getColumnX,
  getNearestBoundaryColumnIndex,
  getNearestBoundaryRowIndex,
  getResizedColumnGrid,
  getResizedRowGrid,
  getRowY,
  isCellIdWithinSelection,
  X_OFFSET,
  Y_OFFSET,
} from '../utils/excel-utils';
import ExcelTextInputWithFormulaDropdown, {
  getCellLocationToColorMap,
} from './ExcelTextInputWithFormulaDropdown';
import ExcelToolbar from './ExcelToolbar';
import {
  CellLocSpan,
  CellsContainer,
  Container,
  ExcelTextInputWithFormulaDropdownBorderLeft,
  FormulaBar,
  FormulaIconWrapper,
  FormulaInputWrapper,
  GridCanvas,
  IconContainer,
  OverlayCanvas,
  SrcTriggerContainer,
  StyledSearchInput,
  TopLeftCorner,
} from './ExcelViewSheetArea.styles';
import { FormulaIcon, PdfIcon } from './Icons';
import MSExcelFormulaBar from './MSExcelFormulaBar';
import SelectedImageContainer from './SelectedImageContainer';

/*

DRAWING CONVENTIONS

0,0 ---> x
|
|  canvas
↓
y

topY    * ------ *
        |        |
        | A CELL |
        |        |
bottomY * ------ *
      leftX     rightX



topY, bottomY, leftX, rightX are all in pixels

a row has an index 0, 1, 2, 3 ...    and topY and bottomY
a column has an index 0, 1, 2, 3 ... and leftX and rightX

*/

/**
 * Utility function to get CSS variable values for canvas rendering
 * Caches values for performance
 */
const cssVarCache = {};
const getCSSVar = varName => {
  if (cssVarCache[varName]) {
    return cssVarCache[varName];
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  cssVarCache[varName] = value;
  return value;
};

/**
 * Clear CSS variable cache (call when theme changes)
 */
const clearCSSVarCache = () => {
  Object.keys(cssVarCache).forEach(key => delete cssVarCache[key]);
};

/**
 * Split text into multiple lines based on max width
 */
const getWrappedLines = (ctx, text, maxWidth) => {
  if (!text) return [];
  const textStr = String(text);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < textStr.length; i++) {
    const char = textStr[i];
    const testLine = currentLine + char;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
};

/**
 * Calculate required height for wrapped text
 */
const calculateWrappedTextHeight = ({ ctx, text, maxWidth, fontSize }) => {
  if (!text) return fontSize * 1.3;

  const lineHeight = fontSize * 1.3;
  const lines = getWrappedLines(ctx, String(text), maxWidth);

  return lines.length * lineHeight;
};

/**
 * Calculate auto row height based on cell content for a specific row
 * Only calculates wrap text height for cells with wrap: true
 */
const calculateAutoRowHeight = ({ ctx, cells, grid, rowIndex, startCol, endCol }) => {
  let maxHeight = DEFAULT_CELL_HEIGHT * SF;

  for (let colIndex = startCol; colIndex < endCol; colIndex++) {
    const cellId = `${ALPHABET_EXTENDED[colIndex]}${rowIndex + 1}`;
    const cell = cells?.[cellId];

    if (!cell) continue;

    // Only calculate wrap height for cells with wrap enabled
    if (!cell?.wrapText) continue;

    const cellWidth = (grid?.columnIndexToWidth?.[colIndex] ?? 100) * SF;
    const availableWidth = cellWidth - CELL_PADDING * 2;
    const fontSize = (cell?.fontSize || 200) * SF * FONT_SIZE_MULTIPLIER;

    const fontStyle = cell?.fontItalic ? 'italic ' : '';
    const fontWeight = cell?.fontBold ? '600 ' : '';
    const fontFamily = cell?.fontFamily || 'Arial';
    ctx.font = `${fontStyle}${fontWeight}${fontSize}px "${fontFamily}"`;

    const cellValue = String(cell?.['f-value'] || cell?.value || '');
    const requiredHeight = calculateWrappedTextHeight({
      ctx,
      text: cellValue,
      maxWidth: availableWidth,
      fontSize,
    });

    maxHeight = Math.max(maxHeight, requiredHeight + CELL_PADDING * 4);
  }

  return maxHeight / SF;
};

/**
 * Recalculate row heights after column width change or content change
 * @param affectedColIndex - If provided, only check rows with content in this column; null means check all
 * @param calculatedRows - Set of row indices that have already been calculated (for caching)
 * @param onlyNewRows - If true, skip rows that are already in calculatedRows
 * @returns Updated grid if changes needed, otherwise original grid
 */
const recalculateRowHeightsForGrid = ({
  ctx,
  cells,
  grid,
  affectedColIndex = null,
  viewWindow = null,
  calculatedRows = null,
  onlyNewRows = false,
}) => {
  if (!cells || Object.keys(cells).length === 0) {
    return grid;
  }

  const updatedRowHeights = { ...grid?.rowIndexToHeight };
  let hasChanges = false;

  // Find affected rows
  const affectedRows = new Set();
  Object.keys(cells).forEach(cellId => {
    const rowIndex = parseInt(cellId.match(/\d+/)?.[0], 10) - 1;

    // If onlyNewRows is enabled, skip rows that have already been calculated
    if (onlyNewRows && calculatedRows?.has(rowIndex)) {
      return;
    }

    // If viewWindow is provided, only check visible rows
    if (viewWindow && (rowIndex < viewWindow.startRow || rowIndex >= viewWindow.endRow)) {
      return;
    }

    // If affectedColIndex is provided, only check rows with content in that column
    if (affectedColIndex !== null) {
      const colLetter = cellId.match(/[A-Z]+/)?.[0];
      const colIndex = ALPHABET_EXTENDED.indexOf(colLetter);
      if (colIndex !== affectedColIndex) return;
    }

    affectedRows.add(rowIndex);
  });

  if (affectedRows.size === 0) {
    return grid;
  }

  // Calculate max column index for height calculation
  const maxColIndex =
    Math.max(
      ...Object.keys(cells).map(id => ALPHABET_EXTENDED.indexOf(id.match(/[A-Z]+/)?.[0])),
      0,
    ) + 1;

  // Recalculate height for each affected row
  affectedRows.forEach(rowIndex => {
    const requiredHeight = calculateAutoRowHeight({
      ctx,
      cells,
      grid,
      rowIndex,
      startCol: 0,
      endCol: maxColIndex,
    });

    const currentHeight = grid?.rowIndexToHeight?.[rowIndex] ?? DEFAULT_CELL_HEIGHT;

    // Allow both increase and decrease, but ensure minimum height
    const newHeight = Math.max(requiredHeight, DEFAULT_CELL_HEIGHT);
    if (Math.abs(newHeight - currentHeight) > 1) {
      updatedRowHeights[rowIndex] = Math.ceil(newHeight);
      hasChanges = true;
    }
  });

  if (!hasChanges) {
    return grid;
  }

  return {
    ...grid,
    rowIndexToHeight: updatedRowHeights,
  };
};

const drawRowHeader = ({ ctx, rowIndToTopY, rowInd, selectedCellLocation }) => {
  const rectY = Y_OFFSET * SF + rowIndToTopY[rowInd] * SF;
  const rectWidth = X_OFFSET * SF;
  const rectHeight = (rowIndToTopY[rowInd + 1] - rowIndToTopY[rowInd]) * SF;
  if (rectHeight === 0) {
    return;
  }
  const selectedRow = selectedCellLocation?.match(/\d+/)?.[0] - 1;

  ctx.fillStyle = getCSSVar('--bg-tertiary');
  if (selectedRow === rowInd) {
    ctx.fillStyle = getCSSVar('--accent-blue-light');
  }
  ctx.fillRect(0, rectY, rectWidth, rectHeight);
  ctx.strokeStyle = getCSSVar('--border-default');
  ctx.strokeRect(0, rectY, rectWidth, rectHeight);

  ctx.font = '300 22px "Martian Mono", monospace';
  ctx.fillStyle = getCSSVar('--text-secondary');

  let rowText = `${rowInd + 1}`;
  if (rowText?.length === 1) {
    rowText = ` ${rowText}`;
  }

  const textX = X_OFFSET / 2 + 8;
  ctx.fillText(rowText, textX, Y_OFFSET * SF + rowIndToTopY[rowInd] * SF + 32);
};

const drawColHeader = ({ ctx, colIndToLeftX, colInd, selectedCellLocation }) => {
  const rectX = X_OFFSET * SF + colIndToLeftX[colInd] * SF;
  const rectWidth = (colIndToLeftX[colInd + 1] - colIndToLeftX[colInd]) * SF;
  if (rectWidth === 0) {
    return;
  }
  const rectHeight = Y_OFFSET * SF;
  const selectedCol = ALPHABET_EXTENDED.indexOf(selectedCellLocation?.match(/[A-Z]+/)?.[0]);

  ctx.fillStyle = getCSSVar('--bg-tertiary');
  if (selectedCol === colInd) {
    ctx.fillStyle = getCSSVar('--accent-blue-light');
  }
  ctx.fillRect(rectX, 0, rectWidth, rectHeight);
  ctx.strokeStyle = getCSSVar('--border-default');
  ctx.strokeRect(rectX, 0, rectWidth, rectHeight);

  ctx.font = '300 22px "Martian Mono", monospace';
  ctx.fillStyle = getCSSVar('--text-secondary');
  ctx.fillText(
    ALPHABET_EXTENDED[colInd],
    X_OFFSET * SF + colIndToLeftX[colInd] * SF + rectWidth / 2 - 14,
    32,
  );
};

/**
 * Format a raw cell value according to an Excel-style format string.
 * Covers all formats defined in DATA_TYPE_TO_DATA_FORMAT_STR plus generic fallback.
 */
const formatCellValue = (rawValue, dataFormatString) => {
  // No format / General / Text — display verbatim
  if (!dataFormatString || dataFormatString === 'General' || dataFormatString === '@') {
    return rawValue == null ? '' : String(rawValue);
  }

  const str = rawValue == null ? '' : String(rawValue);
  const num = parseFloat(str);
  const isNum = str !== '' && !Number.isNaN(num);

  // ── Percentage ───────────────────────────────────────────────────────────
  if (dataFormatString === '0%') {
    return isNum ? `${Math.round(num * 100)}%` : str;
  }
  if (dataFormatString === '0.00%') {
    return isNum ? `${(num * 100).toFixed(2)}%` : str;
  }

  // ── Currency / Accounting ─────────────────────────────────────────────────
  if (dataFormatString === '"$"#,##0') {
    if (!isNum) return str;
    const sign = num < 0 ? '-' : '';
    return `${sign}$${Math.abs(Math.round(num)).toLocaleString('en-US')}`;
  }
  if (dataFormatString === '"$"#,##0.00') {
    if (!isNum) return str;
    const sign = num < 0 ? '-' : '';
    return (
      sign +
      '$' +
      Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  // ── Plain number with thousands separator ────────────────────────────────
  if (dataFormatString === '#,##0') {
    return isNum ? Math.round(num).toLocaleString('en-US') : str;
  }

  // ── Fixed decimal ────────────────────────────────────────────────────────
  if (dataFormatString === '0.00') {
    return isNum ? num.toFixed(2) : str;
  }

  // ── Scientific ───────────────────────────────────────────────────────────
  if (dataFormatString === '0.00E+00') {
    if (!isNum) return str;
    const [coeff, exp] = num.toExponential(2).split('e');
    const expNum = parseInt(exp, 10);
    return `${coeff}E${expNum >= 0 ? '+' : ''}${String(expNum).padStart(2, '0')}`;
  }

  // ── Date (yyyy-mm-dd) ────────────────────────────────────────────────────
  if (dataFormatString === 'yyyy-mm-dd') {
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    if (isNum) {
      // Excel serial date: days since 1900-01-00 (adjust for leap-year bug offset)
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return str;
  }

  // ── Time (h:mm) ──────────────────────────────────────────────────────────
  if (dataFormatString === 'h:mm') {
    if (/^\d+:\d{2}/.test(str)) return str;
    if (isNum) {
      const totalMins = Math.round(num * 24 * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return `${h}:${String(m).padStart(2, '0')}`;
    }
    return str;
  }

  // ── Fraction (# ?/?) ─────────────────────────────────────────────────────
  if (dataFormatString === '# ?/?') {
    if (!isNum) return str;
    const whole = Math.floor(Math.abs(num));
    const frac = Math.abs(num) - whole;
    if (frac < 0.001) return String(num < 0 ? -whole : whole);
    let bestN = 1,
      bestD = 1,
      bestDiff = Infinity;
    for (let d = 2; d <= 9; d++) {
      const n = Math.round(frac * d);
      const diff = Math.abs(frac - n / d);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestN = n;
        bestD = d;
      }
    }
    const sign = num < 0 ? '-' : '';
    return whole > 0 ? `${sign}${whole} ${bestN}/${bestD}` : `${sign}${bestN}/${bestD}`;
  }

  // ── Generic fallback: parse leading "prefix", comma, decimal places ──────
  let fmt = dataFormatString;
  let prefix = '';
  const prefixMatch = fmt.match(/^"([^"]+)"/);
  if (prefixMatch) {
    prefix = prefixMatch[1];
    fmt = fmt.slice(prefixMatch[0].length);
  }

  if (isNum) {
    const decimalMatch = fmt.match(/\.(\d+)/);
    const decimals = decimalMatch ? decimalMatch[1].length : 0;
    const useComma = fmt.includes(',');
    const isPercent = fmt.trimEnd().endsWith('%');
    const val = isPercent ? num * 100 : num;
    const formatted = useComma
      ? Math.abs(val).toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.abs(val).toFixed(decimals);
    const sign = num < 0 ? '-' : '';
    return `${sign}${prefix}${formatted}${isPercent ? '%' : ''}`;
  }

  return str;
};

const drawText = ({ ctx, cell, topY, leftX, cellWidth, cellHeight, zoom = 1 }) => {
  if (!cell) {
    return;
  }

  const fontSize = (cell?.fontSize || 200) * SF * FONT_SIZE_MULTIPLIER * zoom;
  const fontStyle = cell?.fontItalic ? 'italic ' : '';
  const fontWeight = cell?.fontBold ? '600 ' : '';
  const fontFamily = cell?.fontFamily || 'Arial';
  ctx.font = `${fontStyle}${fontWeight}${fontSize}px "${fontFamily}"`;

  // Use custom color if set and not default black/auto, otherwise use theme text color.
  // When a cell has an explicit background but no explicit font color, pick a contrasting
  // text color based on background luminance so it reads in both light and dark theme.
  const cellColor = cell?.fontColor?.slice(2); // FFRRGGBB → RRGGBB
  const isDefaultBlack = !cellColor || cellColor === '000000';
  if (isDefaultBlack && cell?.bgColor) {
    const bg = cell.bgColor.slice(2); // strip leading AA byte
    const r = parseInt(bg.slice(0, 2), 16) / 255;
    const g = parseInt(bg.slice(2, 4), 16) / 255;
    const b = parseInt(bg.slice(4, 6), 16) / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ctx.fillStyle = lum > 0.5 ? '#333333' : getCSSVar('--text-primary');
  } else {
    ctx.fillStyle = isDefaultBlack ? getCSSVar('--text-primary') : `#${cellColor}`;
  }

  if (cell?.dataFormatString?.includes('[Red]')) {
    const rawNum = parseFloat(cell?.['f-value'] ?? cell?.value);
    if (!Number.isNaN(rawNum) && rawNum < 0) ctx.fillStyle = '#ff0000';
  }

  const [_rawHorizAlign, _rawVertAlign] = cell?.align?.split(';') || [];
  const excelHorizAlign = _rawHorizAlign?.toUpperCase();
  const excelVertAlign = _rawVertAlign?.toUpperCase();

  let ctxTextAlign = 'left';
  if (excelHorizAlign === 'RIGHT') {
    ctxTextAlign = 'right';
  }
  if (!excelHorizAlign || excelHorizAlign === 'GENERAL') {
    if (
      cell?.dataType === 'NUMERIC' ||
      cell?.dataType === 'FORMULA' ||
      typeof cell?.value === 'number'
    ) {
      ctxTextAlign = 'right';
    }
  }
  if (excelHorizAlign === 'CENTER') {
    ctxTextAlign = 'center';
  }

  const rawValue = cell?.['f-value'] ?? cell?.value ?? '';
  const cellValue = formatCellValue(rawValue, cell?.dataFormatString);
  const availableWidth = cellWidth * SF - CELL_PADDING * 2;

  // Save context state and create clipping region to prevent text overflow
  ctx.save();
  ctx.beginPath();
  ctx.rect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);
  ctx.clip();

  // Wrap text rendering with clipping
  const lineHeight = fontSize * 1.3;
  const lines = cell?.wrapText
    ? getWrappedLines(ctx, String(cellValue), availableWidth)
    : [String(cellValue)];
  const totalTextHeight = lines.length * lineHeight;

  // Vertical alignment calculation
  let startY;
  if (excelVertAlign === 'TOP') {
    startY = topY * SF + CELL_PADDING + fontSize;
  } else if (excelVertAlign === 'CENTER') {
    startY = topY * SF + (cellHeight * SF - totalTextHeight) / 2 + fontSize;
  } else {
    // BOTTOM (default)
    startY = (topY + cellHeight) * SF - totalTextHeight - CELL_PADDING + fontSize;
  }

  ctx.textAlign = ctxTextAlign;
  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;
    let lineX;

    if (ctxTextAlign === 'right') {
      lineX = (leftX + cellWidth) * SF - CELL_PADDING;
    } else if (ctxTextAlign === 'center') {
      lineX = leftX * SF + (cellWidth * SF) / 2;
    } else {
      lineX = leftX * SF + CELL_PADDING;
    }

    ctx.fillText(line, lineX, lineY);
  });
  ctx.textAlign = 'left';

  // Restore context state (removes clipping)
  ctx.restore();

  // Draw flow link indicator (outside clipping region)
  if (cell?.flowLink) {
    const prevFillStyle = ctx.fillStyle;
    ctx.fillStyle = getCSSVar('--accent-blue');
    const [cornerX, cornerY] = [(leftX + cellWidth) * SF, topY * SF];
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX, cornerY + 10);
    ctx.lineTo(cornerX - 10, cornerY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = prevFillStyle;
  }
};

const drawCellBorder = ({ ctx, cell, topY, leftX, cellWidth, cellHeight }) => {
  const [top, right, bottom, left] = cell?.boarder?.split(';') || [];
  const borderColor = getCSSVar('--text-primary');
  ctx.lineWidth = 2;

  if (top === 'BLACK1') {
    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.moveTo(leftX * SF, topY * SF);
    ctx.lineTo(leftX * SF + cellWidth * SF, topY * SF);
    ctx.stroke();
  }
  if (bottom === 'BLACK1') {
    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.moveTo(leftX * SF, topY * SF + cellHeight * SF);
    ctx.lineTo(leftX * SF + cellWidth * SF, topY * SF + cellHeight * SF);
    ctx.stroke();
  }
  if (left === 'BLACK1') {
    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.moveTo(leftX * SF, topY * SF);
    ctx.lineTo(leftX * SF, topY * SF + cellHeight * SF);
    ctx.stroke();
  }
  if (right === 'BLACK1') {
    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.moveTo(leftX * SF + cellWidth * SF, topY * SF);
    ctx.lineTo(leftX * SF + cellWidth * SF, topY * SF + cellHeight * SF);
    ctx.stroke();
  }

  ctx.lineWidth = 1;
};

const parseRefToIndices = ref => {
  const m = ref.toUpperCase().match(/([A-Z]+)(\d+)/);
  if (!m) return [0, 0];
  return [ALPHABET_EXTENDED.indexOf(m[1]), parseInt(m[2], 10) - 1];
};

const drawBlueRectAroundSelectedCell = ({
  ctx,
  selectedCellLocation,
  rowIndToTopY,
  colIndToLeftX,
  grid,
  mergeInfo = null,
}) => {
  if (!selectedCellLocation) {
    return;
  }

  const selectedRow = selectedCellLocation?.match(/\d+/)?.[0] - 1;
  const selectedCol = ALPHABET_EXTENDED.indexOf(selectedCellLocation?.match(/[A-Z]+/)?.[0]);

  const topY = Y_OFFSET + rowIndToTopY?.[selectedRow];
  const leftX = X_OFFSET + colIndToLeftX?.[selectedCol];

  let cellWidth = grid?.columnIndexToWidth?.[selectedCol] ?? 100;
  let cellHeight = grid?.rowIndexToHeight?.[selectedRow] ?? DEFAULT_CELL_HEIGHT;

  if (mergeInfo) {
    for (let i = 1; i < mergeInfo.colSpan; i++) {
      cellWidth += grid?.columnIndexToWidth?.[selectedCol + i] ?? 100;
    }
    for (let i = 1; i < mergeInfo.rowSpan; i++) {
      cellHeight += grid?.rowIndexToHeight?.[selectedRow + i] ?? DEFAULT_CELL_HEIGHT;
    }
  }

  ctx.strokeStyle = getCSSVar('--accent-blue');
  ctx.lineWidth = 2;
  const inset = 1;
  ctx.strokeRect(
    leftX * SF + inset,
    topY * SF + inset,
    cellWidth * SF - inset * 2,
    cellHeight * SF - inset * 2,
  );
  ctx.lineWidth = 1;
};

const drawRangeHighlights = ({ ctx, cellLocationToColor, rowIndToTopY, colIndToLeftX, grid }) => {
  const cellAddr = /^[A-Z]+[1-9]\d*$/;

  // Group individual cell refs by color (skip range-notation keys like 'B2:B21')
  const colorToCells = {};
  Object.entries(cellLocationToColor || {}).forEach(([loc, color]) => {
    if (!cellAddr.test(loc)) return;
    if (!colorToCells[color]) colorToCells[color] = [];
    colorToCells[color].push(loc);
  });

  Object.entries(colorToCells).forEach(([color, cells]) => {
    let minRow = Infinity,
      maxRow = -Infinity,
      minCol = Infinity,
      maxCol = -Infinity;
    cells.forEach(loc => {
      const row = parseInt(loc.match(/\d+$/)[0], 10) - 1;
      const col = ALPHABET_EXTENDED.indexOf(loc.match(/^[A-Z]+/)[0]);
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    });

    if (minRow === Infinity) return;

    const topY = Y_OFFSET + (rowIndToTopY?.[minRow] ?? 0);
    const leftX = X_OFFSET + (colIndToLeftX?.[minCol] ?? 0);
    const bottomY =
      Y_OFFSET +
      (rowIndToTopY?.[maxRow] ?? 0) +
      (grid?.rowIndexToHeight?.[maxRow] ?? DEFAULT_CELL_HEIGHT);
    const rightX =
      X_OFFSET + (colIndToLeftX?.[maxCol] ?? 0) + (grid?.columnIndexToWidth?.[maxCol] ?? 100);

    const inset = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(
      leftX * SF + inset,
      topY * SF + inset,
      (rightX - leftX) * SF - inset * 2,
      (bottomY - topY) * SF - inset * 2,
    );
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  });
};

const drawRegion = ({ ctx, window, grid, dragStartLocation, dragEndLocation, isEditing }) => {
  ctx.clearRect(0, 0, 100000, 100000);

  // Fill the top-left corner area with background color
  ctx.fillStyle = getCSSVar('--bg-tertiary');
  ctx.fillRect(0, 0, X_OFFSET * SF, Y_OFFSET * SF);

  // Don't draw selection region if editing or there's no valid selection
  if (
    isEditing ||
    !dragStartLocation ||
    !dragEndLocation ||
    dragStartLocation === dragEndLocation
  ) {
    return;
  }

  const { startRow, endRow, startCol, endCol } = window || {};

  const rowIndToTopY = getRowIndToTopY(startRow, endRow, grid);
  const colIndToLeftX = getColIndToLeftX(startCol, endCol, grid);

  const startRowIndex = dragStartLocation?.match(/\d+/)?.[0] - 1;
  const startColumnIndex = ALPHABET_EXTENDED.indexOf(dragStartLocation?.match(/[A-Z]+/)?.[0]);

  const endRowIndex = dragEndLocation?.match(/\d+/)?.[0] - 1;
  const endColumnIndex = ALPHABET_EXTENDED.indexOf(dragEndLocation?.match(/[A-Z]+/)?.[0]);

  // Handle selection in any direction by getting min/max bounds
  const minRowIndex = Math.min(startRowIndex, endRowIndex);
  const maxRowIndex = Math.max(startRowIndex, endRowIndex);
  const minColIndex = Math.min(startColumnIndex, endColumnIndex);
  const maxColIndex = Math.max(startColumnIndex, endColumnIndex);

  // Handle special cases for full row/column selection
  const isFullRowSelection = dragEndLocation?.includes('ZZZZZZ');
  const isFullColumnSelection = endRowIndex === 99999;

  const x = X_OFFSET + (colIndToLeftX?.[minColIndex] || 0);
  const y = Y_OFFSET + (rowIndToTopY?.[minRowIndex] || 0);

  let w = (colIndToLeftX?.[maxColIndex + 1] || 0) - (colIndToLeftX?.[minColIndex] || 0);
  if (isFullRowSelection) {
    w = 99999;
  }

  let h = (rowIndToTopY?.[maxRowIndex + 1] || 0) - (rowIndToTopY?.[minRowIndex] || 0);
  if (isFullColumnSelection) {
    h = 99999;
  }

  // Only draw if we have valid dimensions
  if (w <= 0 || h <= 0) {
    return;
  }

  // --ba-cell-selected-bg: rgba(20,115,223,0.1)
  const accentBlue = getCSSVar('--accent-blue');
  const hexToRgba = hex => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.1)`;
  };
  ctx.fillStyle = hexToRgba(accentBlue);
  ctx.fillRect(x * SF, y * SF, w * SF, h * SF);
};

const isMouseLocationColumnHeader = ({ mouseLocation, viewWindow }) => {
  const { startRow } = viewWindow || {};
  const mouseRow = mouseLocation?.match(/\d+/)?.[0] - 1;
  return startRow - 1 === mouseRow;
};

const isMouseLocationRowHeader = ({ mouseLocation, viewWindow }) => {
  const { startCol } = viewWindow || {};
  const mouseCol = ALPHABET_EXTENDED.indexOf(mouseLocation?.match(/[A-Z]+/)?.[0]);
  return mouseCol + 1 === startCol;
};

const fillBgOfRemainingRow = ({
  ctx,
  topY,
  rowInd,
  colIndToLeftX,
  colInd,
  endCol,
  cells,
  grid,
  mergedSlaveMap = {},
  mergedMasterMap = {},
}) => {
  const cellHeight = grid?.rowIndexToHeight?.[rowInd] ?? DEFAULT_CELL_HEIGHT;

  range(colInd, endCol).forEach(c => {
    const cellId = `${ALPHABET_EXTENDED[c]}${rowInd + 1}`;
    if (mergedSlaveMap[cellId]) return; // skip slave cells — master already filled the area

    const mergeInfo = mergedMasterMap[cellId];
    const leftX = X_OFFSET + colIndToLeftX[c];
    let cellWidth = grid?.columnIndexToWidth?.[c] ?? 100;
    if (mergeInfo) {
      for (let i = 1; i < mergeInfo.colSpan; i++)
        cellWidth += grid?.columnIndexToWidth?.[c + i] ?? 100;
    }

    if (cellWidth === 0 || cellHeight === 0) {
      return;
    }

    const cell = cells?.[cellId];

    // Use default background if NO_FILL pattern, otherwise use bgColor if set
    ctx.fillStyle =
      cell?.bgPattern === 'NO_FILL' || !cell?.bgColor
        ? getCSSVar('--bg-primary')
        : `#${cell.bgColor.slice(2)}`;
    const pageArea = grid?.pageArea?.replace(/\$/g, '') || '';
    if (!!pageArea && !isCellIdWithinSelection(cellId, pageArea)) {
      ctx.fillStyle = getCSSVar('--bg-tertiary');
    }
    ctx.fillRect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);
    ctx.strokeStyle = getCSSVar('--border-default');
    ctx.strokeRect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);
  });
};

const isPreviousCellMergedAndThisOneIsnt = ({ cells, rowInd, colInd }) => {
  const prevCellId = `${ALPHABET_EXTENDED[colInd - 1]}${rowInd + 1}`;
  return (
    cells?.[prevCellId]?.merged && !cells?.[`${ALPHABET_EXTENDED[colInd]}${rowInd + 1}`]?.merged
  );
};

const getCellToLabelColorsMap = labels => {
  const cellToColors = new Map();
  labels.forEach((label, index) => {
    const color = COLORS[index % COLORS.length];
    label.selection?.forEach(cellId => {
      if (!cellToColors.has(cellId)) {
        cellToColors.set(cellId, []);
      }
      cellToColors.get(cellId).push(color);
    });
  });
  return cellToColors;
};

const drawLabelIndicators = ({ ctx, topY, leftX, colors }) => {
  const dotRadius = 4;
  const dotOffsetX = 6;
  const dotOffsetY = 6;
  const dotSpacing = 10;

  colors.forEach((color, index) => {
    ctx.beginPath();
    ctx.arc(
      (leftX + dotOffsetX + index * dotSpacing) * SF,
      (topY + dotOffsetY) * SF,
      dotRadius * SF,
      0,
      2 * Math.PI,
    );
    ctx.fillStyle = color;
    ctx.fill();
  });
};

const drawCells = ({
  ctx,
  window,
  grid,
  cells,
  selectedCellLocation,
  cellLocationToColor,
  labels = [],
  editingCellLocation = null,
  zoom: _zoom,
  mergedSlaveMap = {},
  mergedMasterMap = {},
}) => {
  const zoom = _zoom ?? grid?._zoom ?? 1;
  ctx.clearRect(0, 0, 100000, 100000);

  // Fill the top-left corner area with background color
  ctx.fillStyle = getCSSVar('--bg-tertiary');
  ctx.fillRect(0, 0, X_OFFSET * SF, Y_OFFSET * SF);

  const { startRow, endRow, startCol, endCol } = window || {};

  const rowIndToTopY = getRowIndToTopY(startRow, endRow, grid);
  const colIndToLeftX = getColIndToLeftX(startCol, endCol, grid);
  const cellToLabelColors = getCellToLabelColorsMap(labels);

  // 1st pass: draw cell backgrounds
  range(startRow, endRow).forEach(rowInd => {
    drawRowHeader({ ctx, rowIndToTopY, rowInd, selectedCellLocation });
    range(startCol, endCol).forEach(colInd => {
      if (rowInd === startRow) {
        drawColHeader({ ctx, colIndToLeftX, colInd, selectedCellLocation });
      }

      const cellId = `${ALPHABET_EXTENDED[colInd]}${rowInd + 1}`;
      if (mergedSlaveMap[cellId]) return; // skip slave cells entirely

      const topY = Y_OFFSET + rowIndToTopY[rowInd];
      const leftX = X_OFFSET + colIndToLeftX[colInd];
      const mergeInfo = mergedMasterMap[cellId];
      let cellWidth = grid?.columnIndexToWidth?.[colInd] ?? 100;
      let cellHeight = grid?.rowIndexToHeight?.[rowInd] ?? DEFAULT_CELL_HEIGHT;
      if (mergeInfo) {
        for (let i = 1; i < mergeInfo.colSpan; i++)
          cellWidth += grid?.columnIndexToWidth?.[colInd + i] ?? 100;
        for (let i = 1; i < mergeInfo.rowSpan; i++)
          cellHeight += grid?.rowIndexToHeight?.[rowInd + i] ?? DEFAULT_CELL_HEIGHT;
      }

      if (cellWidth === 0 || cellHeight === 0) {
        return;
      }

      const cell = cells?.[cellId];

      // Use default background if NO_FILL pattern, otherwise use bgColor if set
      ctx.fillStyle =
        cell?.bgPattern === 'NO_FILL' || !cell?.bgColor
          ? getCSSVar('--bg-primary')
          : `#${cell.bgColor.slice(2)}`;
      const pageArea = grid?.pageArea?.replace(/\$/g, '') || '';
      if (!!pageArea && !isCellIdWithinSelection(cellId, pageArea)) {
        ctx.fillStyle = getCSSVar('--bg-tertiary');
      }

      ctx.fillRect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);
      ctx.strokeStyle = getCSSVar('--border-default');
      ctx.strokeRect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);

      drawCellBorder({ ctx, cell, topY, leftX, cellWidth, cellHeight });
    });
  });

  // 2nd pass: draw cell texts, and backgrounds if necessary to overlay previous cell text
  range(startRow, endRow).forEach(rowInd => {
    range(startCol, endCol).forEach(colInd => {
      const cellId = `${ALPHABET_EXTENDED[colInd]}${rowInd + 1}`;
      if (mergedSlaveMap[cellId]) return;

      const topY = Y_OFFSET + rowIndToTopY[rowInd];
      const leftX = X_OFFSET + colIndToLeftX[colInd];
      const mergeInfo = mergedMasterMap[cellId];
      let cellWidth = grid?.columnIndexToWidth?.[colInd] ?? 100;
      let cellHeight = grid?.rowIndexToHeight?.[rowInd] ?? DEFAULT_CELL_HEIGHT;
      if (mergeInfo) {
        for (let i = 1; i < mergeInfo.colSpan; i++)
          cellWidth += grid?.columnIndexToWidth?.[colInd + i] ?? 100;
        for (let i = 1; i < mergeInfo.rowSpan; i++)
          cellHeight += grid?.rowIndexToHeight?.[rowInd + i] ?? DEFAULT_CELL_HEIGHT;
      }

      if (cellWidth === 0 || cellHeight === 0) {
        return;
      }

      const cell = cells?.[cellId];

      if (
        cell?.['f-value'] ||
        cell?.value ||
        (!mergeInfo && isPreviousCellMergedAndThisOneIsnt({ cells, rowInd, colInd }))
      ) {
        drawCellBorder({ ctx, cell, topY, leftX, cellWidth, cellHeight });
        if (!mergeInfo) {
          fillBgOfRemainingRow({
            ctx,
            topY,
            rowInd,
            colIndToLeftX,
            colInd,
            endCol,
            cells,
            grid,
            mergedSlaveMap,
            mergedMasterMap,
          });
        }
      }

      // Skip drawing text for the cell being edited (editor overlay handles it)
      if (cellId !== editingCellLocation) {
        drawText({ ctx, cell, topY, leftX, cellWidth, cellHeight, zoom });
      }

      if (cellToLabelColors.has(cellId)) {
        drawLabelIndicators({ ctx, topY, leftX, colors: cellToLabelColors.get(cellId) });
      }
    });
  });

  // Final pass: redraw merged master cells on top to cover any stray borders from adjacent cells
  Object.entries(mergedMasterMap).forEach(([masterRef, mergeInfo]) => {
    const [masterCol, masterRow] = parseRefToIndices(masterRef);
    if (masterRow < startRow || masterRow >= endRow || masterCol < startCol || masterCol >= endCol)
      return;
    if (!rowIndToTopY[masterRow] === undefined || !colIndToLeftX[masterCol] === undefined) return;

    const topY = Y_OFFSET + rowIndToTopY[masterRow];
    const leftX = X_OFFSET + colIndToLeftX[masterCol];
    let cellWidth = 0;
    for (let i = 0; i < mergeInfo.colSpan; i++)
      cellWidth += grid?.columnIndexToWidth?.[masterCol + i] ?? 100;
    let cellHeight = 0;
    for (let i = 0; i < mergeInfo.rowSpan; i++)
      cellHeight += grid?.rowIndexToHeight?.[masterRow + i] ?? DEFAULT_CELL_HEIGHT;

    if (cellWidth === 0 || cellHeight === 0) return;

    const cell = cells?.[masterRef];
    ctx.fillStyle =
      cell?.bgPattern === 'NO_FILL' || !cell?.bgColor
        ? getCSSVar('--bg-primary')
        : `#${cell.bgColor.slice(2)}`;
    const pageArea = grid?.pageArea?.replace(/\$/g, '') || '';
    if (!!pageArea && !isCellIdWithinSelection(masterRef, pageArea)) {
      ctx.fillStyle = getCSSVar('--bg-tertiary');
    }
    ctx.fillRect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);
    ctx.strokeStyle = getCSSVar('--border-default');
    ctx.strokeRect(leftX * SF, topY * SF, cellWidth * SF, cellHeight * SF);

    if (masterRef !== editingCellLocation) {
      drawText({ ctx, cell, topY, leftX, cellWidth, cellHeight });
    }
  });

  // Don't draw blue border when cell is being edited (editor has its own border)
  if (editingCellLocation !== selectedCellLocation) {
    drawBlueRectAroundSelectedCell({
      ctx,
      selectedCellLocation,
      rowIndToTopY,
      colIndToLeftX,
      grid,
      mergeInfo: mergedMasterMap[selectedCellLocation] ?? null,
    });
  }
  drawRangeHighlights({ ctx, cellLocationToColor, rowIndToTopY, colIndToLeftX, grid });
};

const getRowIndToTopY = (startRow, endRow, grid) => {
  const rowIndToTopY = {};
  let y = 0;
  // Include endRow so the last visible row can calculate its height
  range(startRow, endRow + 1).forEach(i => {
    rowIndToTopY[i] = y;
    y += grid?.rowIndexToHeight?.[i] ?? DEFAULT_CELL_HEIGHT;
  });
  return rowIndToTopY;
};

const getColIndToLeftX = (startCol, endCol, grid) => {
  const colIndToLeftX = {};
  let x = 0;
  // Include endCol so the last visible column can calculate its width
  range(startCol, endCol + 1).forEach(i => {
    colIndToLeftX[i] = x;
    x += grid?.columnIndexToWidth?.[i] ?? 100;
  });
  return colIndToLeftX;
};

/**
 * Adjust cell references inside a formula by rowDelta / colDelta rows/cols.
 * Handles absolute ($), relative, mixed, and cross-sheet ('Sheet1'!B2) refs.
 * Sheet name prefix is preserved verbatim; only the cell part is adjusted.
 */
const adjustFormula = (formula, rowDelta, colDelta) => {
  // Regex: optional sheet prefix (group 1), then $col$row (groups 2-5)
  return formula.replace(
    /((?:'[^']+'|[A-Za-z_]\w*)!)?(\$?)([A-Za-z]+)(\$?)(\d+)/g,
    (match, sheetRef, dc, col, dr, row) => {
      const colUpper = col.toUpperCase();
      const colIdx = ALPHABET_EXTENDED.indexOf(colUpper);
      if (colIdx === -1) return match; // not a valid column label — leave as-is
      const newColIdx = dc === '$' ? colIdx : Math.max(0, colIdx + colDelta);
      const newCol = ALPHABET_EXTENDED[newColIdx] || colUpper;
      const newRow = dr === '$' ? parseInt(row, 10) : Math.max(1, parseInt(row, 10) + rowDelta);
      return `${sheetRef || ''}${dc}${newCol}${dr}${newRow}`;
    },
  );
};

/**
 * Draw a dashed blue bounding-box border on the overlay canvas showing the fill range.
 */
const drawFillRange = ({ ctx, grid, window: win, sourceLocation, targetLocation }) => {
  if (!sourceLocation || !targetLocation) return;
  const { startRow, endRow, startCol, endCol } = win || {};
  const rowIndToTopY = getRowIndToTopY(startRow, endRow, grid);
  const colIndToLeftX = getColIndToLeftX(startCol, endCol, grid);

  const srcRow = (sourceLocation.match(/\d+/)?.[0] ?? 1) - 1;
  const srcCol = ALPHABET_EXTENDED.indexOf(sourceLocation.match(/[A-Z]+/)?.[0]);
  const tgtRow = (targetLocation.match(/\d+/)?.[0] ?? 1) - 1;
  const tgtCol = ALPHABET_EXTENDED.indexOf(targetLocation.match(/[A-Z]+/)?.[0]);

  const minRow = Math.min(srcRow, tgtRow);
  const maxRow = Math.max(srcRow, tgtRow);
  const minCol = Math.min(srcCol, tgtCol);
  const maxCol = Math.max(srcCol, tgtCol);

  const topY = Y_OFFSET + (rowIndToTopY[minRow] ?? 0);
  const leftX = X_OFFSET + (colIndToLeftX[minCol] ?? 0);
  const bottomY =
    Y_OFFSET +
    (rowIndToTopY[maxRow] ?? 0) +
    (grid?.rowIndexToHeight?.[maxRow] ?? DEFAULT_CELL_HEIGHT);
  const rightX =
    X_OFFSET + (colIndToLeftX[maxCol] ?? 0) + (grid?.columnIndexToWidth?.[maxCol] ?? 100);

  const accentBlue = getCSSVar('--accent-blue');
  ctx.strokeStyle = accentBlue;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(leftX * SF, topY * SF, (rightX - leftX) * SF, (bottomY - topY) * SF);
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
};

/**
 * Calculate pixel offset for viewWindow start position
 * Used to sync image positions with virtual scrolling
 */
const getViewWindowPixelOffset = (viewWindow, grid) => {
  let offsetY = 0;
  for (let i = 0; i < viewWindow?.startRow; i++) {
    offsetY += grid?.rowIndexToHeight?.[i] ?? DEFAULT_CELL_HEIGHT;
  }

  let offsetX = 0;
  for (let i = 0; i < viewWindow?.startCol; i++) {
    offsetX += grid?.columnIndexToWidth?.[i] ?? 100;
  }

  return { offsetX, offsetY };
};

/**
 * Convert screen coordinates to image storage coordinates for editing
 * @param screenX, screenY - Screen coordinates
 * @param viewWindow - Current viewport window
 * @param grid - Grid configuration
 * @param containerRect - CellsContainer's getBoundingClientRect()
 * @returns {x, y} - Storage coordinates
 */
const screenToStorage = (screenX, screenY, viewWindow, grid, containerRect) => {
  const viewOffset = getViewWindowPixelOffset(viewWindow, grid);

  // Screen coords → Canvas-relative coords → Storage coords
  const x = screenX - (containerRect?.left || 0) - X_OFFSET + viewOffset.offsetX;
  const y = screenY - (containerRect?.top || 0) - Y_OFFSET + viewOffset.offsetY;

  return { x, y };
};

/**
 * Draw images on canvas (non-selected images only)
 * Selected images are rendered as DOM elements for interaction
 */
const drawImages = ({ ctx, images, selectedImageId, imageElementCache, viewWindow, grid }) => {
  if (!images?.length) return;

  const viewOffset = getViewWindowPixelOffset(viewWindow, grid);

  images.forEach(imgData => {
    // Skip selected image - it's rendered as DOM for interaction
    if (imgData.id === selectedImageId) return;

    const cachedImg = imageElementCache?.[imgData.id];
    if (!cachedImg || !cachedImg.complete) return;

    // Calculate canvas coordinates
    const canvasX = (X_OFFSET + imgData.x - viewOffset.offsetX) * SF;
    const canvasY = (Y_OFFSET + imgData.y - viewOffset.offsetY) * SF;
    const canvasWidth = imgData.width * SF;
    const canvasHeight = imgData.height * SF;

    // Only draw if visible in viewport
    if (canvasX + canvasWidth < X_OFFSET * SF || canvasY + canvasHeight < Y_OFFSET * SF) {
      return;
    }

    // Save context for clipping
    ctx.save();

    // Clip to data area (exclude row/col headers)
    ctx.beginPath();
    ctx.rect(X_OFFSET * SF, Y_OFFSET * SF, 100000, 100000);
    ctx.clip();

    ctx.drawImage(cachedImg, canvasX, canvasY, canvasWidth, canvasHeight);

    ctx.restore();
  });
};

const getSegStartToSegLength = (hiddenRowIndices = []) => {
  const segStartToSegLength = {};

  let currentSegStart = null;
  const maxHiddenRowInd = hiddenRowIndices?.length ? Math.max(...hiddenRowIndices) : 0;
  range(0, maxHiddenRowInd).forEach(rowInd => {
    if (hiddenRowIndices.includes(rowInd)) {
      if (currentSegStart === null) {
        currentSegStart = rowInd;
        segStartToSegLength[currentSegStart] = 1;
        return;
      }
      segStartToSegLength[currentSegStart]++;
      return;
    }
    currentSegStart = null;
  });

  return segStartToSegLength;
};

const getWindow = (scrollTop, scrollLeft, grid = {}, canvasSize = {}) => {
  let startRow = Math.floor(scrollTop / SCROLL_Y_SENSITIVITY);
  const hiddenRowIndices = grid?.hiddenRowIndices?.map(i => parseInt(i, 10)) || [];
  const rowsSegStartToSegLength = getSegStartToSegLength(hiddenRowIndices);
  Object.entries(rowsSegStartToSegLength).forEach(([segStart, segLength]) => {
    if (startRow >= segStart) {
      startRow += segLength;
    }
  });

  let endRow = startRow;
  let y = 0;
  while (y < canvasSize.height) {
    endRow++;
    y += grid?.rowIndexToHeight?.[endRow] ?? DEFAULT_CELL_HEIGHT;
  }

  let startCol = Math.floor(scrollLeft / SCROLL_X_SENSITIVITY);
  const hiddenColIndices = grid?.hiddenColIndices?.map(i => parseInt(i, 10)) || [];
  const colsSegStartToSegLength = getSegStartToSegLength(hiddenColIndices);
  Object.entries(colsSegStartToSegLength).forEach(([segStart, segLength]) => {
    if (startCol >= segStart) {
      startCol += segLength;
    }
  });

  let endCol = startCol;
  let x = 0;
  while (x < canvasSize.width) {
    endCol++;
    x += grid?.columnIndexToWidth?.[endCol] ?? 100;
  }

  return { startRow, endRow, startCol, endCol: endCol + 2 };
};

const getSelectedCellStyle = (cellLocation, grid, viewWindow, scrollTop = 0, scrollLeft = 0) => {
  if (!cellLocation) {
    return { display: 'none' };
  }

  const rowIndex = cellLocation?.match(/\d+/)?.[0] - 1;
  const columnIndex = ALPHABET_EXTENDED.indexOf(cellLocation?.match(/[A-Z]+/)?.[0]);

  if (
    rowIndex < viewWindow?.startRow ||
    rowIndex > viewWindow?.endRow ||
    columnIndex < viewWindow?.startCol ||
    columnIndex > viewWindow?.endCol
  ) {
    return { display: 'none' };
  }

  const topY = Y_OFFSET + getRowIndToTopY(viewWindow?.startRow, rowIndex + 1, grid)[rowIndex];
  const leftX =
    X_OFFSET + getColIndToLeftX(viewWindow?.startCol, columnIndex + 1, grid)[columnIndex];

  const _width = grid?.columnIndexToWidth?.[columnIndex] ?? 100;
  const height = grid?.rowIndexToHeight?.[rowIndex] ?? DEFAULT_CELL_HEIGHT;

  return {
    top: `${topY + scrollTop}px`,
    left: `${leftX + scrollLeft}px`,
    height: `${height}px`,
  };
};

const getUpdatedCellFromInputValue = (inputValue, cell) => {
  if (inputValue?.[0] === '=') {
    if (inputValue !== cell?.formula) {
      return { ...cell, dataType: 'FORMULA', formula: inputValue, value: '' };
    }
    return cell;
  }

  if (inputValue !== cell?.value) {
    if (inputValue?.match(/^[-0-9]+$/)) {
      const parsedValue = parseFloat(inputValue);
      if (!!parsedValue && typeof parsedValue === 'number') {
        return { ...cell, dataType: 'NUMERIC', value: parseFloat(inputValue) };
      }
    }

    return {
      ...cell,
      dataType: 'STRING',
      value: inputValue,
      dataFormatString: '',
    };
  }

  return cell;
};

const isInMiddleOfFormula = valueToEdit => {
  if (typeof valueToEdit !== 'string') {
    return false;
  }

  if (valueToEdit?.match(/=.*\([^)]*/g)?.[0] === valueToEdit) {
    return true;
  }

  return false;
};

const ExcelViewSheetArea = ({
  viewWindow = { startRow: 0, startCol: 0, endRow: 30, endCol: 30 },
  onScrollViewWindow = ({ startRow, startCol, endRow, endCol }) => {},
  cells = {},
  grid = {},
  zoom = 1,
  onNewCellToPatch = () => {},
  sheetName,
  isPatching,
  onNewGrid = () => {},
  spans = [],
  labelGroups = [],
  showToolbar = true,
  useMSFormulaBar = false,
  onChangeSpans = () => {},
  onSaveLabel = () => {},
  labels = [],
  extraLabels = [],
  images = [],
  onNewImagesToPatch = () => {},
  mergedCellRanges = [],
  onMergeCells = () => {},
}) => {
  // Scale grid dimensions by zoom factor so all rendering code zooms automatically.
  // Uses Proxy so that even cells using default widths/heights (not in the map) are scaled.
  const scaledGrid = useMemo(() => {
    if (!grid || zoom === 1) return grid;
    const makeScaledProxy = (obj, defaultVal) =>
      new Proxy(obj ?? {}, {
        get(target, key) {
          if (typeof key === 'symbol') return target[key];
          const val = target[key];
          if (val !== undefined) return typeof val === 'number' ? val * zoom : val;
          if (!Number.isNaN(key)) return defaultVal * zoom;
          return target[key];
        },
      });
    return {
      ...grid,
      columnIndexToWidth: makeScaledProxy(grid.columnIndexToWidth, 100),
      rowIndexToHeight: makeScaledProxy(grid.rowIndexToHeight, DEFAULT_CELL_HEIGHT),
      _zoom: zoom,
    };
  }, [grid, zoom]);

  // Replaces styled-components useTheme() — listens to the app's themechange event
  // AND watches data-theme attribute as a fallback
  // Light mode = data-theme attribute REMOVED; dark mode = data-theme="dark"
  const getThemeName = () => document.documentElement.getAttribute('data-theme') ?? 'light';
  const [_theme, setTheme] = React.useState({ name: getThemeName() });
  React.useEffect(() => {
    const updateTheme = () => {
      clearCSSVarCache();
      setTheme({ name: getThemeName() });
    };
    // Primary: app dispatches 'themechange' event from ThemeToggle component
    window.addEventListener('themechange', updateTheme);
    // Fallback: watch the data-theme attribute directly
    const obs = new MutationObserver(updateTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      window.removeEventListener('themechange', updateTheme);
      obs.disconnect();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: getThemeName stable
  }, [getThemeName]);
  const gridCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const rootRef = useRef(null);
  // Offscreen canvas for double-buffering to prevent blinking
  const offscreenCanvasRef = useRef(null);
  // Virtual scroll position (canvas never physically scrolls)
  const scrollTopRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const [canvasSize, setCanvasSize] = useState({ width: 200, height: 200 });
  const [selectedCellLocation, setSelectedCellLocation] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [valueToEdit, setValueToEdit] = useState('');

  const [dragStartLocation, setDragStartLocation] = useState('');
  const [dragEndLocation, setDragEndLocation] = useState('');

  // Fill handle drag state
  const [fillDragEndLocation, setFillDragEndLocation] = useState('');
  const fillDragEndRef = useRef('');

  const [isMouseDown, setIsMouseDown] = useState(false);

  const [columnResizeIndex, setColumnResizeIndex] = useState(null);
  const [columnResizeAmount, setColumnResizeAmount] = useState(null);
  const [columnResizeStartX, setColumnResizeStartX] = useState(null);

  const [rowResizeIndex, setRowResizeIndex] = useState(null);
  const [rowResizeAmount, setRowResizeAmount] = useState(null);
  const [rowResizeStartX, setRowResizeStartX] = useState(null);

  const [_isSidebarOpen, _setIsSidebarOpen] = useSearchParamsState({
    paramName: 'isSidebarOpen',
    initialValue: false,
  });

  const [_modalTableDocumentLocation, setModalTableDocumentLocation] = useState(null);

  const handleInsertFunction = funcName => {
    setIsEditing(true);
    setValueToEdit(`=${funcName}(`);
  };

  // Image-related state
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageDragInfo, setImageDragInfo] = useState(null);

  // Derived state for images to render (handling drag/resize preview)
  const currentImages = useMemo(() => {
    if (!imageDragInfo) return images;

    const {
      type,
      imageId,
      startX,
      startY,
      currentX,
      currentY,
      originalX,
      originalY,
      originalWidth,
      originalHeight,
      handle,
    } = imageDragInfo;

    // If we haven't moved yet (currentX/Y undefined), return original
    if (currentX === undefined || currentY === undefined) return images;

    const dx = currentX - startX;
    const dy = currentY - startY;

    return images.map(img => {
      if (img.id !== imageId) return img;

      if (type === 'move') {
        return {
          ...img,
          x: Math.max(0, originalX + dx),
          y: Math.max(0, originalY + dy),
        };
      } else if (type === 'resize') {
        let newX = originalX;
        let newY = originalY;
        let newWidth = originalWidth;
        let newHeight = originalHeight;

        if (handle.includes('left')) {
          newWidth = Math.max(20, originalWidth - dx);
          newX = originalX + (originalWidth - newWidth);
        } else if (handle.includes('right')) {
          newWidth = Math.max(20, originalWidth + dx);
        }

        if (handle.includes('top')) {
          newHeight = Math.max(20, originalHeight - dy);
          newY = originalY + (originalHeight - newHeight);
        } else if (handle.includes('bottom')) {
          newHeight = Math.max(20, originalHeight + dy);
        }

        return {
          ...img,
          x: Math.max(0, newX),
          y: Math.max(0, newY),
          width: newWidth,
          height: newHeight,
        };
      }
      return img;
    });
  }, [images, imageDragInfo]);

  // Image element cache for canvas rendering
  const imageElementCacheRef = useRef({});
  // Container position for coordinate conversion
  const containerRectRef = useRef(null);
  // Force re-render trigger for image loading
  const [_imageLoadTrigger, setImageLoadTrigger] = useState(0);

  // Merge cell lookup maps derived from mergedCellRanges prop
  const mergedSlaveMap = useMemo(() => {
    const map = {};
    for (const range of mergedCellRanges || []) {
      const parts = range.split(':');
      if (parts.length !== 2) continue;
      const [sc, sr] = parseRefToIndices(parts[0]);
      const [ec, er] = parseRefToIndices(parts[1]);
      for (let r = sr; r <= er; r++) {
        for (let c = sc; c <= ec; c++) {
          if (r !== sr || c !== sc) {
            map[`${ALPHABET_EXTENDED[c]}${r + 1}`] = parts[0].toUpperCase();
          }
        }
      }
    }
    return map;
  }, [mergedCellRanges]);

  const mergedMasterMap = useMemo(() => {
    const map = {};
    for (const range of mergedCellRanges || []) {
      const parts = range.split(':');
      if (parts.length !== 2) continue;
      const [sc, sr] = parseRefToIndices(parts[0]);
      const [ec, er] = parseRefToIndices(parts[1]);
      map[parts[0].toUpperCase()] = { colSpan: ec - sc + 1, rowSpan: er - sr + 1 };
    }
    return map;
  }, [mergedCellRanges]);

  // Ref to track if auto height calculation is in progress to prevent infinite loops
  const isCalculatingHeightRef = useRef(false);
  const prevCellsRef = useRef(null);
  // Cache for rows that have already been calculated for wrap text height
  const calculatedRowsRef = useRef(new Set());
  // Ref to track last click time and location for custom double-click detection
  const lastClickRef = useRef({ time: 0, location: '' });

  // Reset virtual scroll position only when switching sheets
  useEffect(() => {
    scrollTopRef.current = 0;
    scrollLeftRef.current = 0;
    // Clear cache when switching sheets
    calculatedRowsRef.current = new Set();
    setSelectedImageId(null);
    setImageDragInfo(null);
  }, []);

  // Clear CSS variable cache and force redraw when theme changes
  useEffect(() => {
    clearCSSVarCache();
    // Force canvas redraw by triggering a state update
    setCanvasSize(prev => ({ ...prev }));
  }, []);

  // Update container rect for coordinate conversion only
  // Canvas size is updated separately via debounced resize handler to prevent blinking
  const updateContainerRect = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      containerRectRef.current = rect;
    }
  };

  // ── Fill handle ──────────────────────────────────────────────────────────

  // CSS px position of the fill handle square (bottom-right corner of selected cell).
  // Returns null when editing, during fill drag, or cell is out of view.
  const fillHandlePos = useMemo(() => {
    if (!selectedCellLocation || isEditing || fillDragEndLocation) return null;
    const colStr = selectedCellLocation.match(/[A-Z]+/)?.[0];
    const rowStr = selectedCellLocation.match(/\d+/)?.[0];
    if (!colStr || !rowStr) return null;
    const rowIdx = parseInt(rowStr, 10) - 1;
    const colIdx = ALPHABET_EXTENDED.indexOf(colStr);
    const { startRow, endRow, startCol, endCol } = viewWindow || {};
    if (rowIdx < startRow || rowIdx > endRow || colIdx < startCol || colIdx > endCol) return null;
    const rowIndToTopY = getRowIndToTopY(startRow, endRow, scaledGrid);
    const colIndToLeftX = getColIndToLeftX(startCol, endCol, scaledGrid);
    const leftX = X_OFFSET + (colIndToLeftX[colIdx] ?? 0);
    const topY = Y_OFFSET + (rowIndToTopY[rowIdx] ?? 0);
    const cellWidth = scaledGrid?.columnIndexToWidth?.[colIdx] ?? 100;
    const cellHeight = scaledGrid?.rowIndexToHeight?.[rowIdx] ?? DEFAULT_CELL_HEIGHT;
    return { x: leftX + cellWidth, y: topY + cellHeight };
  }, [selectedCellLocation, isEditing, fillDragEndLocation, scaledGrid, viewWindow]);

  const applyFill = useCallback(
    targetCell => {
      const srcColStr = selectedCellLocation.match(/[A-Z]+/)?.[0];
      const srcRow = parseInt(selectedCellLocation.match(/\d+/)?.[0], 10);
      const tgtColStr = targetCell.match(/[A-Z]+/)?.[0];
      const tgtRow = parseInt(targetCell.match(/\d+/)?.[0], 10);
      if (!srcColStr || !tgtColStr || Number.isNaN(srcRow) || Number.isNaN(tgtRow)) return;

      const srcColIdx = ALPHABET_EXTENDED.indexOf(srcColStr);
      const tgtColIdx = ALPHABET_EXTENDED.indexOf(tgtColStr);
      const rowDelta = tgtRow - srcRow;
      const colDelta = tgtColIdx - srcColIdx;
      if (rowDelta === 0 && colDelta === 0) return;

      const fillRows = Math.abs(rowDelta) >= Math.abs(colDelta);
      const step = fillRows ? (rowDelta > 0 ? 1 : -1) : colDelta > 0 ? 1 : -1;
      const srcData = cells[selectedCellLocation] || {};
      const patches = {};

      if (fillRows) {
        for (let r = srcRow + step; step > 0 ? r <= tgtRow : r >= tgtRow; r += step) {
          const ref = `${srcColStr}${r}`;
          const delta = r - srcRow;
          patches[ref] = srcData.formula
            ? { formula: adjustFormula(srcData.formula, delta, 0), dataType: 'FORMULA', value: '' }
            : { ...srcData };
        }
      } else {
        for (let c = srcColIdx + step; step > 0 ? c <= tgtColIdx : c >= tgtColIdx; c += step) {
          const ref = `${ALPHABET_EXTENDED[c]}${srcRow}`;
          const delta = c - srcColIdx;
          patches[ref] = srcData.formula
            ? { formula: adjustFormula(srcData.formula, 0, delta), dataType: 'FORMULA', value: '' }
            : { ...srcData };
        }
      }
      if (Object.keys(patches).length) onNewCellToPatch(patches);
    },
    [selectedCellLocation, cells, onNewCellToPatch],
  );

  const handleFillHandleMouseDown = useCallback(
    e => {
      e.preventDefault();
      e.stopPropagation();
      fillDragEndRef.current = '';

      const onMove = me => {
        const rect = containerRectRef.current;
        if (!rect) return;
        const loc = getCellLocationFromOffset(
          me.clientX - rect.left,
          me.clientY - rect.top,
          scaledGrid,
          viewWindow,
        );
        if (loc && loc !== fillDragEndRef.current) {
          fillDragEndRef.current = loc;
          setFillDragEndLocation(loc);
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        const endLoc = fillDragEndRef.current;
        if (endLoc && endLoc !== selectedCellLocation) applyFill(endLoc);
        fillDragEndRef.current = '';
        setFillDragEndLocation('');
      };

      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [selectedCellLocation, scaledGrid, viewWindow, applyFill],
  );

  // ─────────────────────────────────────────────────────────────────────────

  // Virtual scroll: intercept wheel events and update viewWindow without physically scrolling.
  // The canvas always stays at top:0, left:0, so headers never move.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = e => {
      e.preventDefault();
      const delta =
        e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const deltaX =
        e.deltaMode === 1 ? e.deltaX * 50 : e.deltaMode === 2 ? e.deltaX * 400 : e.deltaX;
      scrollTopRef.current = Math.max(0, scrollTopRef.current + delta);
      scrollLeftRef.current = Math.max(0, scrollLeftRef.current + deltaX);
      const newWindow = getWindow(
        scrollTopRef.current,
        scrollLeftRef.current,
        scaledGrid,
        canvasSize,
      );
      onScrollViewWindow(newWindow);
      updateContainerRect();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
    // biome-ignore lint/correctness/useExhaustiveDependencies: updateContainerRect stable
  }, [scaledGrid, canvasSize, onScrollViewWindow, updateContainerRect]);

  // Initialize container rect and listen for resize using ResizeObserver
  useEffect(() => {
    updateContainerRect();

    // Set initial canvas size immediately (no debouncing on mount)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    }

    // Debounced resize handler to prevent blinking during sidebar animation
    // Uses a timeout to wait for animations to complete before resizing canvas
    let resizeTimeoutId = null;
    let lastSize = { width: 0, height: 0 };

    const debouncedUpdateContainerRect = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();

      // Always update containerRectRef immediately for coordinate conversion
      containerRectRef.current = rect;

      // Check if size actually changed
      if (rect.width === lastSize.width && rect.height === lastSize.height) {
        return;
      }
      lastSize = { width: rect.width, height: rect.height };

      // Clear any pending timeout
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }

      // Wait for animation to complete before updating canvas size
      // This prevents canvas clearing during sidebar transition
      resizeTimeoutId = setTimeout(() => {
        if (containerRef.current) {
          const finalRect = containerRef.current.getBoundingClientRect();
          setCanvasSize(prev => {
            if (prev.width !== finalRect.width || prev.height !== finalRect.height) {
              return { width: finalRect.width, height: finalRect.height };
            }
            return prev;
          });
        }
        resizeTimeoutId = null;
      }, 250); // Wait 250ms for sidebar animation to complete
    };

    // Use ResizeObserver for more accurate container resize detection (e.g., sidebar collapse)
    const resizeObserver = new ResizeObserver(() => {
      debouncedUpdateContainerRect();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen to window resize as a fallback
    window.addEventListener('resize', debouncedUpdateContainerRect);

    return () => {
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', debouncedUpdateContainerRect);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: updateContainerRect stable
  }, [updateContainerRect]);

  // Load images into cache for canvas rendering
  useEffect(() => {
    let _needsUpdate = false;

    images.forEach(imgData => {
      if (!imageElementCacheRef.current[imgData.id]) {
        const img = new Image();
        img.src = imgData.src;
        img.onload = () => {
          imageElementCacheRef.current[imgData.id] = img;
          // Trigger re-render to draw the loaded image
          setImageLoadTrigger(prev => prev + 1);
        };
        _needsUpdate = true;
      }
    });

    // Clean up cache for deleted images
    const currentIds = new Set(images.map(img => img.id));
    Object.keys(imageElementCacheRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        delete imageElementCacheRef.current[id];
      }
    });
  }, [images]);

  // Auto calculate row heights when cells change or viewWindow changes (scroll)
  useEffect(() => {
    if (!gridCanvasRef.current || !cells || Object.keys(cells).length === 0) {
      return;
    }

    // Prevent recalculation if we just updated the grid
    if (isCalculatingHeightRef.current) {
      isCalculatingHeightRef.current = false;
      return;
    }

    const cellsStr = JSON.stringify(cells);
    const cellsChanged = prevCellsRef.current !== cellsStr;

    // Clear cache when cells change
    if (cellsChanged) {
      calculatedRowsRef.current = new Set();
      prevCellsRef.current = cellsStr;
    }

    // Check if current viewWindow has uncalculated rows
    const hasUncalculatedRows = range(viewWindow.startRow, viewWindow.endRow).some(
      rowIndex => !calculatedRowsRef.current.has(rowIndex),
    );

    // Skip calculation if no changes needed
    if (!cellsChanged && !hasUncalculatedRows) {
      return;
    }

    const ctx = gridCanvasRef.current.getContext('2d');
    const updatedGrid = recalculateRowHeightsForGrid({
      ctx,
      cells,
      grid,
      affectedColIndex: null,
      viewWindow,
      calculatedRows: calculatedRowsRef.current,
      onlyNewRows: !cellsChanged, // When cells changed, recalculate all; otherwise only new rows
    });

    // Update cache: mark current viewWindow rows as calculated
    range(viewWindow.startRow, viewWindow.endRow).forEach(rowIndex => {
      calculatedRowsRef.current.add(rowIndex);
    });

    if (updatedGrid !== grid) {
      isCalculatingHeightRef.current = true;
      onNewGrid(updatedGrid);
    }
  }, [cells, grid, onNewGrid, viewWindow]);

  useEffect(() => {
    if (grid?.sheetName) {
      const newWindow = getWindow(
        scrollTopRef.current,
        scrollLeftRef.current,
        scaledGrid,
        canvasSize,
      );
      onScrollViewWindow(newWindow);
      return;
    }
    const { width, height } = containerRef.current.getBoundingClientRect();
    setCanvasSize({ width, height });

    const initialWindow = getWindow(0, 0, scaledGrid, { width, height });
    onScrollViewWindow(initialWindow);
  }, [canvasSize, grid?.sheetName, onScrollViewWindow, scaledGrid]);

  // Recalculate view window when canvas size changes (e.g., sidebar collapse/expand)
  useEffect(() => {
    if (!containerRef.current || !grid?.sheetName) return;
    const newWindow = getWindow(
      scrollTopRef.current,
      scrollLeftRef.current,
      scaledGrid,
      canvasSize,
    );
    onScrollViewWindow(newWindow);
  }, [
    canvasSize.width,
    canvasSize.height,
    grid?.sheetName,
    onScrollViewWindow,
    canvasSize,
    scaledGrid,
  ]);

  // Image interaction handlers
  const handleImageMouseDown = (e, imageId) => {
    e.stopPropagation();
    setSelectedImageId(imageId);
    const image = currentImages.find(img => img.id === imageId);
    if (!image) return;

    setImageDragInfo({
      type: 'move',
      imageId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originalX: image.x,
      originalY: image.y,
    });
  };

  const handleResizeHandleMouseDown = (e, imageId, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedImageId(imageId);
    const image = currentImages.find(img => img.id === imageId);
    if (!image) return;

    setImageDragInfo({
      type: 'resize',
      imageId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originalX: image.x,
      originalY: image.y,
      originalWidth: image.width,
      originalHeight: image.height,
    });
  };

  // Deselect cell when user clicks outside the Excel component entirely
  useEffect(() => {
    const handleOutsideClick = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setSelectedCellLocation('');
        setIsEditing(false);
        setDragStartLocation('');
        setDragEndLocation('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Reset valueToEdit whenever selected cell changes — prevents carryover of previous typed value
  useEffect(() => {
    setValueToEdit(
      cells?.[selectedCellLocation]?.formula || cells?.[selectedCellLocation]?.value || '',
    );
  }, [selectedCellLocation, cells]);

  // Drawing useEffect - should NOT affect edit state
  // Uses double-buffering to prevent canvas blinking during resize
  useEffect(() => {
    const visibleCanvas = gridCanvasRef.current;
    if (!visibleCanvas) return;

    const width = visibleCanvas.width;
    const height = visibleCanvas.height;

    // Skip drawing if canvas has no dimensions (prevents drawImage error)
    if (width === 0 || height === 0) return;

    // Create or resize offscreen canvas for double-buffering
    if (
      !offscreenCanvasRef.current ||
      offscreenCanvasRef.current.width !== width ||
      offscreenCanvasRef.current.height !== height
    ) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = width;
      offscreenCanvasRef.current.height = height;
    }

    const offscreenCtx = offscreenCanvasRef.current.getContext('2d');

    // Draw everything to offscreen canvas first
    drawCells({
      ctx: offscreenCtx,
      window: viewWindow,
      grid: scaledGrid,
      cells,
      selectedCellLocation,
      labels,
      editingCellLocation: isEditing ? selectedCellLocation : null,
      mergedSlaveMap,
      mergedMasterMap,
    });

    // Draw images on offscreen canvas (non-selected images only)
    drawImages({
      ctx: offscreenCtx,
      images: currentImages,
      selectedImageId,
      imageElementCache: imageElementCacheRef.current,
      viewWindow,
      grid: scaledGrid,
    });

    // Copy offscreen canvas to visible canvas in one operation (prevents blinking)
    const visibleCtx = visibleCanvas.getContext('2d');
    visibleCtx.clearRect(0, 0, width, height);
    visibleCtx.drawImage(offscreenCanvasRef.current, 0, 0);

    // Draw overlay separately (it's on a different canvas)
    drawRegion({
      ctx: overlayCanvasRef.current.getContext('2d'),
      grid: scaledGrid,
      window: viewWindow,
      dragStartLocation,
      dragEndLocation,
      isEditing,
    });

    // Update container rect for coordinate conversion
    updateContainerRect();
  }, [
    selectedCellLocation,
    selectedImageId,
    isEditing,
    cells,
    currentImages,
    dragEndLocation,
    dragStartLocation,
    labels,
    mergedMasterMap,
    mergedSlaveMap,
    scaledGrid, // Update container rect for coordinate conversion
    // biome-ignore lint/correctness/useExhaustiveDependencies: updateContainerRect stable
    updateContainerRect,
    viewWindow,
  ]);

  // Global mouse events for image dragging
  useEffect(() => {
    const handleGlobalMouseMove = e => {
      if (!imageDragInfo) return;

      setImageDragInfo(prev => ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
      }));
    };

    const handleGlobalMouseUp = _e => {
      if (imageDragInfo) {
        // Calculate final state based on the current images derived state
        // However, currentImages inside this closure might be stale if we don't include it in deps
        // But since we want to avoid re-attaching listeners on every move, we can't easily rely on currentImages closure
        // So we recalculate the final state here using the latest drag info

        // Actually, since we have currentImages in the scope and it updates via useMemo when imageDragInfo updates,
        // we can just use currentImages if we include it in deps.
        // But including it in deps causes re-bind on every frame.
        // Let's assume onNewImagesToPatch can handle the update.

        // Wait, handleGlobalMouseUp is a closure. It captures currentImages at the time of binding.
        // If we don't rebind, currentImages is stale (initial state).
        // Since we are updating imageDragInfo, and imageDragInfo is in deps, this effect runs on every move anyway!
        // So currentImages IS fresh.
        onNewImagesToPatch(currentImages);
        setImageDragInfo(null);
      }
    };

    if (imageDragInfo) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [
    imageDragInfo,
    currentImages, // Calculate final state based on the current images derived state
    // However, currentImages inside this closure might be stale if we don't include it in deps
    // But since we want to avoid re-attaching listeners on every move, we can't easily rely on currentImages closure
    // So we recalculate the final state here using the latest drag info

    // Actually, since we have currentImages in the scope and it updates via useMemo when imageDragInfo updates,
    // we can just use currentImages if we include it in deps.
    // But including it in deps causes re-bind on every frame.
    // Let's assume onNewImagesToPatch can handle the update.

    // Wait, handleGlobalMouseUp is a closure. It captures currentImages at the time of binding.
    // If we don't rebind, currentImages is stale (initial state).
    // Since we are updating imageDragInfo, and imageDragInfo is in deps, this effect runs on every move anyway!
    // So currentImages IS fresh.
    onNewImagesToPatch,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // biome-ignore lint/correctness/useExhaustiveDependencies: onKeyDown stable
  }, [onKeyDown]);

  useEffect(() => {
    const ctx = gridCanvasRef.current.getContext('2d');

    if (!isEditing) {
      drawCells({
        ctx,
        window: viewWindow,
        grid: scaledGrid,
        cells,
        selectedCellLocation,
        cellLocationToColor: {},
        labels,
        mergedSlaveMap,
        mergedMasterMap,
      });
      // Draw images after cells
      drawImages({
        ctx,
        images: currentImages,
        selectedImageId,
        imageElementCache: imageElementCacheRef.current,
        viewWindow,
        grid: scaledGrid,
      });
      return;
    }

    const cellLocationToColor = getCellLocationToColorMap(valueToEdit);
    drawCells({
      ctx,
      window: viewWindow,
      grid: scaledGrid,
      cells,
      selectedCellLocation,
      cellLocationToColor,
      labels,
      editingCellLocation: selectedCellLocation,
      mergedSlaveMap,
      mergedMasterMap,
    });
    // Draw images after cells
    drawImages({
      ctx,
      images: currentImages,
      selectedImageId,
      imageElementCache: imageElementCacheRef.current,
      viewWindow,
      grid: scaledGrid,
    });
  }, [
    isEditing,
    valueToEdit,
    selectedCellLocation,
    selectedImageId,
    cells,
    currentImages,
    labels,
    mergedMasterMap,
    mergedSlaveMap,
    scaledGrid,
    viewWindow,
  ]);

  useEffect(() => {
    const ctx = overlayCanvasRef.current.getContext('2d');
    drawRegion({
      ctx,
      grid: scaledGrid,
      window: viewWindow,
      dragStartLocation,
      dragEndLocation,
      isEditing,
    });
    if (fillDragEndLocation && selectedCellLocation) {
      drawFillRange({
        ctx,
        grid: scaledGrid,
        window: viewWindow,
        sourceLocation: selectedCellLocation,
        targetLocation: fillDragEndLocation,
      });
    }
  }, [
    dragStartLocation,
    dragEndLocation,
    fillDragEndLocation,
    selectedCellLocation,
    isEditing,
    scaledGrid,
    viewWindow,
  ]);

  const handleImageUpload = event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        // Default size: 50% of original, but max 400px
        const defaultWidth = Math.min(img.width * 0.5, 400);
        const defaultHeight = (img.height / img.width) * defaultWidth;

        // Calculate absolute position based on current viewWindow
        // Display position = center of viewport
        const displayX = (canvasSize.width - defaultWidth) / 2;
        const displayY = (canvasSize.height - defaultHeight) / 2;

        // Convert display position to absolute position (relative to entire sheet)
        const viewOffset = getViewWindowPixelOffset(viewWindow, scaledGrid);
        const absoluteX = displayX + viewOffset.offsetX - X_OFFSET;
        const absoluteY = displayY + viewOffset.offsetY - Y_OFFSET;

        const newImageData = {
          id: crypto.randomUUID(),
          name: file.name,
          src: e.target.result,
          x: Math.max(0, absoluteX),
          y: Math.max(0, absoluteY),
          width: defaultWidth,
          height: defaultHeight,
          zIndex: images.length,
          isLocked: false,
        };

        const updatedImages = [...images, newImageData];
        onNewImagesToPatch(updatedImages);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Check if click position hits any image (for canvas-rendered images)
  const getClickedImageId = (clientX, clientY) => {
    const containerRect = containerRectRef.current;
    if (!containerRect) return null;

    // Convert screen coords to storage coords
    const { x: storageX, y: storageY } = screenToStorage(
      clientX,
      clientY,
      viewWindow,
      scaledGrid,
      containerRect,
    );

    // Check images in reverse order (top-most first based on zIndex)
    const sortedImages = [...currentImages].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    for (const img of sortedImages) {
      if (img.id === selectedImageId) continue; // Skip already selected image (it's DOM)

      if (
        storageX >= img.x &&
        storageX <= img.x + img.width &&
        storageY >= img.y &&
        storageY <= img.y + img.height
      ) {
        return img.id;
      }
    }

    return null;
  };

  const onCanvasMouseDown = e => {
    // Don't interfere with image interactions (selected image as DOM element)
    if (e.target.closest('[data-image-container]')) {
      // Clear cell editing when interacting with image
      setIsEditing(false);
      return;
    }

    // Check if clicked on a canvas-rendered image
    const clickedImageId = getClickedImageId(e.clientX, e.clientY);
    if (clickedImageId) {
      const image = currentImages.find(img => img.id === clickedImageId);
      if (image) {
        e.stopPropagation();
        // Clear cell editing when selecting an image
        setIsEditing(false);
        setSelectedImageId(clickedImageId);
        setImageDragInfo({
          type: 'move',
          imageId: clickedImageId,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
          originalX: image.x,
          originalY: image.y,
        });
        return;
      }
    }

    setDragStartLocation('');
    setDragEndLocation('');
    setIsMouseDown(true);
    const rawMouseLocation = getCellLocationFromOffset(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      scaledGrid,
      viewWindow,
    );
    // Remap slave cells to their master so clicking anywhere in a merge selects the master
    const mouseLocation = mergedSlaveMap[rawMouseLocation] ?? rawMouseLocation;

    // Deselect image when clicking on canvas (not on an image)
    if (selectedImageId) {
      setSelectedImageId(null);
    }

    const nearestBoundaryColumnIndex = getNearestBoundaryColumnIndex({
      e,
      grid: scaledGrid,
      viewWindow,
    });
    if (!isNil(nearestBoundaryColumnIndex)) {
      setColumnResizeIndex(nearestBoundaryColumnIndex);
      setColumnResizeStartX(e.nativeEvent.offsetX);
    }

    const nearestBoundaryRowIndex = getNearestBoundaryRowIndex({
      e,
      grid: scaledGrid,
      viewWindow,
    });
    if (!isNil(nearestBoundaryRowIndex)) {
      setRowResizeIndex(nearestBoundaryRowIndex);
      setRowResizeStartX(e.nativeEvent.offsetY);
    }

    if (isMouseLocationColumnHeader({ mouseLocation, viewWindow })) {
      setSelectedCellLocation(mouseLocation);
      setDragStartLocation(mouseLocation);
      setDragEndLocation(mouseLocation?.replace(/[0-9]/g, '100000'));
      return;
    }

    if (isMouseLocationRowHeader({ mouseLocation, viewWindow })) {
      setSelectedCellLocation(mouseLocation);
      setDragStartLocation(mouseLocation);
      setDragEndLocation(`${mouseLocation?.match(/\d+/)?.[0]}ZZZZZZ`);
      return;
    }

    if (
      typeof valueToEdit === 'string' &&
      isInMiddleOfFormula(valueToEdit) &&
      mouseLocation !== selectedCellLocation
    ) {
      setIsEditing(true);
      setDragStartLocation(mouseLocation);
      return;
    }

    // Enter edit mode on double-click OR when clicking an already-selected cell
    const now = Date.now();
    const isDoubleClick =
      now - lastClickRef.current.time < 300 && lastClickRef.current.location === mouseLocation;
    const isReClickOnSelected = !isEditing && mouseLocation === selectedCellLocation;

    if (isDoubleClick || isReClickOnSelected) {
      setIsEditing(true);
      setDragEndLocation('');
      lastClickRef.current = { time: 0, location: '' };
    } else {
      if (mouseLocation !== selectedCellLocation) {
        setIsEditing(false);
      }
      lastClickRef.current = { time: now, location: mouseLocation };
    }

    setSelectedCellLocation(mouseLocation);
    setDragStartLocation(mouseLocation);
  };

  const onCanvasMouseUp = e => {
    if (!isNil(columnResizeIndex)) {
      let newGrid = getResizedColumnGrid({
        grid,
        columnResizeIndex,
        columnResizeAmount,
      });

      // Clear cache because column width change affects wrap text calculation for all rows
      calculatedRowsRef.current = new Set();

      // After column resize, recalculate row heights for affected rows
      const ctx = gridCanvasRef.current.getContext('2d');
      newGrid = recalculateRowHeightsForGrid({
        ctx,
        cells,
        grid: newGrid,
        affectedColIndex: columnResizeIndex,
      });

      onNewGrid(newGrid);
    }

    if (!isNil(rowResizeIndex)) {
      const newGrid = getResizedRowGrid({
        grid,
        rowResizeIndex,
        rowResizeAmount,
      });
      onNewGrid(newGrid);
    }

    setColumnResizeIndex(null);
    setColumnResizeAmount(null);
    setColumnResizeStartX(null);

    setRowResizeIndex(null);
    setRowResizeAmount(null);
    setRowResizeStartX(null);

    // Clear the overlay canvas to remove resize indicator lines, then redraw selection region
    const mouseLocation = getCellLocationFromOffset(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      scaledGrid,
      viewWindow,
    );

    // Update dragEndLocation with final mouse position
    if (dragStartLocation && mouseLocation !== dragStartLocation) {
      setDragEndLocation(mouseLocation);
    }

    if (overlayCanvasRef.current) {
      drawRegion({
        ctx: overlayCanvasRef.current.getContext('2d'),
        window: viewWindow,
        grid: scaledGrid,
        dragStartLocation,
        dragEndLocation: mouseLocation,
        isEditing,
      });
    }

    setIsMouseDown(false);

    if (
      isInMiddleOfFormula(valueToEdit) &&
      mouseLocation !== selectedCellLocation &&
      mouseLocation !== 'A0'
    ) {
      const formulaPart = valueToEdit?.match(/=.*\(/g)?.[0];
      let argsPart = mouseLocation;
      if (mouseLocation !== dragStartLocation) {
        argsPart = `${dragStartLocation}:${mouseLocation}`;
      }

      setValueToEdit(`${formulaPart}${argsPart}`);
    }

    if (dragStartLocation === mouseLocation && !isInMiddleOfFormula(valueToEdit)) {
      setSelectedCellLocation(mouseLocation);
      return;
    }
  };

  const onCanvasMouseMove = e => {
    containerRef.current.style.cursor = 'default';
    const nearestBoundaryColumnIndex = getNearestBoundaryColumnIndex({
      e,
      grid: scaledGrid,
      viewWindow,
    });
    if (!isNil(nearestBoundaryColumnIndex)) {
      containerRef.current.style.cursor = 'col-resize';
    }
    if (!isNil(columnResizeIndex)) {
      const newResizeAmount = e.nativeEvent.offsetX - columnResizeStartX;
      setColumnResizeAmount(newResizeAmount);

      const boundaryX = getColumnX(columnResizeIndex + 1, scaledGrid, viewWindow) * SF;

      drawVerticalLine({
        ctx: overlayCanvasRef.current.getContext('2d'),
        x: boundaryX + newResizeAmount * SF,
      });
    }

    const nearestBoundaryRowIndex = getNearestBoundaryRowIndex({
      e,
      grid: scaledGrid,
      viewWindow,
    });
    if (!isNil(nearestBoundaryRowIndex)) {
      containerRef.current.style.cursor = 'row-resize';
    }
    if (!isNil(rowResizeIndex)) {
      const newResizeAmount = e.nativeEvent.offsetY - rowResizeStartX;
      setRowResizeAmount(newResizeAmount);

      const boundaryY = getRowY(rowResizeIndex + 1, scaledGrid, viewWindow) * SF;

      drawHorizontalLine({
        ctx: overlayCanvasRef.current.getContext('2d'),
        y: boundaryY + newResizeAmount * SF,
      });
    }

    if (!isMouseDown || isEditing) {
      return;
    }

    const mouseLocation = getCellLocationFromOffset(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      scaledGrid,
      viewWindow,
    );
    setDragEndLocation(mouseLocation);
  };

  const onKeyDown = e => {
    // Don't intercept keypresses that belong to other inputs (e.g. chat prompt)
    const activeEl = document.activeElement;
    if (activeEl && activeEl !== document.body && !rootRef.current?.contains(activeEl)) {
      return;
    }

    if (isEditing && e.key === 'Escape') {
      setIsEditing(false);
      return;
    }

    if (e.key.length === 1 && !isEditing && selectedCellLocation) {
      setIsEditing(true);
      return;
    }

    // Delete selected image with Backspace or Delete key
    if (!isEditing && (e.key === 'Backspace' || e.key === 'Delete') && selectedImageId) {
      e.preventDefault();
      const updatedImages = images.filter(img => img.id !== selectedImageId);
      onNewImagesToPatch(updatedImages);
      setSelectedImageId(null);
      return;
    }

    if (!isEditing && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      let cellLocations = [selectedCellLocation];
      if (dragEndLocation !== '') {
        cellLocations = getArrayOfCellLocationsFromSelection(
          `${dragStartLocation}:${dragEndLocation}`,
        );
      }
      const body = {};
      cellLocations.forEach(cellLocation => {
        body[cellLocation] = {
          value: '',
          formula: '',
          dataType: 'STRING',
        };
      });
      onNewCellToPatch(body);
      // Clear selection after delete
      setDragEndLocation('');
      return;
    }

    if (
      !CONTROL_KEYS.includes(e.key) ||
      !selectedCellLocation ||
      (isEditing && e.key !== 'Enter')
    ) {
      return;
    }

    if (e.key === 'Enter') {
      if (isPatching) {
        return;
      }

      if (isEditing) {
        const valueToEditToPatch = valueToEdit;
        // if (isInMiddleOfFormula(valueToEdit)) {
        //   valueToEditToPatch = `${valueToEdit})`;
        // }
        const cellLocationToNewCell = {
          [selectedCellLocation]: getUpdatedCellFromInputValue(
            valueToEditToPatch,
            cells?.[selectedCellLocation],
          ),
        };
        onNewCellToPatch(cellLocationToNewCell);
        setIsEditing(false);
        // Clear drag selection when exiting edit mode
        setDragStartLocation('');
        setDragEndLocation('');
      }
    }

    e.preventDefault();

    let rowIndex = selectedCellLocation?.match(/\d+/)?.[0] - 1;
    let columnIndex = ALPHABET_EXTENDED.indexOf(selectedCellLocation?.match(/[A-Z]+/)?.[0]);

    if (e.key === 'ArrowUp') {
      rowIndex--;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      rowIndex++;
    }
    if (e.key === 'ArrowLeft') {
      columnIndex--;
    }
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      columnIndex++;
    }

    const newSelectedCellLocation = `${ALPHABET_EXTENDED[columnIndex]}${rowIndex + 1}`;
    setSelectedCellLocation(newSelectedCellLocation);
  };

  const updateAndPatchSelectedCell = fieldsToUpdateOrCallback => {
    // Check if there's a multi-selection
    let cellLocations = [selectedCellLocation];
    if (dragEndLocation !== '') {
      // Handle full row selection (e.g., "2ZZZZZZ")
      if (dragEndLocation?.includes('ZZZZZZ')) {
        const rowNumber = parseInt(dragStartLocation?.match(/\d+/)?.[0], 10);
        // Get max column index from cells
        const maxColIndex = Math.max(
          ...Object.keys(cells).map(id => {
            const colLetter = id.match(/[A-Z]+/)?.[0];
            return ALPHABET_EXTENDED.indexOf(colLetter);
          }),
          viewWindow?.endCol || 30,
        );
        // Generate all cell locations for this row
        cellLocations = range(0, maxColIndex + 1).map(colIndex => {
          return `${ALPHABET_EXTENDED[colIndex]}${rowNumber}`;
        });
      }
      // Handle full column selection (e.g., "A100000")
      else if (dragEndLocation?.includes('100000')) {
        const startColLetter = dragStartLocation?.match(/[A-Z]+/)?.[0];
        const startColIndex = ALPHABET_EXTENDED.indexOf(startColLetter);
        // Get max row index from cells
        const maxRowIndex = Math.max(
          ...Object.keys(cells).map(id => {
            return parseInt(id.match(/\d+/)?.[0], 10) - 1;
          }),
          viewWindow?.endRow || 100,
        );
        // Generate all cell locations for this column
        cellLocations = range(1, maxRowIndex + 2).map(rowNumber => {
          return `${ALPHABET_EXTENDED[startColIndex]}${rowNumber}`;
        });
      }
      // Handle normal range selection
      else {
        cellLocations = getArrayOfCellLocationsFromSelection(
          `${dragStartLocation}:${dragEndLocation}`,
        );
      }
    }

    // Apply updates to all selected cells
    const cellLocationToNewCell = {};
    cellLocations.forEach(cellLocation => {
      const existingCell = cells?.[cellLocation];

      // Get fieldsToUpdate - if callback, call it for EACH cell to get cell-specific updates
      let fieldsToUpdate = fieldsToUpdateOrCallback;
      if (typeof fieldsToUpdateOrCallback === 'function') {
        fieldsToUpdate = fieldsToUpdateOrCallback(existingCell);
      }

      const updatedCell = {
        ...existingCell,
        ...fieldsToUpdate,
      };
      // Ensure all cells have a value field so they can be patched to backend
      // Use a space character " " as the backend requires a non-empty value for new cells
      if (updatedCell.value === undefined || updatedCell.value === '') {
        updatedCell.value = ' ';
      }
      cellLocationToNewCell[cellLocation] = updatedCell;
    });
    onNewCellToPatch(cellLocationToNewCell);
  };

  const getCurrentSelection = () => {
    let cellLocations = [selectedCellLocation];
    if (dragEndLocation !== '') {
      if (dragEndLocation?.includes('ZZZZZZ')) {
        const rowNumber = parseInt(dragStartLocation?.match(/\d+/)?.[0], 10);
        const maxColIndex = Math.max(
          ...Object.keys(cells).map(id => {
            const colLetter = id.match(/[A-Z]+/)?.[0];
            return ALPHABET_EXTENDED.indexOf(colLetter);
          }),
          viewWindow?.endCol || 30,
        );
        cellLocations = range(0, maxColIndex + 1).map(colIndex => {
          return `${ALPHABET_EXTENDED[colIndex]}${rowNumber}`;
        });
      } else if (dragEndLocation?.includes('100000')) {
        const startColLetter = dragStartLocation?.match(/[A-Z]+/)?.[0];
        const startColIndex = ALPHABET_EXTENDED.indexOf(startColLetter);
        const maxRowIndex = Math.max(
          ...Object.keys(cells).map(id => {
            return parseInt(id.match(/\d+/)?.[0], 10) - 1;
          }),
          viewWindow?.endRow || 100,
        );
        cellLocations = range(1, maxRowIndex + 2).map(rowNumber => {
          return `${ALPHABET_EXTENDED[startColIndex]}${rowNumber}`;
        });
      } else {
        cellLocations = getArrayOfCellLocationsFromSelection(
          `${dragStartLocation}:${dragEndLocation}`,
        );
      }
    }
    return cellLocations.filter(loc => !!loc);
  };

  const selectedCell = cells?.[selectedCellLocation];

  const columnIndex = ALPHABET_EXTENDED.indexOf(selectedCellLocation?.match(/[A-Z]+/)?.[0]);
  const cellWidth = scaledGrid?.columnIndexToWidth?.[columnIndex] ?? 100;

  const handleResetGrid = () => {
    const resetGrid = {
      ...grid,
      columnIndexToWidth: {},
      rowIndexToHeight: {},
    };
    onNewGrid(resetGrid);
  };

  return (
    <Container ref={rootRef}>
      {showToolbar && (
        <ExcelToolbar
          selectedCell={selectedCell}
          grid={grid}
          labels={labels}
          extraLabels={extraLabels}
          currentSelection={getCurrentSelection()}
          onUpdateAndPatchSelectedCell={updateAndPatchSelectedCell}
          onSaveLabel={onSaveLabel}
          onImageUpload={handleImageUpload}
          onInsertFunction={handleInsertFunction}
          onResetGrid={handleResetGrid}
          mergedMasterMap={mergedMasterMap}
          selectedCellLocation={selectedCellLocation}
          dragStartLocation={dragStartLocation}
          dragEndLocation={dragEndLocation}
          onMergeCells={onMergeCells}
        />
      )}
      {useMSFormulaBar ? (
        <MSExcelFormulaBar
          selectedCellLocation={selectedCellLocation}
          valueToEdit={valueToEdit}
          isEditing={isEditing}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onChangeValue={newValue => setValueToEdit(newValue)}
        />
      ) : (
        <FormulaBar>
          <CellLocSpan>{selectedCellLocation}</CellLocSpan>
          <FormulaIconWrapper>
            <FormulaIcon height="16px" />
          </FormulaIconWrapper>
          <FormulaInputWrapper>
            <ExcelTextInputWithFormulaDropdownBorderLeft
              value={valueToEdit}
              isDisabled={!selectedCellLocation}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
              onChangeValue={newValue => setValueToEdit(newValue)}
            />
          </FormulaInputWrapper>
        </FormulaBar>
      )}

      <CellsContainer
        ref={containerRef}
        onMouseDown={onCanvasMouseDown}
        onMouseUp={onCanvasMouseUp}
        onMouseMove={onCanvasMouseMove}
      >
        <TopLeftCorner />

        {selectedCell?.flowLink && (
          <SrcTriggerContainer
            style={{
              ...getSelectedCellStyle(selectedCellLocation, scaledGrid, viewWindow, 0, 0),
              position: 'absolute',
              zIndex: 1,
            }}
          >
            <IconContainer
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();

                const url = selectedCell?.flowLink || '';
                const fileId = url?.match(/file\/(.*)\?/)?.[1];
                const pageNumber = url?.match(/pageNumber=(.*)/)?.[1];

                setModalTableDocumentLocation({
                  fileId,
                  pageNumber,
                });
              }}
            >
              <PdfIcon />
            </IconContainer>
          </SrcTriggerContainer>
        )}

        {isEditing && valueToEdit?.[0] !== '/' && (
          <ExcelTextInputWithFormulaDropdown
            value={valueToEdit}
            onChangeValue={newValue => setValueToEdit(newValue)}
            style={{
              ...getSelectedCellStyle(selectedCellLocation, scaledGrid, viewWindow, 0, 0),
              position: 'absolute',
              outline: '2px solid rgba(0, 128, 0, 0.5)',
              outlineOffset: '-2px',
              zIndex: 9999,
              border: 'none',
              backgroundColor: getCSSVar('--bg-primary'),
              width: 'fit-content',
            }}
            cellWidth={cellWidth}
            autoFocus
            onMouseDown={e => e.stopPropagation()}
          />
        )}

        {isEditing && valueToEdit?.[0] === '/' && (
          <StyledSearchInput
            placeholder=""
            style={{
              ...getSelectedCellStyle(selectedCellLocation, scaledGrid, viewWindow, 0, 0),
              position: 'absolute',
              outline: '2px solid rgba(0, 128, 0, 0.5)',
              outlineOffset: '-2px',
              zIndex: 9999,
              border: 'none',
              width: '300px',
              backgroundColor: getCSSVar('--bg-primary'),
            }}
            dropdownOptionStyle={{
              padding: '4px',
              paddingLeft: '8px',
            }}
            bgColor={getCSSVar('--bg-primary')}
            borderWidth={1}
            autoFocus
            onPressEnter={userNLCommand => {
              onNewCellToPatch({
                [selectedCellLocation]: {
                  value: `/${userNLCommand}`,
                },
              });
            }}
            recommendationType="excel"
          />
        )}

        <GridCanvas
          viewportWidth={canvasSize?.width}
          viewportHeight={canvasSize?.height}
          width={canvasSize?.width * SF}
          height={canvasSize?.height * SF}
          ref={gridCanvasRef}
        />

        <OverlayCanvas
          viewportWidth={canvasSize?.width}
          viewportHeight={canvasSize?.height}
          width={canvasSize?.width * SF}
          height={canvasSize?.height * SF}
          ref={overlayCanvasRef}
        />

        {/* Fill handle — small square at bottom-right of selected cell */}
        {fillHandlePos && (
          <div
            onMouseDown={handleFillHandleMouseDown}
            style={{
              position: 'absolute',
              left: fillHandlePos.x - 4,
              top: fillHandlePos.y - 4,
              width: 8,
              height: 8,
              background: 'var(--accent-blue)',
              border: '1.5px solid white',
              borderRadius: 1,
              cursor: 'crosshair',
              zIndex: 15,
              boxSizing: 'border-box',
            }}
          />
        )}

        {/* Render only selected image as DOM element for interaction */}
        {/* Non-selected images are rendered on canvas */}
        {selectedImageId &&
          (() => {
            const imgData = currentImages.find(img => img.id === selectedImageId);
            if (!imgData) return null;

            return (
              <SelectedImageContainer
                imgData={imgData}
                viewWindow={viewWindow}
                grid={grid}
                containerRect={containerRectRef.current}
                onImageMouseDown={handleImageMouseDown}
                onResizeHandleMouseDown={handleResizeHandleMouseDown}
              />
            );
          })()}
      </CellsContainer>
    </Container>
  );
};

export default ExcelViewSheetArea;
