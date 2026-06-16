import { cloneDeep, findLastIndex, groupBy, range, round, sum, uniq } from 'lodash';
import { parseJson } from './common';

export const X_OFFSET = 42;
export const Y_OFFSET = 26;

export const DEFAULT_CELL_HEIGHT = 22;

export const ALPHABET = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
];

export const ALPHABET_EXTENDED = [
  ...ALPHABET,
  ...ALPHABET?.flatMap(letter1 => ALPHABET?.map(letter2 => letter1 + letter2)),
];

const isLetterWithinRange = (letter, startLetter, endLetter) => {
  const startLetterIndex = ALPHABET_EXTENDED.indexOf(startLetter);
  const endLetterIndex = ALPHABET_EXTENDED.indexOf(endLetter);
  const containedLetters = ALPHABET_EXTENDED.slice(startLetterIndex, endLetterIndex + 1);

  return containedLetters?.includes(letter);
};

export const isCellIdWithinSelection = (cellId, selectionStr) => {
  if (selectionStr === cellId) {
    return true;
  }

  if (!selectionStr || selectionStr?.split(':')?.length === 1) {
    return false;
  }

  const [startCellId, endCellId] = selectionStr?.split(':') || [];

  const startLetter = startCellId.match(/[A-Z]+/)?.[0];
  const startNumber = parseInt(startCellId.match(/[0-9]+/)?.[0]);

  const endLetter = endCellId?.match(/[A-Z]+/)?.[0];
  const endNumber = parseInt(endCellId.match(/[0-9]+/)?.[0]);

  const cellLetter = cellId?.match(/[A-Z]+/)?.[0];
  const cellNumber = parseInt(cellId?.match(/[0-9]+/)?.[0]);

  if (
    isLetterWithinRange(cellLetter, startLetter, endLetter) &&
    cellNumber >= startNumber &&
    cellNumber <= endNumber
  ) {
    return true;
  }

  return false;
};

export const getAllValuesOfKey = (records, fieldName) => {
  const names = records?.map(rec => rec[fieldName]);
  return uniq(names).sort();
};

export const getOffsetCellLocation = (startingLocation = 'A1', rowOffset, colOffset) => {
  const startingCol = startingLocation.match(/[A-Z]*/)[0];
  const startingRow = parseInt(startingLocation?.match(/[0-9].*/)[0]);

  const newColIndex = ALPHABET_EXTENDED.indexOf(startingCol) + colOffset;
  const newColLetter = ALPHABET_EXTENDED[newColIndex];
  const newRow = startingRow + rowOffset;

  return `${newColLetter}${newRow}`;
};

export const getSheetWithSmartRecordsFilledIn = ({
  sheet,
  upperLeftCornerLocation = 'A1',
  smartRecords,
  columnNamesInSelectedRow,
}) => {
  const newCells = { ...sheet?.cells };
  const newCellMetadata = { ...sheet?.cellMetadata };

  if (smartRecords?.length === 0) {
    return { ...sheet };
  }

  const listOfRows = [];
  const listOfTableDocumentLocations = [];
  const cellLocationsToUpdate = [];

  const idToRecords = groupBy(smartRecords, record => record?.ID);
  Object.entries(idToRecords).forEach(([id, records]) => {
    const row = columnNamesInSelectedRow?.map(colName => {
      const smartRecord = records.find(rec => rec.TOPIC?.trim() === colName?.trim());
      return smartRecord?.Value ? parseJson(smartRecord?.Value)?.Value : null;
    });

    const tableDocumentLocations = columnNamesInSelectedRow?.map(colName => {
      const smartRecord = records.find(rec => rec.TOPIC?.trim() === colName?.trim());
      return smartRecord?.Value ? parseJson(smartRecord?.Value)?.tableDocumentLocation : null;
    });

    listOfRows.push(row);
    listOfTableDocumentLocations.push(tableDocumentLocations);
  });

  let locationToFill = upperLeftCornerLocation;
  listOfRows?.forEach((row, rowIndex) => {
    row?.forEach((cellValue, colIndex) => {
      if (!cellValue) {
        return;
      }
      locationToFill = getOffsetCellLocation(upperLeftCornerLocation, rowIndex, colIndex);
      cellLocationsToUpdate?.push(locationToFill);

      newCells[locationToFill] = {
        value: cellValue,
        formula: '',
        dataType: typeof cellValue === 'number' ? 'NUMERIC' : 'STRING',
      };

      if (listOfTableDocumentLocations[rowIndex][colIndex]) {
        newCellMetadata[locationToFill] = JSON.stringify({
          tableDocumentLocation: listOfTableDocumentLocations[rowIndex][colIndex],
        });
      }
    });
  });

  return [{ ...sheet, cellMetadata: newCellMetadata, cells: newCells }, cellLocationsToUpdate];
};

export const getSheetWithTableWiped = sheet => {
  if (!sheet?.tableLocation) {
    return sheet;
  }

  const newCells = { ...sheet?.cells };
  Object.keys(newCells).forEach(cellLocation => {
    if (isCellIdWithinSelection(cellLocation, sheet?.tableLocation)) {
      newCells[cellLocation] = {
        value: '',
        formula: '',
        dataType: 'STRING',
      };
    }
  });

  return { ...sheet, cells: newCells };
};

export const getArrayOfCellLocationsFromSelection = selectionStr => {
  if (!selectionStr || selectionStr?.split(':')?.length === 1) {
    return [];
  }

  const [startCellId, endCellId] = selectionStr?.split(':') || [];

  // Extract letter and number parts properly (handles multi-letter columns like AA, AB, etc.)
  const startLetter = startCellId?.match(/[A-Z]+/)?.[0];
  const startNumber = parseInt(startCellId?.match(/\d+/)?.[0]);

  const endLetter = endCellId?.match(/[A-Z]+/)?.[0];
  const endNumber = parseInt(endCellId?.match(/\d+/)?.[0]);

  const startColIndex = ALPHABET_EXTENDED.indexOf(startLetter);
  const endColIndex = ALPHABET_EXTENDED.indexOf(endLetter);

  // Handle selection in any direction
  const minRow = Math.min(startNumber, endNumber);
  const maxRow = Math.max(startNumber, endNumber);
  const minCol = Math.min(startColIndex, endColIndex);
  const maxCol = Math.max(startColIndex, endColIndex);

  const listOfCellLocations = [];

  range(minRow, maxRow + 1).forEach(number => {
    range(minCol, maxCol + 1).forEach(letterIndex => {
      const letter = ALPHABET_EXTENDED[letterIndex];
      listOfCellLocations.push(`${letter}${number}`);
    });
  });

  return listOfCellLocations;
};

export const getArrayOfAllValuesInSelection = (sheet, selectionStr) => {
  const values = [];

  const cellLocations = getArrayOfCellLocationsFromSelection(selectionStr);

  cellLocations.sort().forEach(cellLocation => {
    values.push(sheet?.cells[cellLocation]?.value || '');
  });

  const valuesWithoutTrailingEmptyStrings = values.slice(
    0,
    findLastIndex(values, val => val !== '') + 1,
  );

  return valuesWithoutTrailingEmptyStrings;
};

export const getColumnX = (
  columnIndex,
  grid = { columnIndexToWidth: {} },
  viewWindow = { startCol: 0, endCol: 0 },
) => {
  const x = sum(
    range(viewWindow.startCol, columnIndex).map(colIndex => {
      return grid?.columnIndexToWidth?.[colIndex] ?? 100;
    }),
  );

  return X_OFFSET + x;
};

export const getRowY = (
  rowIndex,
  grid = { rowIndexToHeight: {} },
  viewWindow = { startRow: 0, endRow: 0 },
) => {
  const y = sum(
    range(viewWindow.startRow, rowIndex).map(rowIndex => {
      return grid?.rowIndexToHeight?.[rowIndex] ?? DEFAULT_CELL_HEIGHT;
    }),
  );

  return Y_OFFSET + y;
};

export const drawVerticalLine = ({ x, ctx }) => {
  ctx.clearRect(0, 0, 100000, 100000);

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#FF0000'; // RED for column resize (debugging)
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, 100000);
  ctx.stroke();
};

export const drawHorizontalLine = ({ y, ctx }) => {
  ctx.clearRect(0, 0, 100000, 100000);

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#00FF00'; // GREEN for row resize (debugging)
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(100000, y);
  ctx.stroke();
};

const getRowIndexFromOffset = (offsetY, grid, startRow) => {
  let bottomY = Y_OFFSET;
  let rowIndex = startRow;

  while (bottomY < offsetY) {
    bottomY += grid?.rowIndexToHeight?.[rowIndex] ?? DEFAULT_CELL_HEIGHT;
    rowIndex++;
  }

  return rowIndex - 1;
};

const getColIndexFromOffset = (offsetX, grid, startCol) => {
  let rightX = X_OFFSET;
  let colIndex = startCol;

  while (rightX < offsetX) {
    rightX += grid?.columnIndexToWidth?.[colIndex] ?? 100;
    colIndex++;
  }

  return colIndex - 1;
};

export const getCellLocationFromOffset = (offsetX, offsetY, grid, viewWindow) => {
  const rowIndex = getRowIndexFromOffset(offsetY, grid, viewWindow?.startRow);
  const colIndex = getColIndexFromOffset(offsetX, grid, viewWindow?.startCol);

  return `${ALPHABET_EXTENDED[colIndex] || ''}${rowIndex + 1}`;
};

export const getNearestBoundaryColumnIndex = ({ e, grid, viewWindow }) => {
  const mouseLocation = getCellLocationFromOffset(
    e.nativeEvent.offsetX,
    e.nativeEvent.offsetY,
    grid,
    viewWindow,
  );
  const rowIndex = mouseLocation?.match(/\d+/)?.[0] - 1;
  if (rowIndex !== -1) {
    return null;
  }

  let nearestColumnIndex = null;
  range(viewWindow?.startCol, viewWindow?.endCol + 1).forEach(colIndex => {
    const x = getColumnX(colIndex, grid, viewWindow);
    if (Math.abs(x - e.nativeEvent.offsetX) < 10) {
      nearestColumnIndex = colIndex - 1;
    }
  });

  // Return null if result would be negative (can't resize row header column)
  return nearestColumnIndex >= 0 ? nearestColumnIndex : null;
};

export const getResizedColumnGrid = ({ grid, columnResizeIndex, columnResizeAmount }) => {
  const newGrid = cloneDeep(grid);
  if (!newGrid.columnIndexToWidth) {
    newGrid.columnIndexToWidth = {};
  }

  let newWidth = (newGrid.columnIndexToWidth[columnResizeIndex] || 100) + columnResizeAmount;
  newWidth = Math.max(newWidth, 10);

  newGrid.columnIndexToWidth[columnResizeIndex] = round(newWidth);

  // Clean up any negative indices that may have been added previously
  Object.keys(newGrid.columnIndexToWidth).forEach(key => {
    if (parseInt(key) < 0) {
      delete newGrid.columnIndexToWidth[key];
    }
  });

  return newGrid;
};

export const getNearestBoundaryRowIndex = ({ e, grid, viewWindow }) => {
  const mouseLocation = getCellLocationFromOffset(
    e.nativeEvent.offsetX,
    e.nativeEvent.offsetY,
    grid,
    viewWindow,
  );
  const colIndex = ALPHABET_EXTENDED.indexOf(mouseLocation?.match(/[A-Z]+/)?.[0]);
  if (colIndex !== -1) {
    return null;
  }

  let nearestRowIndex = null;
  range(viewWindow?.startRow, viewWindow?.endRow + 1).forEach(rowIndex => {
    const y = getRowY(rowIndex, grid, viewWindow);
    if (Math.abs(y - e.nativeEvent.offsetY) < 10) {
      nearestRowIndex = rowIndex;
    }
  });

  // Return null if result would be negative (can't resize header row)
  const result = nearestRowIndex - 1;
  return result >= 0 ? result : null;
};

// Minimum row height based on typical font size (11-12px) plus line height padding
const MIN_ROW_HEIGHT = 42;

export const getResizedRowGrid = ({ grid, rowResizeIndex, rowResizeAmount }) => {
  const newGrid = cloneDeep(grid);
  if (!newGrid.rowIndexToHeight) {
    newGrid.rowIndexToHeight = {};
  }

  let newHeight = (newGrid.rowIndexToHeight[rowResizeIndex] || DEFAULT_CELL_HEIGHT) + rowResizeAmount;
  newHeight = Math.max(newHeight, MIN_ROW_HEIGHT);

  newGrid.rowIndexToHeight[rowResizeIndex] = round(newHeight);

  // Clean up any negative indices that may have been added previously
  Object.keys(newGrid.rowIndexToHeight).forEach(key => {
    if (parseInt(key) < 0) {
      delete newGrid.rowIndexToHeight[key];
    }
  });

  return newGrid;
};

export const transformLabelsToApiPayload = (labels, cells) => {
  const apiAnnotations = [];

  labels?.forEach(labelObj => {
    labelObj?.selection?.forEach(cellId => {
      const cell = cells?.[cellId];
      const value = cell?.value || '';
      const rawValue = cell?.value || ''; // Assuming rawValue is same as value for now

      const colLetter = cellId?.match(/[A-Z]+/)?.[0];
      const rowNumber = parseInt(cellId?.match(/\d+/)?.[0]);

      const colIndex = ALPHABET_EXTENDED.indexOf(colLetter);
      const rowIndex = rowNumber - 1;

      apiAnnotations.push({
        start: 0,
        end: String(value).length,
        label: labelObj.label,
        rowIndex: rowIndex,
        colIndex: colIndex,
        startAxis: cellId,
        endAxis: cellId,
        value: String(value),
        rawValue: String(rawValue),
        context: '',
      });
    });
  });

  return apiAnnotations;
};

export const transformApiResponseToLabels = apiAnnotations => {
  if (!apiAnnotations || !Array.isArray(apiAnnotations)) {
    return [];
  }

  const groupedByLabel = groupBy(apiAnnotations, 'label');
  const labels = [];

  Object.entries(groupedByLabel).forEach(([labelName, annotations]) => {
    const selection = annotations.map(ann => ann.startAxis);
    // Use a random ID or derived ID.
    const id = Math.random().toString(36).substring(2, 15);

    labels.push({
      id: id,
      label: labelName,
      selection: uniq(selection),
    });
  });

  return labels;
};
