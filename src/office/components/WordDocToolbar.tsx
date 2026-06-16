import './WordDocToolbar.css';
import { useEffect, useRef, useState, useCallback } from 'react';
// @ts-expect-error - JSX component without type declarations
import ImageInsert from './ImageInsert';
// @ts-expect-error - JSX component without type declarations
import TablePickerTooltip from './TablePickerTooltip';

// =============================================
// STYLED COMPONENTS - Exact match to HTML design
// =============================================

const FloatingToolbar = ({children, $isDocked, $isHidden, ...p}: any) => <div className="bzt-floating-toolbar" data-docked={$isDocked ? "true" : "false"} data-hidden={$isHidden ? "true" : "false"} {...p}>{children}</div>;

const DockedToolbarContainer = ({children, $active, ...p}: any) => <div className="bzt-docked-toolbar-container" data-active={$active ? "true" : "false"} {...p}>{children}</div>;

const DockIndicator = ({children, $visible, ...p}: any) => <div className="bzt-dock-indicator" data-visible={$visible ? "true" : "false"} {...p}>{children}</div>;

const ToolbarDragHandle = ({children, ...p}: any) => <div className="bzt-toolbar-drag-handle" {...p}>{children}</div>;

const ToolbarDivider = ({children, ...p}: any) => <div className="bzt-toolbar-divider" {...p}>{children}</div>;

const ToolbarBtn = ({children, $active, ...p}: any) => <button className="bzt-toolbar-btn" data-active={$active ? "true" : "false"} {...p}>{children}</button>;

const ToolbarDropdown = ({children, ...p}: any) => <div className="bzt-toolbar-dropdown" {...p}>{children}</div>;

const FontDropdown = ({children, ...p}: any) => <div className="bzt-font-dropdown" {...p}>{children}</div>;

const FontDropdownMenu = ({children, $open, ...p}: any) => <div className="bzt-font-dropdown-menu" data-open={$open ? "true" : "false"} {...p}>{children}</div>;

const FontOption = ({children, $active, ...p}: any) => <div className="bzt-font-option" data-active={$active ? "true" : "false"} {...p}>{children}</div>;

const FontSizeDropdown = ({children, ...p}: any) => <div className="bzt-font-size-dropdown" {...p}>{children}</div>;

const FontSizeDropdownMenu = ({children, $open, ...p}: any) => <div className="bzt-font-size-dropdown-menu" data-open={$open ? "true" : "false"} {...p}>{children}</div>;

const FontSizeOption = ({children, $active, ...p}: any) => <div className="bzt-font-size-option" data-active={$active ? "true" : "false"} {...p}>{children}</div>;

const FontSizeBtn = ({children, ...p}: any) => <button className="bzt-font-size-btn" {...p}>{children}</button>;

const HeadingDropdownMenu = ({children, $open, ...p}: any) => <div className="bzt-heading-dropdown-menu" data-open={$open ? "true" : "false"} {...p}>{children}</div>;

const HeadingOption = ({children, $variant, ...p}: any) => <div className="bzt-heading-option" data-variant={$variant} {...p}>{children}</div>;

const ColorPicker = ({children, ...p}: any) => <div className="bzt-color-picker" {...p}>{children}</div>;

const ColorPickerDropdown = ({children, $open, ...p}: any) => <div className="bzt-color-picker-dropdown" data-open={$open ? "true" : "false"} {...p}>{children}</div>;

const ColorPickerGrid = ({children, ...p}: any) => <div className="bzt-color-picker-grid" {...p}>{children}</div>;

const ColorSwatch = ({children, $color, $transparent, ...p}: any) => <div className="bzt-color-swatch" style={{background: $color}} data-transparent={$transparent ? "true" : "false"} {...p}>{children}</div>;

const LineSpacingDropdown = ({children, ...p}: any) => <div className="bzt-line-spacing-dropdown" {...p}>{children}</div>;

const LineSpacingMenu = ({children, $open, ...p}: any) => <div className="bzt-line-spacing-menu" data-open={$open ? "true" : "false"} {...p}>{children}</div>;

const LineSpacingOption = ({children, $active, ...p}: any) => <div className="bzt-line-spacing-option" data-active={$active ? "true" : "false"} {...p}>{children}</div>;

const MoreMenu = ({children, ...p}: any) => <div className="bzt-more-menu" {...p}>{children}</div>;

const MoreDropdown = ({children, $open, ...p}: any) => <div className="bzt-more-dropdown" data-open={$open ? "true" : "false"} {...p}>{children}</div>;

const MoreDropdownItem = ({children, ...p}: any) => <div className="bzt-more-dropdown-item" {...p}>{children}</div>;

const MoreDropdownDivider = ({children, ...p}: any) => <div className="bzt-more-dropdown-divider" {...p}>{children}</div>;

// =============================================
// CONSTANTS
// =============================================

const FONTS = [
  { name: 'Inter', family: 'Inter, sans-serif' },
  { name: 'Arial', family: 'Arial, sans-serif' },
  { name: 'Times New Roman', family: "'Times New Roman', serif" },
  { name: 'Georgia', family: 'Georgia, serif' },
  { name: 'Courier New', family: "'Courier New', monospace" },
  { name: 'Verdana', family: 'Verdana, sans-serif' },
  { name: 'Trebuchet MS', family: "'Trebuchet MS', sans-serif" },
  { name: 'Comic Sans MS', family: "'Comic Sans MS', cursive" },
  { name: 'Impact', family: 'Impact, sans-serif' },
  { name: 'Lucida Console', family: "'Lucida Console', monospace" },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72];

const TEXT_COLORS = [
  '#ffffff', '#a0a0a0', '#666666', '#333333', '#000000',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#1473df', '#8b5cf6', '#ec4899', '#f43f5e', '#84cc16',
];

const HIGHLIGHT_COLORS = [
  'transparent',
  'rgba(239,68,68,0.3)',
  'rgba(249,115,22,0.3)',
  'rgba(234,179,8,0.3)',
  'rgba(34,197,94,0.3)',
  'rgba(6,182,212,0.3)',
  'rgba(20,115,223,0.3)',
  'rgba(139,92,246,0.3)',
  'rgba(236,72,153,0.3)',
  'rgba(244,63,94,0.3)',
];

const LINE_SPACINGS = [
  { label: 'Single (1.0)', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double (2.0)', value: '2' },
  { label: '2.5', value: '2.5' },
  { label: '3.0', value: '3' },
];

// =============================================
// COMPONENT
// =============================================

interface WordDocToolbarProps {
  // Formatting state
  isBold?: boolean;
  isItalic?: boolean;
  isUnderlined?: boolean;
  isStrikethrough?: boolean;
  textColor?: string;
  bgColor?: string;
  fontSize?: number;
  isBullet?: boolean;
  isNumbered?: boolean;
  isLink?: boolean;
  isInTable?: boolean;
  // Callbacks
  onToggleBold?: () => void;
  onToggleItalic?: () => void;
  onToggleUnderline?: () => void;
  onToggleStrikethrough?: () => void;
  onSetTextColor?: (color: string) => void;
  onSetBgColor?: (color: string) => void;
  onSetFontSize?: (size: number) => void;
  onToggleBullet?: () => void;
  onToggleNumbered?: () => void;
  onInsertLink?: () => void;
  // Image insert callbacks
  onNetworkImage?: (params: { url: string; description: string }) => void;
  onUploadImage?: (base64Image: string) => void;
  onIncreaseIndent?: () => void;
  onDecreaseIndent?: () => void;
  onInsertTable?: (rows: number, cols: number) => void;
  // Header ref for docking
  headerRef?: React.RefObject<HTMLElement | null>;
  // Callback for header highlight state
  onHeaderHighlight?: (highlighted: boolean) => void;
  // Sidebar width for positioning (optional)
  sidebarWidth?: number;
}

const WordDocToolbar = ({
  isBold = false,
  isItalic = false,
  isUnderlined = false,
  isStrikethrough = false,
  textColor = '#000000',
  bgColor = 'transparent',
  fontSize = 11,
  isBullet = false,
  isNumbered = false,
  isLink = false,
  isInTable = false,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onToggleStrikethrough,
  onSetTextColor,
  onSetBgColor,
  onSetFontSize,
  onToggleBullet,
  onToggleNumbered,
  onInsertLink,
  onNetworkImage,
  onUploadImage,
  onIncreaseIndent,
  onDecreaseIndent,
  onInsertTable,
  headerRef,
  onHeaderHighlight,
  sidebarWidth = 220,
}: WordDocToolbarProps) => {
  // Toolbar state
  const [isDocked, setIsDocked] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [showDockIndicator, setShowDockIndicator] = useState(false);
  const [nearDockZone, setNearDockZone] = useState(false);

  // Dropdown states
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [fontSizeDropdownOpen, setFontSizeDropdownOpen] = useState(false);
  const [headingDropdownOpen, setHeadingDropdownOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Current selections
  const [currentFont, setCurrentFont] = useState('Inter');
  const [currentFontSize, setCurrentFontSize] = useState(fontSize);
  const [currentHeading, setCurrentHeading] = useState('Body');
  const [currentLineSpacing, setCurrentLineSpacing] = useState('1.5');
  const [currentAlignment, setCurrentAlignment] = useState('left');

  // Refs
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Sync internal state with props when selection changes
  useEffect(() => {
    setCurrentFontSize(fontSize);
  }, [fontSize]);

  // Close all dropdowns
  const closeAllDropdowns = useCallback(() => {
    setFontDropdownOpen(false);
    setFontSizeDropdownOpen(false);
    setHeadingDropdownOpen(false);
    setTextColorOpen(false);
    setHighlightColorOpen(false);
    setLineSpacingOpen(false);
    setMoreMenuOpen(false);
  }, []);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        closeAllDropdowns();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeAllDropdowns]);

  // Drag handlers - matching HTML design exactly
  const handleDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (isDocked) {
      // Undock the toolbar - place it in the center of the content area
      setIsDocked(false);

      const contentAreaWidth = window.innerWidth - sidebarWidth;
      const toolbarWidth = toolbarRef.current?.offsetWidth || 600;
      const centerLeft = sidebarWidth + (contentAreaWidth - toolbarWidth) / 2;

      const newX = Math.max(sidebarWidth + 20, centerLeft);
      const newY = 180;

      setPosition({ x: newX, y: newY });
      dragOffset.current = { x: e.clientX - newX, y: e.clientY - newY };
      setIsDragging(true);
      setShowDockIndicator(true);
    }
  }, [isDocked, sidebarWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking on buttons or dropdowns
    const target = e.target as HTMLElement;
    if (target.closest('button, [class*="Dropdown"], [class*="ColorPicker"], [class*="MoreMenu"]')) {
      return;
    }

    // For the drag handle in floating mode
    if (!isDocked) {
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      setIsDragging(true);
      setShowDockIndicator(true);
    }
  }, [isDocked, position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    let x = e.clientX - dragOffset.current.x;
    let y = e.clientY - dragOffset.current.y;

    // Boundary constraints - matching HTML design
    const toolbarWidth = toolbarRef.current?.offsetWidth || 600;
    const toolbarHeight = toolbarRef.current?.offsetHeight || 40;
    x = Math.max(sidebarWidth + 20, Math.min(window.innerWidth - toolbarWidth - 20, x));
    y = Math.max(50, Math.min(window.innerHeight - toolbarHeight - 60, y));

    setPosition({ x, y });

    // Check if near header (dock area) - matching HTML design
    const headerRect = headerRef?.current?.getBoundingClientRect();
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();

    if (headerRect && toolbarRect) {
      const isNear = toolbarRect.top < headerRect.bottom + 30;
      setNearDockZone(isNear);
      onHeaderHighlight?.(isNear);
    }
  }, [isDragging, sidebarWidth, headerRef, onHeaderHighlight]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    setShowDockIndicator(false);

    // Dock if near the dock zone
    if (nearDockZone) {
      setIsDocked(true);
    }

    // Clear header highlight
    onHeaderHighlight?.(false);
    setNearDockZone(false);
  }, [isDragging, nearDockZone, onHeaderHighlight]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Font size handlers
  const increaseFontSize = () => {
    const currentIndex = FONT_SIZES.indexOf(currentFontSize);
    if (currentIndex < FONT_SIZES.length - 1) {
      const newSize = FONT_SIZES[currentIndex + 1];
      setCurrentFontSize(newSize);
      onSetFontSize?.(newSize);
    }
  };

  const decreaseFontSize = () => {
    const currentIndex = FONT_SIZES.indexOf(currentFontSize);
    if (currentIndex > 0) {
      const newSize = FONT_SIZES[currentIndex - 1];
      setCurrentFontSize(newSize);
      onSetFontSize?.(newSize);
    }
  };

  const toolbar = (
    <FloatingToolbar
      ref={toolbarRef}
      $isDocked={isDocked}
      style={!isDocked ? { left: position.x, top: position.y, transform: 'none' } : undefined}
      onMouseDown={handleMouseDown}
    >
      {/* Drag Handle - click to undock when docked, drag to move when floating */}
      <ToolbarDragHandle onMouseDown={isDocked ? handleDragHandleMouseDown : undefined}>
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </ToolbarDragHandle>

      {/* Font Family Dropdown */}
      <FontDropdown onClick={() => { closeAllDropdowns(); setFontDropdownOpen(!fontDropdownOpen); }}>
        <span>{currentFont}</span>
        <svg viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" /></svg>
        <FontDropdownMenu $open={fontDropdownOpen} onClick={e => e.stopPropagation()}>
          {FONTS.map(font => (
            <FontOption
              key={font.name}
              $active={currentFont === font.name}
              style={{ fontFamily: font.family }}
              onClick={() => { setCurrentFont(font.name); setFontDropdownOpen(false); }}
            >
              {font.name}
            </FontOption>
          ))}
        </FontDropdownMenu>
      </FontDropdown>

      <ToolbarDivider />

      {/* Font Size Controls */}
      <FontSizeBtn onClick={decreaseFontSize}>−</FontSizeBtn>
      <FontSizeDropdown onClick={() => { closeAllDropdowns(); setFontSizeDropdownOpen(!fontSizeDropdownOpen); }}>
        <span>{currentFontSize}</span>
        <FontSizeDropdownMenu $open={fontSizeDropdownOpen} onClick={e => e.stopPropagation()}>
          {FONT_SIZES.map(size => (
            <FontSizeOption
              key={size}
              $active={currentFontSize === size}
              onClick={() => { setCurrentFontSize(size); onSetFontSize?.(size); setFontSizeDropdownOpen(false); }}
            >
              {size}
            </FontSizeOption>
          ))}
        </FontSizeDropdownMenu>
      </FontSizeDropdown>
      <FontSizeBtn onClick={increaseFontSize}>+</FontSizeBtn>

      <ToolbarDivider />

      {/* Heading Dropdown */}
      <ToolbarDropdown onClick={() => { closeAllDropdowns(); setHeadingDropdownOpen(!headingDropdownOpen); }}>
        <span>{currentHeading}</span>
        <svg viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" /></svg>
        <HeadingDropdownMenu $open={headingDropdownOpen} onClick={e => e.stopPropagation()}>
          <HeadingOption $variant="h1" onClick={() => { setCurrentHeading('Heading 1'); setHeadingDropdownOpen(false); }}>Heading 1</HeadingOption>
          <HeadingOption $variant="h2" onClick={() => { setCurrentHeading('Heading 2'); setHeadingDropdownOpen(false); }}>Heading 2</HeadingOption>
          <HeadingOption $variant="h3" onClick={() => { setCurrentHeading('Heading 3'); setHeadingDropdownOpen(false); }}>Heading 3</HeadingOption>
          <HeadingOption $variant="body" onClick={() => { setCurrentHeading('Body'); setHeadingDropdownOpen(false); }}>Body</HeadingOption>
        </HeadingDropdownMenu>
      </ToolbarDropdown>

      <ToolbarDivider />

      {/* Text Formatting */}
      <ToolbarBtn $active={isBold} data-tooltip="Bold (⌘B)" onClick={onToggleBold}>
        <svg viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /></svg>
      </ToolbarBtn>
      <ToolbarBtn $active={isItalic} data-tooltip="Italic (⌘I)" onClick={onToggleItalic}>
        <svg viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
      </ToolbarBtn>
      <ToolbarBtn $active={isUnderlined} data-tooltip="Underline (⌘U)" onClick={onToggleUnderline}>
        <svg viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>
      </ToolbarBtn>
      <ToolbarBtn $active={isStrikethrough} data-tooltip="Strikethrough" onClick={onToggleStrikethrough}>
        <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" /><path d="M16 6C16 6 14.5 4 12 4C9.5 4 8 6 8 7.5C8 10 12 12 12 12" /><path d="M8 18C8 18 9.5 20 12 20C14.5 20 16 18 16 16.5C16 14 12 12 12 12" /></svg>
      </ToolbarBtn>

      <ToolbarDivider />

      {/* Text Color */}
      <ColorPicker>
        <ToolbarBtn data-tooltip="Text color" onClick={() => { closeAllDropdowns(); setTextColorOpen(!textColorOpen); }}>
          <svg viewBox="0 0 24 24">
            <path d="M4 20h16" style={{ stroke: textColor || 'currentColor', strokeWidth: 3 }} />
            <path d="M7 15L12 5L17 15" />
            <path d="M9 11h6" />
          </svg>
        </ToolbarBtn>
        <ColorPickerDropdown $open={textColorOpen} onClick={e => e.stopPropagation()}>
          <ColorPickerGrid>
            {TEXT_COLORS.map(color => (
              <ColorSwatch
                key={color}
                $color={color}
                onClick={() => { onSetTextColor?.(color); setTextColorOpen(false); }}
              />
            ))}
          </ColorPickerGrid>
        </ColorPickerDropdown>
      </ColorPicker>

      {/* Highlight Color */}
      <ColorPicker>
        <ToolbarBtn data-tooltip="Highlight color" onClick={() => { closeAllDropdowns(); setHighlightColorOpen(!highlightColorOpen); }}>
          <svg viewBox="0 0 24 24">
            <path d="M19 11H5L12 4L19 11Z" />
            <path d="M5 11V20H19V11" style={{ fill: bgColor !== 'transparent' ? bgColor : 'none' }} />
          </svg>
        </ToolbarBtn>
        <ColorPickerDropdown $open={highlightColorOpen} onClick={e => e.stopPropagation()}>
          <ColorPickerGrid>
            {HIGHLIGHT_COLORS.map((color, i) => (
              <ColorSwatch
                key={i}
                $color={color}
                $transparent={color === 'transparent'}
                onClick={() => { onSetBgColor?.(color); setHighlightColorOpen(false); }}
              />
            ))}
          </ColorPickerGrid>
        </ColorPickerDropdown>
      </ColorPicker>

      <ToolbarDivider />

      {/* Text Alignment */}
      <ToolbarBtn $active={currentAlignment === 'left'} data-tooltip="Align left" onClick={() => setCurrentAlignment('left')}>
        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
      </ToolbarBtn>
      <ToolbarBtn $active={currentAlignment === 'center'} data-tooltip="Align center" onClick={() => setCurrentAlignment('center')}>
        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
      </ToolbarBtn>
      <ToolbarBtn $active={currentAlignment === 'right'} data-tooltip="Align right" onClick={() => setCurrentAlignment('right')}>
        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
      </ToolbarBtn>
      <ToolbarBtn $active={currentAlignment === 'justify'} data-tooltip="Justify" onClick={() => setCurrentAlignment('justify')}>
        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
      </ToolbarBtn>

      <ToolbarDivider />

      {/* Line Spacing */}
      <LineSpacingDropdown>
        <ToolbarBtn data-tooltip="Line spacing" onClick={() => { closeAllDropdowns(); setLineSpacingOpen(!lineSpacingOpen); }}>
          <svg viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
            <path d="M7 3v18M7 3l-2 2M7 3l2 2M7 21l-2-2M7 21l2-2" strokeWidth="1.5" />
          </svg>
        </ToolbarBtn>
        <LineSpacingMenu $open={lineSpacingOpen} onClick={e => e.stopPropagation()}>
          {LINE_SPACINGS.map(spacing => (
            <LineSpacingOption
              key={spacing.value}
              $active={currentLineSpacing === spacing.value}
              onClick={() => { setCurrentLineSpacing(spacing.value); setLineSpacingOpen(false); }}
            >
              {spacing.label}
            </LineSpacingOption>
          ))}
        </LineSpacingMenu>
      </LineSpacingDropdown>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarBtn $active={isBullet} data-tooltip="Bullet list" onClick={onToggleBullet}>
        <svg viewBox="0 0 24 24">
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
          <line x1="9" y1="6" x2="21" y2="6" />
          <line x1="9" y1="12" x2="21" y2="12" />
          <line x1="9" y1="18" x2="21" y2="18" />
        </svg>
      </ToolbarBtn>
      <ToolbarBtn $active={isNumbered} data-tooltip="Numbered list" onClick={onToggleNumbered}>
        <svg viewBox="0 0 24 24">
          <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
          <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
          <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
          <line x1="9" y1="6" x2="21" y2="6" />
          <line x1="9" y1="12" x2="21" y2="12" />
          <line x1="9" y1="18" x2="21" y2="18" />
        </svg>
      </ToolbarBtn>

      <ToolbarDivider />

      {/* Indentation */}
      <ToolbarBtn data-tooltip="Decrease indent" onClick={onDecreaseIndent}>
        <svg viewBox="0 0 24 24">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="9" y1="12" x2="21" y2="12" />
          <line x1="9" y1="18" x2="21" y2="18" />
          <polyline points="6 9 3 12 6 15" />
        </svg>
      </ToolbarBtn>
      <ToolbarBtn data-tooltip="Increase indent" onClick={onIncreaseIndent}>
        <svg viewBox="0 0 24 24">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="9" y1="12" x2="21" y2="12" />
          <line x1="9" y1="18" x2="21" y2="18" />
          <polyline points="3 9 6 12 3 15" />
        </svg>
      </ToolbarBtn>

      <ToolbarDivider />

      {/* Link */}
      <ToolbarBtn $active={isLink} data-tooltip="Insert link (⌘K)" onClick={onInsertLink}>
        <svg viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarBtn>

      {/* Image Insert - with dropdown for network/upload options */}
      <ImageInsert
        onNetworkImage={onNetworkImage}
        onUploadImage={onUploadImage}
      />

      {/* Table Insert - with grid picker */}
      <TablePickerTooltip
        disabled={isInTable}
        onTableSelect={(rows: number, cols: number) => onInsertTable?.(rows, cols)}
        triggerIcon={
          <ToolbarBtn
            as="div"
            data-tooltip="Insert table"
            style={{ opacity: isInTable ? 0.5 : 1, cursor: isInTable ? 'not-allowed' : 'pointer' }}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </ToolbarBtn>
        }
      />

      {/* Comment */}
      <ToolbarBtn data-tooltip="Add comment (⌘⌥M)">
        <svg viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </ToolbarBtn>

      <ToolbarDivider />

      {/* More Menu */}
      <MoreMenu>
        <ToolbarBtn data-tooltip="More options" onClick={() => { closeAllDropdowns(); setMoreMenuOpen(!moreMenuOpen); }}>
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </ToolbarBtn>
        <MoreDropdown $open={moreMenuOpen} onClick={e => e.stopPropagation()}>
          <MoreDropdownItem>
            <svg viewBox="0 0 24 24"><text x="2" y="14" fontSize="12" fill="currentColor" stroke="none">X</text><text x="12" y="18" fontSize="8" fill="currentColor" stroke="none">2</text></svg>
            Subscript
          </MoreDropdownItem>
          <MoreDropdownItem>
            <svg viewBox="0 0 24 24"><text x="2" y="16" fontSize="12" fill="currentColor" stroke="none">X</text><text x="12" y="10" fontSize="8" fill="currentColor" stroke="none">2</text></svg>
            Superscript
          </MoreDropdownItem>
          <MoreDropdownDivider />
          <MoreDropdownItem>
            <svg viewBox="0 0 24 24"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /><line x1="3" y1="21" x2="21" y2="3" strokeWidth="2" /></svg>
            Clear formatting
          </MoreDropdownItem>
          <MoreDropdownDivider />
          <MoreDropdownItem>
            <svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            Print
          </MoreDropdownItem>
        </MoreDropdown>
      </MoreMenu>
    </FloatingToolbar>
  );

  // When docked, render inside the docked container
  if (isDocked) {
    return (
      <DockedToolbarContainer $active>
        {toolbar}
        <DockIndicator $visible={showDockIndicator} />
      </DockedToolbarContainer>
    );
  }

  // When floating, render the toolbar directly
  return toolbar;
};

export default WordDocToolbar;
