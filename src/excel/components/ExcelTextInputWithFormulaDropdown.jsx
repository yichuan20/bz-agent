import { FUNCTION_TO_DESCRIPTION, SUPPORTED_FUNCTIONS } from '../utils/excelModelsStub';
import { useRef, useState } from 'react';

const splitByCommaAndBrackets = str => {
  if (typeof str !== 'string') return [`${str}`];
  const separators = [',', '\\(', '\\)', '\\+', '-', '\\*', '/', ':', '=', '>', '<', '>=', '<='];
  return str.split(new RegExp(`(${separators.join('|')})`));
};

const COLORS = ['cyan', 'magenta', 'brown', 'red', 'purple', 'green', 'blue', 'orange'];

export const getCellLocationToColorMap = str => {
  if (typeof str !== 'string') return {};
  const usedColors = [...COLORS];
  const result = {};
  const cellAddr = /^[A-Z]+[1-9]\d*$/;
  const cellRange = /^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/;
  splitByCommaAndBrackets(str).forEach(chunk => {
    const t = chunk.trim();
    if (cellAddr.test(t) || cellRange.test(t)) result[t] = usedColors.pop() || 'black';
  });
  return result;
};

const CONTROL_KEYS = ['ArrowDown', 'ArrowUp', 'Enter'];

/*
 * Both the real <input> and the color-highlight overlay MUST share these
 * styles exactly — that is what keeps the caret and the visible text
 * at the same pixel position.
 */
const SHARED = {
  fontFamily: 'Arial',
  fontSize: '12px',
  lineHeight: '1',
  paddingLeft: '4px',
  paddingRight: '4px',
  boxSizing: 'border-box',
  whiteSpace: 'pre',
};

const ExcelTextInputWithFormulaDropdown = ({
  value,
  onChangeValue = () => {},
  isDisabled = false,
  onFocus = () => {},
  onBlur = () => {},
  style = {},
  autoFocus = false,
  onClick,
  className = '',
  onMouseDown = () => {},
  placeholder = '',
  cellWidth = 0,
}) => {
  const inputRef = useRef(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1);

  /* ── dropdown logic ── */
  let filteredFunctionNames = [];
  if (value?.[0] === '=') {
    filteredFunctionNames = SUPPORTED_FUNCTIONS
      ?.map(f => `=${f}(`)
      ?.filter(opt => opt.toLowerCase().startsWith(value.toLowerCase()));
  }

  const isUserAboutToTypeArguments = typeof value === 'string' && /^=.*\(/.test(value);
  const hasUserClosedBracket      = typeof value === 'string' && /^=.*\)/.test(value);

  const handleArrowKeysAndEnter = e => {
    if (isUserAboutToTypeArguments || !filteredFunctionNames.length || hasUserClosedBracket) return;
    if (CONTROL_KEYS.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowDown') setSelectedOptionIndex(i => Math.min(i + 1, filteredFunctionNames.length - 1));
    if (e.key === 'ArrowUp')   setSelectedOptionIndex(i => Math.max(i - 1, -1));
    if (e.key === 'Enter' && selectedOptionIndex !== -1) {
      onChangeValue(filteredFunctionNames[selectedOptionIndex]);
      setSelectedOptionIndex(-1);
    }
  };

  let dropdownContent = null;
  if (!hasUserClosedBracket) {
    if (isUserAboutToTypeArguments) {
      const funcName = value.match(/^=(.*)\(/)?.[1];
      dropdownContent = (
        <div style={{ padding: '4px 8px', fontSize: 12, fontFamily: 'Arial', color: 'var(--text-secondary)' }}>
          ={FUNCTION_TO_DESCRIPTION?.[funcName] || funcName}
        </div>
      );
    } else if (filteredFunctionNames.length) {
      dropdownContent = filteredFunctionNames.map((opt, i) => (
        <div
          key={i}
          style={{
            padding: '4px 8px', fontSize: 12, fontFamily: 'Arial',
            cursor: 'pointer', color: 'var(--text-primary)',
            background: selectedOptionIndex === i ? 'var(--bg-hover)' : 'transparent',
          }}
          onMouseDown={e => { e.preventDefault(); onChangeValue(opt); inputRef.current?.focus(); }}
        >
          {opt}
        </div>
      ));
    }
  }

  const cellLocationToColor = getCellLocationToColorMap(value);
  const minW = cellWidth > 0 ? cellWidth : 60;
  const showDropdown = document.activeElement === inputRef.current && dropdownContent;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        minWidth: minW,
        minHeight: 22,
        ...style,
      }}
    >
      {/*
       * Real <input>: text is transparent so only the caret is visible.
       * Positioned to fill the container completely.
       */}
      <input
        ref={inputRef}
        disabled={isDisabled}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        onChange={e => onChangeValue(e.target.value)}
        onKeyDown={handleArrowKeysAndEnter}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        onMouseDown={onMouseDown}
        style={{
          ...SHARED,
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100%',
          height: '100%',
          paddingTop: 0,
          paddingBottom: 0,
          color: 'transparent',
          caretColor: 'var(--text-primary)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          zIndex: 1,
          margin: 0,
        }}
      />

      {/*
       * Color-highlight overlay.
       * Must share EVERY text-metric style with the <input> above so that
       * character positions are pixel-identical.
       */}
      <div
        aria-hidden
        style={{
          ...SHARED,
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100%',
          height: '100%',
          paddingTop: 0,
          paddingBottom: 0,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
          overflow: 'hidden',
          color: 'var(--text-primary)',
          zIndex: 0,
        }}
      >
        {splitByCommaAndBrackets(value).map((chunk, i) => (
          <span key={i} style={{ color: cellLocationToColor[chunk?.trim()] || 'var(--text-primary)' }}>
            {chunk}
          </span>
        ))}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          minWidth: minW,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 10000,
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          {dropdownContent}
        </div>
      )}
    </div>
  );
};

export default ExcelTextInputWithFormulaDropdown;
