import { useState, useRef } from 'react';
import useClickOutside from '../hooks/useClickOutside';

const GRAYSCALE_ROW = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7',
  '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
];

const COLOR_PALETTE = [
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];


const Swatch = ({ color, selected, onClick }) => {
  const isTransparent = color === 'transparent';
  const isWhite = color === '#ffffff';
  return (
    <div
      onClick={() => onClick(color)}
      title={color}
      style={{
        width: 17, height: 17, borderRadius: 3, cursor: 'pointer', flexShrink: 0,
        border: `1px solid ${isWhite || isTransparent ? 'var(--border-default, rgba(0,0,0,0.2))' : 'rgba(0,0,0,0.12)'}`,
        boxSizing: 'border-box',
        boxShadow: selected ? 'inset 0 0 0 2.5px #fff' : 'none',
        background: isTransparent
          ? 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)'
          : color,
        backgroundSize: isTransparent ? '8px 8px' : undefined,
        backgroundPosition: isTransparent ? '0 0,4px 4px' : undefined,
      }}
    />
  );
};

const ColorPickerTooltip = ({
  selectedColor,
  onNewColor,
  triggerIcon,
  resetColor = 'transparent',
}) => {
  const ref = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useClickOutside(ref, () => setIsOpen(false));

  const pick = color => { setIsOpen(false); onNewColor(color); };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div onClick={() => setIsOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
        {triggerIcon}
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', left: 0, top: 32, zIndex: 9999,
          background: 'var(--bg-elevated, var(--bg-primary))',
          border: '1px solid var(--border-default, var(--border-primary))',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          padding: '8px 10px', width: 'max-content',
        }}>
          {/* Reset */}
          <div
            onClick={() => pick(resetColor)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', marginBottom: 6, borderRadius: 5,
              cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
            </svg>
            Reset
          </div>

          {/* Grayscale */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
            {GRAYSCALE_ROW.map(c => (
              <Swatch key={c} color={c} selected={selectedColor === c} onClick={pick} />
            ))}
          </div>

          {/* Main palette */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {COLOR_PALETTE.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 2 }}>
                {row.map(c => (
                  <Swatch key={c} color={c} selected={selectedColor === c} onClick={pick} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPickerTooltip;
