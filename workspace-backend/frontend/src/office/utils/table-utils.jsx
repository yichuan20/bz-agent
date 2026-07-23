import { cloneDeep } from 'lodash';
import {
  C_START,
  END_X,
  LINE_HEIGHT,
  PAD,
  R_START,
  START_X,
  T_END,
  T_START,
} from './word-constants';
import { getNumberOfColumns } from './word-table-utils';

/**
 * Find the cell at a given click position
 * @param {number} clickX - Click X coordinate (already scaled by SF)
 * @param {number} clickY - Click Y coordinate (already scaled by SF, with scrollY added)
 * @param {string} text - Document text
 * @param {number[]} xs - X coordinates of each character
 * @param {number[]} ys - Y coordinates of each character
 * @returns {{ tStartIndex, rowIndex, columnIndex, numRows, numColumns, tableArray } | null}
 */
export const getCellAtClick = (clickX, clickY, text, xs, ys) => {
  if (!text || !xs?.length || !ys?.length) {
    return null;
  }

  let i = 0;
  while (i < text.length) {
    if (text[i] !== T_START) {
      i++;
      continue;
    }

    const tStartIndex = i;
    const tStartY = ys[i];

    const tEndIndex = text.indexOf(T_END, i + 1);

    if (tEndIndex === -1) {
      break;
    }

    const tEndY = ys[tEndIndex];

    // Skip table if its positions are outside the rendered viewport (undefined) or out of click range
    if (
      tStartY == null ||
      tEndY == null ||
      clickY < tStartY - LINE_HEIGHT ||
      clickY > tEndY + PAD + LINE_HEIGHT
    ) {
      i = tEndIndex + 1;
      continue;
    }

    const numColumns = getNumberOfColumns({ text, tStartI: tStartIndex });
    const columnWidth = (END_X - START_X) / numColumns;

    if (clickX >= START_X && clickX <= END_X) {
      const columnIndex = Math.floor((clickX - START_X) / columnWidth);
      const clampedColumnIndex = Math.max(0, Math.min(numColumns - 1, columnIndex));

      let rowIndex = 0;
      let rowCount = 0;

      const rowYRanges = [];
      let rowStartY = null;
      let maxRowY = tStartY;

      for (let k = tStartIndex; k <= tEndIndex; k++) {
        if (text[k] === R_START) {
          if (rowStartY !== null) {
            rowYRanges.push({ startY: rowStartY - LINE_HEIGHT + PAD, endY: maxRowY + PAD });
          }
          rowStartY = maxRowY + LINE_HEIGHT;
          maxRowY = rowStartY;
          rowCount++;
        } else if (text[k] === C_START || text[k] === T_END) {
          if (ys[k]) {
            maxRowY = Math.max(maxRowY, ys[k]);
          }
        }

        if (text[k] === T_END && rowStartY !== null) {
          rowYRanges.push({ startY: rowStartY - LINE_HEIGHT + PAD, endY: maxRowY + PAD });
        }
      }

      for (let r = 0; r < rowYRanges.length; r++) {
        const range = rowYRanges[r];
        if (clickY >= range.startY && clickY <= range.endY) {
          rowIndex = r;
          break;
        }
        if (r === rowYRanges.length - 1 && clickY > range.endY) {
          rowIndex = r;
        }
      }

      rowIndex = Math.max(0, Math.min(rowCount - 1, rowIndex));

      const tableArray = parseTableTo2DArray(text, tStartIndex, tEndIndex);

      return {
        tStartIndex,
        tEndIndex,
        rowIndex,
        columnIndex: clampedColumnIndex,
        numRows: rowCount,
        numColumns,
        tableArray,
      };
    }

    i = tEndIndex + 1;
  }

  return null;
};

export const parseTableTo2DArray = (text, tStartIndex, tEndIndex) => {
  const rows = [];
  let currentRow = [];
  let currentCell = null;

  for (let i = tStartIndex; i <= tEndIndex; i++) {
    const char = text[i];

    if (char === T_START) {
      continue;
    }

    if (char === R_START) {
      if (currentCell !== null) {
        currentRow.push(currentCell);
        currentCell = null;
      }
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
      continue;
    }

    if (char === C_START) {
      if (currentCell !== null) {
        currentRow.push(currentCell);
      }
      currentCell = '';
      continue;
    }

    if (char === T_END) {
      if (currentCell !== null) {
        currentRow.push(currentCell);
      }
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      break;
    }

    if (currentCell !== null) {
      currentCell += char;
    }
  }

  return rows;
};

const arrayToTableText = arr => {
  let result = T_START;
  for (const row of arr) {
    result += R_START;
    for (const cell of row) {
      result += C_START + cell;
    }
  }
  result += T_END;
  return result;
};

const generateTableStyles = tableText => {
  return Array(tableText.length).fill(null);
};

export const getTableInfo = (text, index) => {
  if (!text || index < 0 || index >= text.length) {
    return null;
  }

  let tStartIndex = -1;
  for (let i = index; i >= 0; i--) {
    if (text[i] === T_START) {
      tStartIndex = i;
      break;
    }
    if (text[i] === T_END) {
      return null;
    }
  }
  if (tStartIndex === -1) return null;

  let tEndIndex = -1;
  for (let i = tStartIndex + 1; i < text.length; i++) {
    if (text[i] === T_END) {
      tEndIndex = i;
      break;
    }
  }
  if (tEndIndex === -1 || index > tEndIndex) return null;

  let rowIndex = -1;
  let columnIndex = -1;

  for (let i = tStartIndex; i <= index; i++) {
    if (text[i] === R_START) {
      rowIndex++;
      columnIndex = -1;
    } else if (text[i] === C_START) {
      columnIndex++;
    }
  }

  const tableArray = parseTableTo2DArray(text, tStartIndex, tEndIndex);
  const numRows = tableArray.length;
  const numColumns = tableArray[0]?.length || 0;

  if (rowIndex < 0) rowIndex = 0;
  if (columnIndex < 0) columnIndex = 0;
  if (rowIndex >= numRows) rowIndex = numRows - 1;
  if (columnIndex >= numColumns) columnIndex = numColumns - 1;

  return {
    tStartIndex,
    tEndIndex,
    rowIndex,
    columnIndex,
    numColumns,
    numRows,
    tableArray,
  };
};

/**
 * Helper: Replace table in document with new content and handle styles
 * @param {object} doc - Document object
 * @param {number} tStartIndex - Table start index in doc.text
 * @param {number} tEndIndex - Table end index in doc.text
 * @param {string[][]} newTableArray - New 2D array of table content
 */
const replaceTableInDoc = (doc, tStartIndex, tEndIndex, newTableArray) => {
  const newTableText = arrayToTableText(newTableArray);
  const newTableStyles = generateTableStyles(newTableText);

  const newDoc = cloneDeep(doc);
  newDoc.text = doc.text.slice(0, tStartIndex) + newTableText + doc.text.slice(tEndIndex + 1);

  const currentStyles = doc.styles || Array(doc.text.length).fill(null);

  newDoc.styles = [
    ...currentStyles.slice(0, tStartIndex),
    ...newTableStyles,
    ...currentStyles.slice(tEndIndex + 1),
  ];

  newDoc.selStart = tStartIndex + 2;
  newDoc.selEnd = newDoc.selStart;
  newDoc.xs = [];
  newDoc.ys = [];

  return newDoc;
};

export const deleteTableRow = (doc, tableInfo) => {
  if (!tableInfo) return doc;

  const { tStartIndex, tEndIndex, rowIndex, tableArray } = tableInfo;

  if (tableArray.length <= 1) {
    return deleteTable(doc, tableInfo);
  }

  const newArray = tableArray.map(row => [...row]);
  newArray.splice(rowIndex, 1);

  return replaceTableInDoc(doc, tStartIndex, tEndIndex, newArray);
};

export const addTableRow = (doc, tableInfo) => {
  if (!tableInfo) return doc;

  const { tStartIndex, tEndIndex, rowIndex, numColumns, tableArray } = tableInfo;

  const newArray = tableArray.map(row => [...row]);
  const newRow = Array(numColumns).fill('');
  newArray.splice(rowIndex + 1, 0, newRow);

  return replaceTableInDoc(doc, tStartIndex, tEndIndex, newArray);
};

export const addTableColumn = (doc, tableInfo) => {
  if (!tableInfo) return doc;

  const { tStartIndex, tEndIndex, columnIndex, tableArray } = tableInfo;

  const newArray = tableArray.map(row => {
    const newRow = [...row];
    newRow.splice(columnIndex + 1, 0, '');
    return newRow;
  });

  return replaceTableInDoc(doc, tStartIndex, tEndIndex, newArray);
};

export const deleteTableColumn = (doc, tableInfo) => {
  if (!tableInfo) return doc;

  const { tStartIndex, tEndIndex, columnIndex, numColumns, tableArray } = tableInfo;

  if (numColumns <= 1) {
    return deleteTable(doc, tableInfo);
  }

  const newArray = tableArray.map(row => {
    const newRow = [...row];
    newRow.splice(columnIndex, 1);
    return newRow;
  });

  return replaceTableInDoc(doc, tStartIndex, tEndIndex, newArray);
};

export const deleteTable = (doc, tableInfo) => {
  if (!tableInfo) return doc;

  const { tStartIndex, tEndIndex } = tableInfo;
  const newDoc = cloneDeep(doc);

  newDoc.text = doc.text.slice(0, tStartIndex) + doc.text.slice(tEndIndex + 1);
  newDoc.styles = [...doc.styles.slice(0, tStartIndex), ...doc.styles.slice(tEndIndex + 1)];

  newDoc.selStart = Math.min(tStartIndex, newDoc.text.length);
  newDoc.selEnd = newDoc.selStart;
  newDoc.xs = [];
  newDoc.ys = [];

  return newDoc;
};
