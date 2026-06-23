import type { CSSProperties } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="var(--accent-blue)" />
      <rect x="7" y="7" width="11" height="11" rx="2.5" fill="white" opacity="0.9" />
      <rect x="22" y="7" width="11" height="11" rx="2.5" fill="white" opacity="0.7" />
      <rect x="7" y="22" width="11" height="11" rx="2.5" fill="white" opacity="0.7" />
      <rect x="22" y="22" width="11" height="11" rx="2.5" fill="white" opacity="0.5" />
    </svg>
  )
}

// Simplified animated grid background
function GridBg() {
  const cells = Array.from({ length: 120 }, (_, i) => i)
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 1, width: '100%', height: '100%' }}>
        {cells.map(i => (
          <div key={i} style={{
            background: `rgba(20, 115, 223, ${0.1 + (i % 5) * 0.08})`,
            borderRadius: 2,
            animation: `pulse ${2 + (i % 4) * 0.5}s ease-in-out ${(i % 7) * 0.3}s infinite alternate`,
          }} />
        ))}
      </div>
      <style>{`@keyframes pulse { from { opacity: 0.3 } to { opacity: 0.9 } }`}</style>
    </div>
  )
}

interface LoginProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Login({ theme, onToggleTheme }: LoginProps) {
  const pageS: CSSProperties = {
    height: '100%',
    background: theme === 'dark' ? '#000' : '#EDE8E0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  }
  const cardS: CSSProperties = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 16,
    padding: '40px 36px',
    width: 380,
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    position: 'relative',
    zIndex: 1,
  }
  const inputS: CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    color: 'var(--text-primary)',
    outline: 'none',
  }
  const labelS: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
  return (
    <div style={pageS}>
      <GridBg />
      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        style={{ position: 'absolute', top: 20, right: 20, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', zIndex: 2 }}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div style={cardS}>
        {/* Logo + Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Logo />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
              BoltzAgent
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Sign in to your workspace
            </div>
          </div>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelS}>Username or Email</label>
            <input style={inputS} type="text" placeholder="you@example.com" defaultValue="admin" readOnly />
          </div>
          <div>
            <label style={labelS}>Password</label>
            <input style={inputS} type="password" placeholder="••••••••" defaultValue="password" readOnly />
          </div>
          <button className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: 14 }}>
            Sign In
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Powered by Boltzbit · v2.4.1
        </div>
      </div>
    </div>
  )
}
