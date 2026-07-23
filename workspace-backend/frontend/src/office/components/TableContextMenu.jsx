import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import useClickOutside from '../hooks/useClickOutside';

const TableContextMenu = forwardRef(
  (
    { x, y, visible, onClose, onDeleteRow, onDeleteColumn, onAddRow, onAddColumn, onDeleteTable },
    ref,
  ) => {
    const menuRef = useRef(null);
    useImperativeHandle(ref, () => menuRef.current);

    useClickOutside(menuRef, () => {
      if (visible) onClose();
    });

    // Close on Escape
    useEffect(() => {
      const handleKey = e => {
        if (e.key === 'Escape') onClose();
      };
      if (visible) document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }, [visible, onClose]);

    if (!visible) return null;

    const item = (label, handler) => (
      <button
        type="button"
        key={label}
        onClick={() => {
          handler?.();
          onClose();
        }}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '7px 16px',
          fontSize: 13,
          cursor: 'pointer',
          color: 'var(--text-primary, #111)',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e =>
          (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')
        }
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {label}
      </button>
    );

    const divider = (
      <div
        style={{
          height: 1,
          background: 'var(--border-default, rgba(255,255,255,0.12))',
          margin: '3px 0',
        }}
      />
    );

    return (
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 99999,
          background: 'var(--bg-elevated, #1a1a1a)',
          border: '1px solid var(--border-default, rgba(255,255,255,0.15))',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: '4px 0',
          minWidth: 180,
          userSelect: 'none',
        }}
      >
        {item('Delete Row', onDeleteRow)}
        {item('Delete Column', onDeleteColumn)}
        {item('Delete Table', onDeleteTable)}
        {divider}
        {item('Insert Row Below', onAddRow)}
        {item('Insert Column Right', onAddColumn)}
      </div>
    );
  },
);

TableContextMenu.displayName = 'TableContextMenu';
export default TableContextMenu;
