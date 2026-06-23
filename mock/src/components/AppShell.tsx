import type { ReactNode, CSSProperties } from 'react'
import { useState } from 'react'
import {
  House, Chats, Robot, Brain, Gear, SignOut, CaretDoubleLeft,
  MagnifyingGlass, Sun, Moon,
} from '@phosphor-icons/react'

// ─── Logo ────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect width="22" height="22" rx="5" fill="var(--accent-blue)" />
      <rect x="4" y="4" width="6" height="6" rx="1.5" fill="white" opacity="0.9" />
      <rect x="12" y="4" width="6" height="6" rx="1.5" fill="white" opacity="0.7" />
      <rect x="4" y="12" width="6" height="6" rx="1.5" fill="white" opacity="0.7" />
      <rect x="12" y="12" width="6" height="6" rx="1.5" fill="white" opacity="0.5" />
    </svg>
  )
}

// ─── TopBar ──────────────────────────────────────────────────────────────────
interface TopBarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  extra?: ReactNode
}

export function TopBar({ theme, onToggleTheme, extra }: TopBarProps) {
  const s: CSSProperties = {
    height: 52,
    background: 'var(--bg-primary)',
    borderBottom: '1px solid var(--border-primary)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 12,
    flexShrink: 0,
    zIndex: 100,
  }
  const leftS: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
  }
  const searchS: CSSProperties = {
    flex: 1,
    maxWidth: 448,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    padding: '6px 12px',
    color: 'var(--text-tertiary)',
    fontSize: 13,
  }
  const rightS: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
  }
  const iconBtnS: CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: 'transparent', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-secondary)', transition: 'all 0.15s',
  }
  return (
    <div style={s}>
      <div style={leftS}>
        <Logo />
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>BoltzAgent</span>
      </div>
      <div style={searchS}>
        <MagnifyingGlass size={14} weight="regular" />
        <span>Search…</span>
      </div>
      {extra && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{extra}</div>}
      <div style={rightS}>
        <button style={iconBtnS} onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button style={iconBtnS} title="Sign out">
          <SignOut size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
type NavKey = 'home' | 'chat' | 'agent' | 'learning' | 'settings'

interface SidebarProps {
  open: boolean
  active: NavKey
  onCollapse: () => void
  onNavigate: (nav: NavKey) => void
}

function NavItem({ icon, label, active, onClick }: {
  icon: ReactNode; label: string; active: boolean; onClick?: () => void
}) {
  const s: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    background: active ? 'var(--accent-blue-light)' : 'transparent',
    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    userSelect: 'none',
  }
  return (
    <div style={s} onClick={onClick}>
      {icon}
      {label}
    </div>
  )
}

export function Sidebar({ open, active, onCollapse, onNavigate }: SidebarProps) {
  const s: CSSProperties = {
    width: open ? 220 : 0,
    minWidth: open ? 220 : 0,
    overflow: 'hidden',
    background: 'var(--bg-primary)',
    borderRight: '1px solid var(--border-primary)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.25s ease, min-width 0.25s ease',
    flexShrink: 0,
  }
  const innerS: CSSProperties = {
    width: 220,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 8px',
  }
  const iconSz = 16
  return (
    <div style={s}>
      <div style={innerS}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <NavItem icon={<House size={iconSz} weight={active === 'home' ? 'fill' : 'regular'} />} label="Home" active={active === 'home'} onClick={() => onNavigate('home')} />
          <NavItem icon={<Chats size={iconSz} weight={active === 'chat' ? 'fill' : 'regular'} />} label="Chat" active={active === 'chat'} onClick={() => onNavigate('chat')} />
          <NavItem icon={<Robot size={iconSz} weight={active === 'agent' ? 'fill' : 'regular'} />} label="Agent" active={active === 'agent'} onClick={() => onNavigate('agent')} />
          <NavItem icon={<Brain size={iconSz} weight={active === 'learning' ? 'fill' : 'regular'} />} label="Live Learning" active={active === 'learning'} onClick={() => onNavigate('learning')} />
        </nav>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon={<Gear size={iconSz} weight={active === 'settings' ? 'fill' : 'regular'} />} label="Settings" active={active === 'settings'} onClick={() => onNavigate('settings')} />
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, transition: 'all 0.15s' }}
            onClick={onCollapse}
          >
            <CaretDoubleLeft size={iconSz} />
            Collapse
          </div>
          <NavItem icon={<SignOut size={iconSz} />} label="Sign out" active={false} />
        </div>
      </div>
    </div>
  )
}

// ─── AppShell ────────────────────────────────────────────────────────────────
interface AppShellProps {
  activeNav: NavKey
  sidebarOpen?: boolean
  topBarExtra?: ReactNode
  children: ReactNode
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onNavigate?: (nav: NavKey) => void
}

export function AppShell({
  activeNav, sidebarOpen = true, topBarExtra, children, theme, onToggleTheme, onNavigate
}: AppShellProps) {
  const [sbOpen, setSbOpen] = useState(sidebarOpen)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)' }}>
      <TopBar theme={theme} onToggleTheme={onToggleTheme} extra={topBarExtra} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar open={sbOpen} active={activeNav} onCollapse={() => setSbOpen(false)} onNavigate={nav => onNavigate?.(nav)} />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
