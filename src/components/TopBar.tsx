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
} from '@phosphor-icons/react';
import { BoltzAgentLogo } from '#/components/BoltzAgentLogo';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentMode, applyTheme } from '#/design-tokens';

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined)
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');

type TokenStatus = 'checking' | 'valid' | 'invalid';

function useTokenStatus() {
  const [status, setStatus] = useState<TokenStatus>('checking');
  const [reason, setReason] = useState('');

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_HTTP}/auth/status`);
      if (!res.ok) { setStatus('invalid'); setReason('server error'); return; }
      const data = await res.json() as { valid: boolean; reason: string };
      setStatus(data.valid ? 'valid' : 'invalid');
      setReason(data.reason);
    } catch {
      setStatus('invalid');
      setReason('unreachable');
    }
  }, []);

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), 30_000);
    return () => clearInterval(id);
  }, [check]);

  return { status, reason };
}

function TokenStatusDot({ status, reason }: { status: TokenStatus; reason: string }) {
  const [apiKey, setApiKey] = useState<{ present: boolean; last4: string | null } | null>(null);

  useEffect(() => {
    fetch(`${AGENT_HTTP}/api/apikey-status`)
      .then(r => r.json())
      .then(setApiKey)
      .catch(() => null);
  }, []);

  const color = status === 'valid' ? '#22c55e' : status === 'invalid' ? '#ef4444' : '#6b7280';
  const authLabel = status === 'valid' ? 'Auth valid' : status === 'invalid' ? `Auth invalid: ${reason}` : 'Checking…';
  const keyLabel = apiKey == null ? '' : apiKey.present ? ` · API key: ****${apiKey.last4}` : ' · No API key';
  const label = authLabel + keyLabel;

  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
      className="token-status-dot-wrap"
    >
      <div
        style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: status === 'valid' ? `0 0 6px ${color}` : 'none',
          cursor: 'default',
        }}
      />
      <div className="token-status-dot-tip" style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        background: '#1a1a1a',
        color: '#e8e8e8',
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 500,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        padding: '5px 10px',
        borderRadius: 6,
        zIndex: 9999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {label}
      </div>
    </div>
  );
}
const TopBar: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(getCurrentMode);
  const { status: tokenStatus, reason: tokenReason } = useTokenStatus();

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

      {/* ── Left: logo — 8px extra margin aligns icon with sidebar nav icons (12px nav + 8px item padding) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
        {/* Logo mark + app name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BoltzAgentLogo size={24} />
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

      {/* ── Right: token status + theme + logout ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <TokenStatusDot status={tokenStatus} reason={tokenReason} />
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

      </div>
    </nav>
  );
};

export default TopBar;
