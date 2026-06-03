/**
 * TopBar — exact port of bz-codespace TopBar/index.tsx
 *
 * Tailwind → CSS mapping used here:
 *   h-(--spacing-bl-topbar)  → height: 52px
 *   px-3                     → padding: 0 12px
 *   h-8 w-8                  → 32×32px
 *   h-7 w-7                  → 28×28px
 *   rounded-lg               → border-radius: 8px
 *   gap-3 / gap-2 / gap-1.5  → gap: 12px / 8px / 6px
 *   text-[15px] font-bold    → font-size: 15px; font-weight: 700
 *   tracking-tight           → letter-spacing: -0.025em
 */
import {
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  SignOutIcon,
} from '@phosphor-icons/react';
import SideBarExpandIcon from '#/components/icons/SideBarExpandIcon';
import SideBarFoldIcon   from '#/components/icons/SideBarFoldIcon';
import { BoltzbitLogo }  from '#/components/BoltzbitLogo';
import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { clearAccessToken } from '#/auth-store';
import { getCurrentMode, applyTheme } from '#/design-tokens';

interface TopBarProps {
  sidebarOpen:     boolean;
  onToggleSidebar: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ sidebarOpen, onToggleSidebar }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(getCurrentMode);
  const navigate = useNavigate();

  useEffect(() => {
    const handleChange = () => setTheme(getCurrentMode());
    window.addEventListener('themechange', handleChange);
    return () => window.removeEventListener('themechange', handleChange);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
    window.dispatchEvent(new Event('themechange'));
  }

  function handleLogout() {
    clearAccessToken();
    void navigate({ to: '/login' });
  }

  /* ── icon button shared style ── */
  const iconBtn: React.CSSProperties = {
    height: 32, width: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, border: 'none', background: 'transparent',
    color: 'var(--text-secondary)', cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
    flexShrink: 0,
  };

  return (
    <nav style={{
      width: '100%',
      height: 52,
      padding: '0 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border-primary)',
      flexShrink: 0,
    }}>

      {/* ── Left: toggle + logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Sidebar toggle — exactly like bz-codespace */}
        <button
          type="button"
          title={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
          onClick={onToggleSidebar}
          style={iconBtn}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          {sidebarOpen
            ? <SideBarFoldIcon   style={{ fontSize: 18 }} />
            : <SideBarExpandIcon style={{ fontSize: 18 }} />
          }
        </button>

        {/* Logo mark + app name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BoltzbitLogo size={22} />
          <span style={{
            fontSize: 15, fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.025em',
            whiteSpace: 'nowrap',
          }}>
            BoltzAgent
          </span>
        </div>
      </div>

      {/* ── Centre: search input ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 448 }}>
          <MagnifyingGlassIcon
            size={15}
            style={{
              position: 'absolute', left: 12,
              top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)', pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', height: 32,
              paddingLeft: 32, paddingRight: 12,
              borderRadius: 8,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              fontSize: 13, color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 120ms ease',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
          />
        </div>
      </div>

      {/* ── Right: theme + logout ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
          style={iconBtn}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          {theme === 'dark'
            ? <SunIcon size={18} />
            : <MoonIcon size={18} />
          }
        </button>

        <button
          type="button"
          title="Sign out"
          onClick={handleLogout}
          style={iconBtn}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          <SignOutIcon size={18} />
        </button>
      </div>
    </nav>
  );
};

export default TopBar;
