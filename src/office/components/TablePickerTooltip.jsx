import { useRef, useState } from 'react';
import useClickOutside from '../hooks/useClickOutside';

const TablePickerContainer = ({ children, ...p }) => (
  <div style={{ position: 'relative', display: 'inline-block' }} {...p}>
    {children}
  </div>
);

const TablePickerTip = ({ children, isVisible, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: 'calc(100% + 4px)',
      right: 0,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 8,
      zIndex: 9999,
    }}
    {...p}
  >
    {children}
  </div>
);

const TableGridContainer = ({ children, ...p }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(10,16px)',
      gap: 2,
    }}
    {...p}
  >
    {children}
  </div>
);

const TableGridCell = ({ children, isSelected, isHovered, style = {}, ...p }) => (
  <div
    style={{
      width: 16,
      height: 16,
      borderRadius: 2,
      cursor: 'pointer',
      border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-default,var(--border-primary))'}`,
      background: isSelected
        ? 'color-mix(in srgb,var(--accent-blue) 20%,transparent)'
        : 'transparent',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const TableSizeText = ({ children, ...p }) => (
  <div
    style={{
      textAlign: 'center',
      fontSize: 11,
      marginTop: 4,
      color: 'var(--text-secondary)',
    }}
    {...p}
  >
    {children}
  </div>
);

const TablePickerTooltip = ({ onTableSelect = () => {}, triggerIcon, disabled = false }) => {
  const tipRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedCells, setSelectedCells] = useState(new Set());

  const GRID_SIZE = 10;

  useClickOutside(tipRef, () => {
    setIsOpen(false);
    setHoveredCell(null);
    setSelectedCells(new Set());
  });

  const getCellKey = (row, col) => `${row}-${col}`;

  const getCellFromKey = key => {
    const [row, col] = key.split('-').map(Number);
    return { row, col };
  };

  // update the selection area: from (0,0) to the current mouse position
  const updateSelection = (endRow, endCol) => {
    const newSelected = new Set();

    // from (0,0) to the current mouse position to form a rectangular area
    for (let r = 0; r <= endRow; r++) {
      for (let c = 0; c <= endCol; c++) {
        newSelected.add(getCellKey(r, c));
      }
    }

    setSelectedCells(newSelected);
    setHoveredCell(getCellKey(endRow, endCol));
  };

  const getSelectedRange = () => {
    if (selectedCells.size === 0) {
      return { rows: 0, cols: 0 };
    }

    const cells = Array.from(selectedCells).map(getCellFromKey);
    const minRow = Math.min(...cells.map(c => c.row));
    const maxRow = Math.max(...cells.map(c => c.row));
    const minCol = Math.min(...cells.map(c => c.col));
    const maxCol = Math.max(...cells.map(c => c.col));

    return {
      rows: maxRow - minRow + 1,
      cols: maxCol - minCol + 1,
    };
  };

  const handleCellMouseEnter = (row, col) => {
    // when the mouse moves to which cell, display the rectangular area from (0,0) to that cell
    updateSelection(row, col);
  };

  const handleCellClick = (row, col) => {
    // when the cell is clicked, determine the final selection
    const rows = row + 1;
    const cols = col + 1;
    setIsOpen(false);
    onTableSelect(rows, cols);
    setSelectedCells(new Set());
    setHoveredCell(null);
  };

  const range = getSelectedRange();

  return (
    <TablePickerContainer>
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        style={disabled ? { pointerEvents: 'none', cursor: 'not-allowed' } : { cursor: 'pointer' }}
      >
        {triggerIcon}
      </div>
      {isOpen && !disabled && (
        <TablePickerTip ref={tipRef} isVisible={isOpen}>
          <TableGridContainer
            onMouseLeave={() => {
              setHoveredCell(null);
              setSelectedCells(new Set());
            }}
          >
            {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
              const row = Math.floor(index / GRID_SIZE);
              const col = index % GRID_SIZE;
              const cellKey = getCellKey(row, col);
              const isSelected = selectedCells.has(cellKey);
              const isHovered = hoveredCell === cellKey;

              return (
                <TableGridCell
                  key={cellKey}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  onMouseEnter={() => handleCellMouseEnter(row, col)}
                  onClick={() => handleCellClick(row, col)}
                />
              );
            })}
          </TableGridContainer>
          {range.rows > 0 && range.cols > 0 && (
            <TableSizeText>
              {range.rows} × {range.cols}
            </TableSizeText>
          )}
        </TablePickerTip>
      )}
    </TablePickerContainer>
  );
};

export default TablePickerTooltip;
