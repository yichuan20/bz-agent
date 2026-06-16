import { useState, useRef } from 'react';

import useClickOutside from '../hooks/useClickOutside';

// Color palette matching the screenshot
const GRAYSCALE_ROW = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#b7b7b7',
  '#cccccc',
  '#d9d9d9',
  '#efefef',
  '#f3f3f3',
  '#ffffff',
];

const COLOR_PALETTE = [
  // Row 1: Base saturated colors
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  // Row 2: Light tint 1
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  // Row 3: Light tint 2
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  // Row 4: Medium tint
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  // Row 5: Darker tint
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  // Row 6: Dark
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  // Row 7: Darker
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];

const STANDARD_COLORS = [
  '#000000',
  '#ffffff',
  '#4a86e8',
  '#9900ff',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
];

const Container = ({children, style={}, ...p}) => <div style={{position:'relative',display:'inline-flex',alignItems:'center',...style}} {...p}>{children}</div>;

const Tip = ({children, isVisible, style={}, ...p}) => <div style={{position:'absolute',left:0,top:32,width:'max-content',maxHeight:350,overflowY:'auto',background:'var(--bg-elevated,var(--bg-primary))',border:'1px solid var(--border-default,var(--border-primary))',borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,0.4)',padding:8,zIndex:9999,...style}} {...p}>{children}</div>;

const Trigger = ({children, selectedColor, highlightChild, style={}, ...p}) => <div style={{display:'flex',alignItems:'center',cursor:'pointer',...style}} {...p}>{children}</div>;

const ResetButton = ({children, style={}, ...p}) => <div style={{padding:'4px 8px',borderRadius:4,cursor:'pointer',fontSize:11,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:4,...style}} {...p}>{children}</div>;

const ColorGridContainer = ({children, style={}, ...p}) => <div style={{display:'flex',flexDirection:'column',gap:2,...style}} {...p}>{children}</div>;

const ColorRow = ({children, style={}, ...p}) => <div style={{display:'flex',gap:2,...style}} {...p}>{children}</div>;

const ColorBox = ({children, $color, style={}, ...p}) => <div style={{width:17,height:17,borderRadius:3,cursor:'pointer',background:$color||'transparent',border:'1px solid rgba(0,0,0,0.15)',position:'relative',...style}} {...p}>{children}</div>;

const SectionLabel = ({children, style={}, ...p}) => <div style={{fontSize:10,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'6px 0 2px',...style}} {...p}>{children}</div>;

const StandardColorsRow = ({children, style={}, ...p}) => <div style={{display:'flex',gap:2,marginTop:4,...style}} {...p}>{children}</div>;

const isLightColor = color => {
  if (!color || color === 'transparent') return true;
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
};

const getColorStyle = color => {
  if (color === 'transparent') {
    return {
      background:
        'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc 100%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc 100%)',
      backgroundSize: '8px 8px',
      backgroundPosition: '0 0, 4px 4px',
      border: '1px solid var(--border-default)',
    };
  }
  if (color === '#ffffff') {
    return {
      backgroundColor: color,
      border: '1px solid var(--border-default)',
    };
  }
  return { backgroundColor: color };
};

const PaintBucketIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 11.5s-2 2.17-2 3.5a2 2 0 1 0 4 0c0-1.33-2-3.5-2-3.5z" />
    <path d="M5.21 10.79L10 5.91l5.09 5.09-4.79 4.79-5.09-5z" />
    <path d="M14.12 4.83L10 .71 5.88 4.83" />
    <path d="M2.41 13.41L7.2 18.2c.78.78 2.05.78 2.83 0l5.17-5.17" />
  </svg>
);

const PencilIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const ColorPickerTooltip = ({
  highlightChild = 2,
  selectedColor,
  onNewColor,
  triggerIcon,
  resetColor = 'transparent',
}) => {
  const tipRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);

  useClickOutside(tipRef, () => setIsOpen(false));

  const handleColorClick = color => {
    setIsOpen(false);
    onNewColor(color);
  };

  return (
    <Container>
      <Trigger highlightChild={highlightChild} selectedColor={selectedColor} onClick={() => setIsOpen(true)}>
        {triggerIcon}
      </Trigger>
      {isOpen && (
        <Tip ref={tipRef} isVisible={isOpen}>
          <ResetButton onClick={() => handleColorClick(resetColor)}>
            <PaintBucketIcon />
            Reset
          </ResetButton>

          <ColorGridContainer>
            <ColorRow>
              {GRAYSCALE_ROW.map(color => (
                <ColorBox
                  key={color}
                  isSelected={selectedColor === color}
                  isLight={isLightColor(color)}
                  style={getColorStyle(color)}
                  onClick={() => handleColorClick(color)}
                />
              ))}
            </ColorRow>
            {COLOR_PALETTE.map((row, rowIndex) => (
              <ColorRow key={rowIndex}>
                {row.map(color => (
                  <ColorBox
                    key={color}
                    isSelected={selectedColor === color}
                    isLight={isLightColor(color)}
                    style={getColorStyle(color)}
                    onClick={() => handleColorClick(color)}
                  />
                ))}
              </ColorRow>
            ))}
          </ColorGridContainer>

          <div>
            <SectionLabel>
              STANDARD
              <PencilIcon />
            </SectionLabel>
            <StandardColorsRow>
              {STANDARD_COLORS.map(color => (
                <ColorBox
                  key={color}
                  isSelected={selectedColor === color}
                  isLight={isLightColor(color)}
                  style={getColorStyle(color)}
                  onClick={() => handleColorClick(color)}
                />
              ))}
            </StandardColorsRow>
          </div>
        </Tip>
      )}
    </Container>
  );
};

export default ColorPickerTooltip;
