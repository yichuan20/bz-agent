import { useEffect, useRef, useState } from 'react';

const ExcelSheetTabs = ({
  sheetNames = [],
  selectedSheetName,
  onSheetSelect,
  onAddSheet,
  onRenameSheet,
  zoom = 1,
  onZoomChange,
}) => {
  const [editingName, setEditingName] = useState('');
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingName) inputRef.current?.select();
  }, [editingName]);

  const startRename = (name, e) => {
    e.stopPropagation();
    setEditingName(name);
    setEditValue(name);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== editingName) {
      onRenameSheet?.(editingName, trimmed);
    }
    setEditingName('');
  };

  const cancelRename = () => setEditingName('');

  return (
    <div
      style={{
        height: 36,
        padding: '0 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-default, var(--border-primary))',
        flexShrink: 0,
      }}
    >
      {/* Sheet tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'thin',
        }}
      >
        {/* Add sheet button */}
        <button
          style={{
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 5,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            border: 'none',
            background: 'transparent',
            flexShrink: 0,
          }}
          title="Add sheet"
          onClick={() => onAddSheet?.()}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {sheetNames.map(name => {
          const isActive = name === selectedSheetName;
          const isEditing = name === editingName;
          return (
            <div
              key={name}
              onClick={() => !isEditing && onSheetSelect?.(name)}
              onDoubleClick={e => startRename(name, e)}
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderRadius: 5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                borderBottom: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
              }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    border: '1px solid var(--accent-blue)',
                    borderRadius: 3,
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    padding: '0 4px',
                    outline: 'none',
                    width: Math.max(40, editValue.length * 7),
                  }}
                />
              ) : (
                name
              )}
            </div>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span
          style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 32, textAlign: 'right' }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontSize: 15,
            padding: '0 4px',
            lineHeight: 1,
          }}
          onClick={() => onZoomChange?.(-0.1)}
          title="Zoom out"
        >
          −
        </button>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontSize: 15,
            padding: '0 4px',
            lineHeight: 1,
          }}
          onClick={() => onZoomChange?.(0.1)}
          title="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
};

export default ExcelSheetTabs;
