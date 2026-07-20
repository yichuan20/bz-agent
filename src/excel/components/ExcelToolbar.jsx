import { useEffect, useRef, useState } from 'react';
import {
  CURRENCIES,
  DATA_FORMAT_STR_TO_DATA_TYPE,
  SUPPORTED_FUNCTIONS,
} from '../utils/excelModelsStub';
import ColorPickerTooltip from './ColorPickerTooltip';
import {
  ColoredIconButtonBucket,
  IconButton,
  ToolbarContainer,
  VerticalLine,
} from './ExcelViewSheetArea.styles';
import { CalculateIcon } from './Icons';

export const DraggableToolbarContainer = ({
  children,
  $docked,
  $top,
  $left,
  $dragging,
  style = {},
  ...p
}) => (
  <ToolbarContainer
    style={{
      position: $docked ? 'static' : 'fixed',
      top: $docked ? undefined : $top,
      left: $docked ? undefined : $left,
      cursor: $dragging ? 'grabbing' : 'grab',
      zIndex: $docked ? 98 : 1000,
      boxShadow: $docked ? 'none' : '0 8px 32px rgba(0,0,0,0.5)',
      border: $docked ? 'none' : '1px solid var(--border-default)',
      borderRadius: $docked ? 8 : 10,
      background: $docked ? 'var(--bg-secondary)' : 'var(--bg-elevated,var(--bg-primary))',
      padding: $docked ? '4px 8px' : '5px 8px',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      flexWrap: 'nowrap',
      ...style,
    }}
    {...p}
  >
    {children}
  </ToolbarContainer>
);

const DragHandle = ({ children, style = {}, ...p }) => (
  <div
    style={{
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-tertiary)',
      cursor: 'grab',
      marginRight: 4,
      flexShrink: 0,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

export const ToolbarButton = ({ children, isActive, style = {}, ...p }) => (
  <IconButton
    isActive={isActive}
    style={{
      position: 'relative',
      width: 26,
      height: 26,
      color: 'var(--text-secondary)',
      flexShrink: 0,
      ...style,
    }}
    {...p}
  >
    {children}
  </IconButton>
);

const TooltipWrapper = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }} {...p}>
    {children}
  </div>
);

const CellFormatContainer = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', ...style }} {...p}>
    {children}
  </div>
);

const CellFormatTrigger = ({ children, $active, style = {}, ...p }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 11,
      color: 'var(--text-secondary)',
      height: 26,
      border: '1px solid var(--border-default,var(--border-primary))',
      background: 'transparent',
      flexShrink: 0,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const CellFormatDropdown = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      minWidth: 140,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 4,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const CellFormatItem = ({ children, style = {}, ...p }) => (
  <div
    style={{
      padding: '7px 10px',
      borderRadius: 5,
      cursor: 'pointer',
      fontSize: 12,
      color: 'var(--text-secondary)',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <polyline points="6,9 12,15 18,9" />
  </svg>
);

// Font family options
const FONT_FAMILIES = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
];

const FontFamilyContainer = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', ...style }} {...p}>
    {children}
  </div>
);

const FontFamilyTrigger = ({ children, $active, style = {}, ...p }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 11,
      color: 'var(--text-secondary)',
      minWidth: 80,
      maxWidth: 110,
      height: 26,
      border: '1px solid var(--border-default,var(--border-primary))',
      background: 'transparent',
      flexShrink: 0,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const FontFamilyLabel = ({ children, style = {}, ...p }) => (
  <span
    style={{
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      ...style,
    }}
    {...p}
  >
    {children}
  </span>
);

const FontFamilyDropdown = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      minWidth: 160,
      maxHeight: 220,
      overflowY: 'auto',
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 4,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const FontFamilyItem = ({ children, $fontFamily, $selected, style = {}, ...p }) => (
  <div
    style={{
      padding: '6px 10px',
      borderRadius: 5,
      cursor: 'pointer',
      fontSize: 12,
      color: $selected ? 'var(--accent-blue)' : 'var(--text-secondary)',
      background: $selected
        ? 'color-mix(in srgb,var(--accent-blue) 12%,transparent)'
        : 'transparent',
      fontFamily: $fontFamily,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

// Font size options
const FONT_SIZES = [
  { value: 200, label: '10' },
  { value: 220, label: '11' },
  { value: 240, label: '12' },
  { value: 260, label: '13' },
  { value: 280, label: '14' },
  { value: 300, label: '15' },
  { value: 320, label: '16' },
  { value: 340, label: '17' },
  { value: 360, label: '18' },
  { value: 380, label: '19' },
  { value: 400, label: '20' },
];

const FontSizeContainer = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', ...style }} {...p}>
    {children}
  </div>
);

const FontSizeTrigger = ({ children, $active, style = {}, ...p }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '3px 6px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 11,
      color: 'var(--text-secondary)',
      minWidth: 40,
      height: 26,
      border: '1px solid var(--border-default,var(--border-primary))',
      background: 'transparent',
      justifyContent: 'center',
      flexShrink: 0,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const FontSizeDropdown = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      minWidth: 60,
      maxHeight: 200,
      overflowY: 'auto',
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 4,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const FontSizeItem = ({ children, $selected, style = {}, ...p }) => (
  <div
    style={{
      padding: '5px 10px',
      borderRadius: 5,
      cursor: 'pointer',
      fontSize: 12,
      color: $selected ? 'var(--accent-blue)' : 'var(--text-secondary)',
      background: $selected
        ? 'color-mix(in srgb,var(--accent-blue) 12%,transparent)'
        : 'transparent',
      textAlign: 'center',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

// Functions dropdown
const FUNCTION_GROUPS = [
  { label: 'Math', functions: ['SUM', 'AVERAGE', 'MIN', 'MAX'] },
  { label: 'Lookup', functions: ['LOOKUP', 'VLOOKUP', 'HLOOKUP', 'ADDRESS'] },
];

const FunctionsContainer = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', ...style }} {...p}>
    {children}
  </div>
);

const FunctionsDropdown = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      minWidth: 140,
      maxHeight: 260,
      overflowY: 'auto',
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 4,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const FunctionGroupLabel = ({ children, style = {}, ...p }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 600,
      color: 'var(--text-tertiary)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      padding: '4px 10px 2px',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const FunctionItem = ({ children, style = {}, ...p }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: 5,
      cursor: 'pointer',
      fontSize: 12,
      color: 'var(--text-secondary)',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const TagPickerContainer = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', ...style }} {...p}>
    {children}
  </div>
);

const TagPickerDropdown = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: 32,
      left: 0,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 8,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const TagColorGrid = ({ children, style = {}, ...p }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 20px)', gap: 6, ...style }} {...p}>
    {children}
  </div>
);

const TagColor = ({ children, $color, style = {}, ...p }) => (
  <div
    style={{
      width: 20,
      height: 20,
      borderRadius: 3,
      background: $color,
      cursor: 'pointer',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const MoreMenuContainer = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', ...style }} {...p}>
    {children}
  </div>
);

const MoreDropdown = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: 32,
      right: 0,
      minWidth: 180,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 4,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const MoreDropdownItem = ({ children, style = {}, ...p }) => (
  <div
    style={{
      padding: '7px 12px',
      fontSize: 12,
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      borderRadius: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const MoreDropdownDivider = ({ children, style = {}, ...p }) => (
  <div
    style={{
      height: 1,
      background: 'var(--border-default,var(--border-primary))',
      margin: '4px 0',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const CustomizePanel = ({ children, $open, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: '100%',
      right: 0,
      width: 280,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 16,
      zIndex: 9999,
      display: $open ? 'block' : 'none',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const CustomizeTitle = ({ children, style = {}, ...p }) => (
  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, ...style }} {...p}>
    {children}
  </div>
);

const CustomizeClose = ({ children, style = {}, ...p }) => (
  <span
    style={{
      cursor: 'pointer',
      padding: 4,
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      ...style,
    }}
    {...p}
  >
    {children}
  </span>
);

const CustomizeContent = ({ children, style = {}, ...p }) => (
  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, ...style }} {...p}>
    {children}
  </div>
);

const DockedToolbarContainer = ({ children, $active, style = {}, ...p }) => (
  <div
    style={{
      display: 'block',
      background: $active ? 'var(--bg-secondary)' : 'transparent',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

const DockIndicatorWrapper = ({ children, style = {}, ...p }) => (
  <div style={{ position: 'relative', height: 0, ...style }} {...p}>
    {children}
  </div>
);

const DockIndicator = ({ children, $show, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 3,
      background: 'var(--accent-blue)',
      opacity: $show ? 1 : 0,
      transition: 'opacity 0.3s',
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

// SVG Icons matching HTML design
const BoldIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </svg>
);

const ItalicIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);

const TextColorIcon = ({ color }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <path d="M7 15L12 5L17 15" />
    <path d="M9 11h6" />
    <path d="M4 20h16" style={{ stroke: color, strokeWidth: 3 }} />
  </svg>
);

const FillColorIcon = ({ color = '#ffffff' }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <path d="M19 11H5L12 4L19 11Z" />
    <path d="M5 11V18H19V11" />
    <path
      d="M4 21h16"
      style={{ stroke: color === 'transparent' ? 'none' : color, strokeWidth: 3 }}
    />
    {color === 'transparent' && (
      <path d="M4 20h16" style={{ stroke: '#ccc', strokeWidth: 3, strokeDasharray: '3 2' }} />
    )}
  </svg>
);

const AlignLeftIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="15" y2="12" />
    <line x1="3" y1="18" x2="18" y2="18" />
  </svg>
);

const AlignCenterIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="6" y1="12" x2="18" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

const AlignRightIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="9" y1="12" x2="21" y2="12" />
    <line x1="6" y1="18" x2="21" y2="18" />
  </svg>
);

const WrapTextIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="16" y2="12" />
    <path d="M16 12C19 12 19 18 16 18H10" fill="none" />
    <polyline points="12,15 10,18 12,21" fill="none" />
  </svg>
);

const MergeIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="1" />
    <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="3 2" />
    <polyline points="9,12 12,9 15,12" />
    <polyline points="9,12 12,15 15,12" />
  </svg>
);

const PercentIconSVG = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <circle cx="7" cy="7" r="3" />
    <circle cx="17" cy="17" r="3" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
);

const ImageIconSVG = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
);

const MoreIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    stroke="currentColor"
    strokeWidth="2"
    fill="currentColor"
  >
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

const ChevronDownTiny = () => (
  <svg
    viewBox="0 0 10 10"
    width="8"
    height="8"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M2 3.5L5 6.5L8 3.5" />
  </svg>
);

// Adjust decimal places in an Excel format string (+1 or -1)
const adjustDecimalPlaces = (fmt, delta) => {
  if (!fmt || fmt === 'General' || fmt === '@' || fmt === '# ?/?') return fmt;
  // Mask quoted sections so we don't match inside them
  const masked = fmt.replace(/"[^"]*"/g, s => '\x00'.repeat(s.length));
  const m = masked.match(/\.(\d+)/);
  if (!m) {
    if (delta <= 0) return fmt;
    // No decimal section — insert .0 before %, E, or at end
    const insertAt = fmt.search(/[%E]/);
    return insertAt !== -1 ? `${fmt.slice(0, insertAt)}.0${fmt.slice(insertAt)}` : `${fmt}.0`;
  }
  const currentDecimals = m[1].length;
  const newDecimals = Math.max(0, currentDecimals + delta);
  const start = m.index;
  const end = start + 1 + currentDecimals;
  const replacement = newDecimals > 0 ? `.${'0'.repeat(newDecimals)}` : '';
  return fmt.slice(0, start) + replacement + fmt.slice(end);
};

// Grouped format definitions for the 123 picker
const FORMAT_PICKER_GROUPS = [
  [
    { label: 'Automatic', format: 'General', example: '1234' },
    { label: 'Plain text', format: '@', example: 'ABC' },
  ],
  [
    { label: 'Number', format: '#,##0.00', example: '1,000.12' },
    { label: 'Percent', format: '0.00%', example: '10.12%' },
    { label: 'Scientific', format: '0.00E+00', example: '1.00E+03' },
  ],
  [
    { label: 'Accounting', format: '"$"#,##0', example: '$ 1,000' },
    { label: 'Currency', format: '"$"#,##0.00', example: '$1,000.12' },
    { label: 'Currency rounded', format: '"$"#,##0', example: '$1,000' },
  ],
  [
    { label: 'Date', format: 'yyyy-mm-dd', example: '2024-01-01' },
    { label: 'Time', format: 'h:mm', example: '15:59' },
    { label: 'Date time', format: 'yyyy-mm-dd h:mm', example: '2024-01-01 15:59' },
  ],
];

const CurrencyPickerDropdown = ({ selectedCell, onUpdateAndPatchSelectedCell }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Detect active currency from the cell's dataFormatString
  const activeCurrency = CURRENCIES.find(c => c.format === selectedCell?.dataFormatString) || null;
  const label = activeCurrency ? activeCurrency.symbol : '$';

  useEffect(() => {
    if (!open) return;
    const onClickOutside = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ToolbarButton
        isActive={!!activeCurrency}
        data-tooltip="Currency format"
        style={{ gap: 1, width: 'auto', paddingInline: 4, minWidth: 26 }}
        onClick={() => setOpen(o => !o)}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1,
            minWidth: 10,
            textAlign: 'center',
          }}
        >
          {label}
        </span>
        <ChevronDownTiny />
      </ToolbarButton>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--bg-elevated, var(--bg-primary))',
            border: '1px solid var(--border-default, var(--border-primary))',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            padding: 4,
            zIndex: 9999,
            minWidth: 200,
          }}
        >
          {CURRENCIES.map(c => (
            <div
              key={c.code}
              onClick={() => {
                onUpdateAndPatchSelectedCell({ dataFormatString: c.format });
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '5px 10px',
                borderRadius: 5,
                cursor: 'pointer',
                background:
                  c.format === selectedCell?.dataFormatString
                    ? 'var(--bg-secondary)'
                    : 'transparent',
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={e =>
                (e.currentTarget.style.background =
                  c.format === selectedCell?.dataFormatString
                    ? 'var(--bg-secondary)'
                    : 'transparent')
              }
            >
              <span
                style={{ width: 28, fontWeight: 600, fontSize: 13, color: 'var(--accent-blue)' }}
              >
                {c.symbol}
              </span>
              <span style={{ flex: 1 }}>{c.name}</span>
              <span
                style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace', fontSize: 11 }}
              >
                {c.code}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BorderTopIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth="1" strokeOpacity="0.4" />
    <line x1="4" y1="4" x2="20" y2="4" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const BorderBottomIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth="1" strokeOpacity="0.4" />
    <line x1="4" y1="20" x2="20" y2="20" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const BorderLeftIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth="1" strokeOpacity="0.4" />
    <line x1="4" y1="4" x2="4" y2="20" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const BorderRightIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth="1" strokeOpacity="0.4" />
    <line x1="20" y1="4" x2="20" y2="20" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const ExcelToolbar = ({
  selectedCell,
  grid,
  labels,
  extraLabels,
  currentSelection,
  onUpdateAndPatchSelectedCell,
  onSaveLabel,
  onImageUpload,
  onInsertFunction,
  onResetGrid,
  mergedMasterMap = {},
  selectedCellLocation = '',
  dragStartLocation = '',
  dragEndLocation = '',
  onMergeCells = () => {},
}) => {
  const fileInputRef = useRef(null);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ top: 200, left: window.innerWidth / 2 - 300 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDocked, setIsDocked] = useState(true);
  const [nearDockZone, setNearDockZone] = useState(false);
  const toolbarRef = useRef(null);

  // Dropdown states
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [customizePanelOpen, setCustomizePanelOpen] = useState(false);
  const [cellFormatOpen, setCellFormatOpen] = useState(false);
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [functionsOpen, setFunctionsOpen] = useState(false);

  // Close dropdowns on Escape key
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        setFontFamilyOpen(false);
        setFontSizeOpen(false);
        setFunctionsOpen(false);
        setTagPickerOpen(false);
        setMoreMenuOpen(false);
        setCustomizePanelOpen(false);
        setCellFormatOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFunctionSelect = funcName => {
    onInsertFunction(funcName);
    setFunctionsOpen(false);
  };

  const handleImageUploadChange = event => {
    onImageUpload(event);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Dragging handlers
  const handleMouseDown = e => {
    // If clicking on the drag handle while docked, undock first
    if (isDocked && e.currentTarget === e.target.closest('[data-drag-handle]')) {
      setIsDocked(false);
      // Position toolbar near top left corner
      setPosition({ top: 160, left: 340 });
      return;
    }

    if (
      e.target.closest(
        '.toolbar-btn, .toolbar-dropdown, .more-menu, .tag-picker, button, select, input',
      )
    ) {
      return;
    }
    setIsDragging(true);
    if (toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseMove = e => {
    if (!isDragging) return;

    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;

    // Boundary constraints
    x = Math.max(260, Math.min(window.innerWidth - 600, x));
    y = Math.max(50, Math.min(window.innerHeight - 100, y));

    setPosition({ top: y, left: x });

    // Check if near dock zone - within 60px of the dock position (80px)
    const DOCK_POSITION = 80;
    const DOCK_THRESHOLD = 60;
    const isNearDock = Math.abs(y - DOCK_POSITION) < DOCK_THRESHOLD;
    setNearDockZone(isNearDock);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Dock if near top
    if (nearDockZone) {
      setIsDocked(true);
    }

    // Reset dock zone indicator
    setNearDockZone(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: handlers stable
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Derived state for UI
  const dataTypeValue = DATA_FORMAT_STR_TO_DATA_TYPE[selectedCell?.dataFormatString] || 'Custom';

  const [borderTop = '', borderRight = '', borderBottom = '', borderLeft = ''] =
    selectedCell?.boarder?.split(';') || [];

  let selectedCellTextAlignment = selectedCell?.align?.split(';')?.[0];
  const selectedCellVerticalAlignment = selectedCell?.align?.split(';')?.[1] || 'BOTTOM';

  if (selectedCellTextAlignment === 'GENERAL') {
    if (selectedCell?.dataType === 'NUMERIC' || selectedCell?.dataType === 'FORMULA') {
      selectedCellTextAlignment = 'RIGHT';
    } else {
      selectedCellTextAlignment = 'LEFT';
    }
  }

  const toolbarContent = (
    <>
      <DragHandle
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setIsDocked(true)}
        data-drag-handle="true"
        title="Double-click to dock"
      >
        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'currentColor' }}>
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </DragHandle>
      {!isDocked && (
        <div
          onClick={() => setIsDocked(true)}
          title="Dock toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            cursor: 'pointer',
            flexShrink: 0,
            color: 'var(--text-tertiary)',
            borderRadius: 4,
            marginRight: 2,
            fontSize: 14,
            lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          ⊟
        </div>
      )}

      <ToolbarButton
        isActive={selectedCell?.fontBold}
        onClick={() => onUpdateAndPatchSelectedCell(cell => ({ fontBold: !cell?.fontBold }))}
        data-tooltip="Bold (⌘B)"
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={selectedCell?.fontItalic}
        onClick={() => onUpdateAndPatchSelectedCell(cell => ({ fontItalic: !cell?.fontItalic }))}
        data-tooltip="Italic (⌘I)"
      >
        <ItalicIcon />
      </ToolbarButton>

      <TooltipWrapper data-tooltip="Font family">
        <FontFamilyContainer className="toolbar-dropdown">
          <FontFamilyTrigger
            $active={fontFamilyOpen}
            onClick={() => setFontFamilyOpen(!fontFamilyOpen)}
          >
            <FontFamilyLabel>{selectedCell?.fontFamily || 'Arial'}</FontFamilyLabel>
            <ChevronDownIcon />
          </FontFamilyTrigger>
          <FontFamilyDropdown $open={fontFamilyOpen}>
            {FONT_FAMILIES.map(font => (
              <FontFamilyItem
                key={font.value}
                $fontFamily={font.value}
                $selected={font.value === (selectedCell?.fontFamily || 'Arial')}
                onClick={() => {
                  onUpdateAndPatchSelectedCell({ fontFamily: font.value });
                  setFontFamilyOpen(false);
                }}
              >
                {font.label}
              </FontFamilyItem>
            ))}
          </FontFamilyDropdown>
        </FontFamilyContainer>
      </TooltipWrapper>

      <ColorPickerTooltip
        selectedColor={`#${selectedCell?.fontColor?.slice(2) || '000000'}`}
        resetColor="#000000"
        onNewColor={newFontColor =>
          onUpdateAndPatchSelectedCell({
            fontColor: `FF${newFontColor.slice(1)}`,
          })
        }
        triggerIcon={
          <ToolbarButton data-tooltip="Text color">
            <TextColorIcon color={`#${selectedCell?.fontColor?.slice(2) || '000000'}`} />
          </ToolbarButton>
        }
      />
      <TooltipWrapper data-tooltip="Font size">
        <FontSizeContainer className="toolbar-dropdown">
          <FontSizeTrigger $active={fontSizeOpen} onClick={() => setFontSizeOpen(!fontSizeOpen)}>
            <span>{(selectedCell?.fontSize || 200) / 20}</span>
            <ChevronDownIcon />
          </FontSizeTrigger>
          <FontSizeDropdown $open={fontSizeOpen}>
            {FONT_SIZES.map(size => (
              <FontSizeItem
                key={size.value}
                $selected={size.value === (selectedCell?.fontSize || 200)}
                onClick={() => {
                  onUpdateAndPatchSelectedCell({ fontSize: size.value });
                  setFontSizeOpen(false);
                }}
              >
                {size.label}
              </FontSizeItem>
            ))}
          </FontSizeDropdown>
        </FontSizeContainer>
      </TooltipWrapper>

      <VerticalLine style={{ marginLeft: '10px' }} />
      <CurrencyPickerDropdown
        selectedCell={selectedCell}
        onUpdateAndPatchSelectedCell={onUpdateAndPatchSelectedCell}
      />
      <ToolbarButton
        onClick={() => onUpdateAndPatchSelectedCell({ dataFormatString: '0.00%' })}
        data-tooltip="Percent"
      >
        <PercentIconSVG />
      </ToolbarButton>
      <ToolbarButton
        data-tooltip="Decrease decimal places"
        style={{ width: 30, fontSize: 11, fontFamily: 'monospace', gap: 0 }}
        onClick={() =>
          onUpdateAndPatchSelectedCell(cell => ({
            dataFormatString: adjustDecimalPlaces(cell?.dataFormatString || 'General', -1),
          }))
        }
      >
        .0<span style={{ fontSize: 9, marginTop: 1 }}>←</span>
      </ToolbarButton>
      <ToolbarButton
        data-tooltip="Increase decimal places"
        style={{ width: 30, fontSize: 11, fontFamily: 'monospace' }}
        onClick={() =>
          onUpdateAndPatchSelectedCell(cell => ({
            dataFormatString: adjustDecimalPlaces(cell?.dataFormatString || 'General', +1),
          }))
        }
      >
        .00
      </ToolbarButton>
      <CellFormatContainer className="toolbar-dropdown">
        <CellFormatTrigger
          $active={cellFormatOpen}
          onClick={() => setCellFormatOpen(!cellFormatOpen)}
          style={{ minWidth: 80, maxWidth: 110 }}
        >
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          >
            {dataTypeValue === 'Custom' ? '123' : dataTypeValue}
          </span>
          <ChevronDownIcon />
        </CellFormatTrigger>
        <CellFormatDropdown $open={cellFormatOpen} style={{ minWidth: 220, padding: '6px 0' }}>
          {FORMAT_PICKER_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div
                  style={{
                    height: 1,
                    background: 'var(--border-default, var(--border-primary))',
                    margin: '4px 10px',
                  }}
                />
              )}
              {group.map(item => {
                const isActive = selectedCell?.dataFormatString === item.format;
                return (
                  <CellFormatItem
                    key={item.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isActive ? 'var(--bg-secondary)' : 'transparent',
                      color: 'var(--text-primary)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isActive
                        ? 'var(--bg-secondary)'
                        : 'transparent';
                    }}
                    onClick={() => {
                      onUpdateAndPatchSelectedCell({ dataFormatString: item.format });
                      setCellFormatOpen(false);
                    }}
                  >
                    <span>{item.label}</span>
                    <span
                      style={{
                        color: 'var(--text-tertiary)',
                        fontSize: 11,
                        marginLeft: 12,
                        flexShrink: 0,
                      }}
                    >
                      {item.example}
                    </span>
                  </CellFormatItem>
                );
              })}
            </div>
          ))}
        </CellFormatDropdown>
      </CellFormatContainer>

      <VerticalLine style={{ marginLeft: '0px' }} />
      <ColorPickerTooltip
        selectedColor={
          selectedCell?.bgPattern === 'NO_FILL'
            ? 'transparent'
            : `#${selectedCell?.bgColor?.slice(2) || 'FFFFFF'}`
        }
        onNewColor={newBgColor =>
          onUpdateAndPatchSelectedCell(
            newBgColor === 'transparent'
              ? { bgPattern: 'NO_FILL', bgColor: 'FFFFFFFF' }
              : { bgColor: `FF${newBgColor.slice(1)}`, bgPattern: undefined },
          )
        }
        triggerIcon={
          <TooltipWrapper data-tooltip="Fill color">
            <ColoredIconButtonBucket>
              <FillColorIcon
                color={
                  selectedCell?.bgPattern === 'NO_FILL'
                    ? 'transparent'
                    : `#${selectedCell?.bgColor?.slice(2) || 'FFFFFF'}`
                }
              />
            </ColoredIconButtonBucket>
          </TooltipWrapper>
        }
      />

      <ToolbarButton
        isActive={borderTop === 'BLACK1'}
        onClick={() =>
          onUpdateAndPatchSelectedCell(cell => {
            const [top = '', right = '', bottom = '', left = ''] = cell?.boarder?.split(';') || [];
            return { boarder: `${top === 'BLACK1' ? '' : 'BLACK1'};${right};${bottom};${left}` };
          })
        }
        data-tooltip="Border top"
      >
        <BorderTopIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={borderRight === 'BLACK1'}
        onClick={() =>
          onUpdateAndPatchSelectedCell(cell => {
            const [top = '', right = '', bottom = '', left = ''] = cell?.boarder?.split(';') || [];
            return { boarder: `${top};${right === 'BLACK1' ? '' : 'BLACK1'};${bottom};${left}` };
          })
        }
        data-tooltip="Border right"
      >
        <BorderRightIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={borderBottom === 'BLACK1'}
        onClick={() =>
          onUpdateAndPatchSelectedCell(cell => {
            const [top = '', right = '', bottom = '', left = ''] = cell?.boarder?.split(';') || [];
            return { boarder: `${top};${right};${bottom === 'BLACK1' ? '' : 'BLACK1'};${left}` };
          })
        }
        data-tooltip="Border bottom"
      >
        <BorderBottomIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={borderLeft === 'BLACK1'}
        onClick={() =>
          onUpdateAndPatchSelectedCell(cell => {
            const [top = '', right = '', bottom = '', left = ''] = cell?.boarder?.split(';') || [];
            return { boarder: `${top};${right};${bottom};${left === 'BLACK1' ? '' : 'BLACK1'}` };
          })
        }
        data-tooltip="Border left"
      >
        <BorderLeftIcon />
      </ToolbarButton>

      <VerticalLine />
      <ToolbarButton
        isActive={selectedCellTextAlignment === 'LEFT'}
        onClick={() =>
          onUpdateAndPatchSelectedCell({
            align: `LEFT;${selectedCellVerticalAlignment}`,
          })
        }
        data-tooltip="Align left"
      >
        <AlignLeftIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={selectedCellTextAlignment === 'CENTER'}
        onClick={() =>
          onUpdateAndPatchSelectedCell({
            align: `CENTER;${selectedCellVerticalAlignment}`,
          })
        }
        data-tooltip="Align center"
      >
        <AlignCenterIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={selectedCellTextAlignment === 'RIGHT'}
        onClick={() =>
          onUpdateAndPatchSelectedCell({
            align: `RIGHT;${selectedCellVerticalAlignment}`,
          })
        }
        data-tooltip="Align right"
      >
        <AlignRightIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={selectedCell?.wrapText === true}
        onClick={() => onUpdateAndPatchSelectedCell(cell => ({ wrapText: !cell?.wrapText }))}
        data-tooltip="Wrap text"
      >
        <WrapTextIcon />
      </ToolbarButton>
      <ToolbarButton
        isActive={!!mergedMasterMap?.[selectedCellLocation]}
        onClick={() => {
          const isMerged = !!mergedMasterMap?.[selectedCellLocation];
          if (isMerged) {
            onMergeCells({ action: 'unmerge', ref: selectedCellLocation });
          } else if (
            dragStartLocation &&
            dragEndLocation &&
            dragStartLocation !== dragEndLocation &&
            !dragEndLocation.includes('ZZZZZZ') &&
            !dragEndLocation.includes('100000')
          ) {
            // Normalize to topLeft:bottomRight
            const colToIdx = s => {
              let n = 0;
              for (let i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64;
              return n;
            };
            const startColStr = dragStartLocation.match(/[A-Z]+/)?.[0] || 'A';
            const endColStr = dragEndLocation.match(/[A-Z]+/)?.[0] || 'A';
            const startRow = parseInt(dragStartLocation.match(/\d+/)?.[0] || '1', 10);
            const endRow = parseInt(dragEndLocation.match(/\d+/)?.[0] || '1', 10);
            const [leftCol, rightCol] =
              colToIdx(startColStr) <= colToIdx(endColStr)
                ? [startColStr, endColStr]
                : [endColStr, startColStr];
            const topLeft = `${leftCol}${Math.min(startRow, endRow)}`;
            const bottomRight = `${rightCol}${Math.max(startRow, endRow)}`;
            onMergeCells({ action: 'merge', range: `${topLeft}:${bottomRight}` });
          }
        }}
        data-tooltip={mergedMasterMap?.[selectedCellLocation] ? 'Unmerge cells' : 'Merge cells'}
      >
        <MergeIcon />
      </ToolbarButton>

      <VerticalLine />
      <TooltipWrapper data-tooltip="Functions">
        <FunctionsContainer className="toolbar-dropdown">
          <ToolbarButton onClick={() => setFunctionsOpen(!functionsOpen)}>
            <CalculateIcon />
          </ToolbarButton>
          <FunctionsDropdown $open={functionsOpen}>
            {FUNCTION_GROUPS.map(group => (
              <div key={group.label}>
                <FunctionGroupLabel>{group.label}</FunctionGroupLabel>
                {group.functions.map(func => (
                  <FunctionItem key={func} onClick={() => handleFunctionSelect(func)}>
                    {func}
                  </FunctionItem>
                ))}
              </div>
            ))}
            <FunctionGroupLabel>Others</FunctionGroupLabel>
            {SUPPORTED_FUNCTIONS.map(func => (
              <FunctionItem key={func} onClick={() => handleFunctionSelect(func)}>
                {func}
              </FunctionItem>
            ))}
          </FunctionsDropdown>
        </FunctionsContainer>
      </TooltipWrapper>

      <VerticalLine style={{ marginRight: '5px' }} />
      <ToolbarButton
        onClick={() => fileInputRef.current?.click()}
        data-tooltip="Upload Image"
        title="Upload Image"
      >
        <ImageIconSVG />
      </ToolbarButton>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUploadChange}
      />

      <VerticalLine />

      {/* Tag Picker */}
      <TagPickerContainer className="tag-picker">
        <ToolbarButton onClick={() => setTagPickerOpen(!tagPickerOpen)} data-tooltip="Cell tag">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" />
            <rect x="6" y="6" width="5" height="5" rx="1.5" fill="currentColor" />
          </svg>
        </ToolbarButton>
        <TagPickerDropdown $open={tagPickerOpen}>
          <TagColorGrid>
            <TagColor $color="var(--accent-blue)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-green)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-orange)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-red)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-purple)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-pink)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-yellow)" onClick={() => setTagPickerOpen(false)} />
            <TagColor $color="var(--accent-cyan)" onClick={() => setTagPickerOpen(false)} />
          </TagColorGrid>
        </TagPickerDropdown>
      </TagPickerContainer>

      <VerticalLine />

      {/* More Menu */}
      <MoreMenuContainer className="more-menu">
        <ToolbarButton onClick={() => setMoreMenuOpen(!moreMenuOpen)} data-tooltip="More">
          <MoreIcon />
        </ToolbarButton>
        <MoreDropdown $open={moreMenuOpen}>
          <MoreDropdownItem onClick={() => setMoreMenuOpen(false)}>Undo</MoreDropdownItem>
          <MoreDropdownItem onClick={() => setMoreMenuOpen(false)}>Redo</MoreDropdownItem>
          <MoreDropdownDivider />
          <MoreDropdownItem onClick={() => setMoreMenuOpen(false)}>Cut</MoreDropdownItem>
          <MoreDropdownItem onClick={() => setMoreMenuOpen(false)}>Copy</MoreDropdownItem>
          <MoreDropdownItem onClick={() => setMoreMenuOpen(false)}>Paste</MoreDropdownItem>
          <MoreDropdownDivider />
          <MoreDropdownItem
            onClick={() => {
              setMoreMenuOpen(false);
              setCustomizePanelOpen(true);
            }}
          >
            Customize toolbar
          </MoreDropdownItem>
          <MoreDropdownItem
            onClick={() => {
              setMoreMenuOpen(false);
              setIsDocked(!isDocked);
            }}
          >
            {isDocked ? 'Undock toolbar' : 'Dock toolbar'}
          </MoreDropdownItem>
          <MoreDropdownDivider />
          <MoreDropdownItem
            onClick={() => {
              setMoreMenuOpen(false);
              onResetGrid?.();
            }}
          >
            Reset grid
          </MoreDropdownItem>
        </MoreDropdown>
        <CustomizePanel $open={customizePanelOpen}>
          <CustomizeTitle>
            Customize Toolbar
            <CustomizeClose onClick={() => setCustomizePanelOpen(false)}>×</CustomizeClose>
          </CustomizeTitle>
          <CustomizeContent>
            Drag the toolbar to reposition it. Click "Dock toolbar" to snap it below the formula
            bar.
          </CustomizeContent>
        </CustomizePanel>
      </MoreMenuContainer>
    </>
  );

  return (
    <>
      {isDocked ? (
        <DockedToolbarContainer $active={true}>
          <DraggableToolbarContainer
            ref={toolbarRef}
            $docked={true}
            $dragging={false}
            $top={0}
            $left={0}
          >
            {toolbarContent}
          </DraggableToolbarContainer>
        </DockedToolbarContainer>
      ) : (
        <>
          <DockIndicatorWrapper>
            <DockIndicator $visible={isDragging && nearDockZone} />
          </DockIndicatorWrapper>
          <DraggableToolbarContainer
            ref={toolbarRef}
            $docked={false}
            $dragging={isDragging}
            $top={position.top}
            $left={position.left}
          >
            {toolbarContent}
          </DraggableToolbarContainer>
        </>
      )}
    </>
  );
};

export default ExcelToolbar;
