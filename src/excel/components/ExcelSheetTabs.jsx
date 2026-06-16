
const ExcelSheetTabs = ({
  sheetNames = [],
  selectedSheetName,
  onSheetSelect,
}) => {
  return (
    <div style={{
      height: 36, padding: '0 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-default, var(--border-primary))',
      flexShrink: 0,
    }}>
      {/* Sheet tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, flex: 1,
        overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin',
      }}>
        {/* Add sheet button */}
        <button
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 5, cursor: 'pointer', color: 'var(--text-secondary)',
            border: 'none', background: 'transparent', flexShrink: 0,
          }}
          title="Add sheet"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {sheetNames.map(name => {
          const isActive = name === selectedSheetName;
          return (
            <div
              key={name}
              onClick={() => onSheetSelect?.(name)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                background: isActive
                  ? 'var(--bg-tertiary)'
                  : 'transparent',
                borderBottom: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
              }}
            >
              {name}
            </div>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>100%</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '0 2px' }}>−</button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '0 2px' }}>+</button>
      </div>
    </div>
  );
};

export default ExcelSheetTabs;
