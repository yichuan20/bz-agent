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
import { MagnifyingGlassIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { BoltzAgentLogo } from '#/components/BoltzAgentLogo';
import { applyTheme, getCurrentMode } from '#/design-tokens';

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');

type KeyVerifyStatus =
  | 'checking'
  | 'missing'
  | 'unverified'
  | 'verified'
  | 'invalid'
  | 'unreachable';

function useKeyStatus() {
  const [keyStatus, setKeyStatus] = useState<KeyVerifyStatus>('checking');
  const [last4, setLast4] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  // Lightweight poll: only checks whether the key is stored locally.
  // Called every 60s — cheap, no external API call.
  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch(`${AGENT_HTTP}/api/apikey-status`);
      const d = (await r.json()) as { present: boolean; last4: string | null };
      if (!d.present) {
        setKeyStatus('missing');
        setLast4(null);
      } else {
        setLast4(d.last4);
      }
    } catch {
      setKeyStatus('unreachable');
    }
  }, []);

  // Full check: status + verify against Boltzbit API.
  // Called once on mount and on explicit refresh (e.g. after saving a new key).
  const check = useCallback(async () => {
    try {
      const r = await fetch(`${AGENT_HTTP}/api/apikey-status`);
      const d = (await r.json()) as { present: boolean; last4: string | null };
      if (!d.present) {
        setKeyStatus('missing');
        setLast4(null);
        return;
      }
      setLast4(d.last4);
    } catch {
      setKeyStatus('unreachable');
      return;
    }
    try {
      const r = await fetch(`${AGENT_HTTP}/api/apikey-verify`);
      const d = (await r.json()) as { status: string; reason?: string; httpStatus?: number };
      if (d.status === 'verified') {
        setKeyStatus('verified');
        setReason('');
      } else if (d.status === 'invalid') {
        setKeyStatus('invalid');
        setReason(d.reason ?? '');
      } else if (d.status === 'missing') {
        setKeyStatus('missing');
        setReason('');
      } else {
        setKeyStatus('unverified');
        setReason(d.status);
      }
    } catch {
      setKeyStatus('unverified');
    }
  }, []);

  useEffect(() => {
    void check(); // verify once on mount
    const id = setInterval(() => void checkStatus(), 60_000); // status-only poll every 60s
    return () => clearInterval(id);
  }, [check, checkStatus]);

  return { keyStatus, last4, reason, refresh: check };
}

function TokenStatusDot() {
  const { keyStatus, last4, reason } = useKeyStatus();

  const color =
    keyStatus === 'verified'
      ? '#22c55e'
      : keyStatus === 'invalid'
        ? '#ef4444'
        : keyStatus === 'missing'
          ? '#ef4444'
          : keyStatus === 'unverified'
            ? '#eab308'
            : keyStatus === 'unreachable'
              ? '#f97316'
              : '#6b7280';

  const glow = keyStatus === 'verified' || keyStatus === 'invalid' || keyStatus === 'missing';

  const label =
    keyStatus === 'checking'
      ? 'Checking API key…'
      : keyStatus === 'missing'
        ? 'No API key — set one in Settings'
        : keyStatus === 'verified'
          ? `API key verified · ****${last4}`
          : keyStatus === 'invalid'
            ? `API key rejected · ****${last4}`
            : keyStatus === 'unreachable'
              ? `Boltzbit API unreachable · ****${last4}`
              : `API key configured (unverified) · ****${last4}`;

  return (
    <div
      style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
      className="token-status-dot-wrap"
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: glow ? `0 0 6px ${color}` : 'none',
          cursor: 'default',
        }}
      />
      <div
        className="token-status-dot-tip"
        style={{
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
        }}
      >
        {label}
        {reason ? ` — ${reason}` : ''}
      </div>
    </div>
  );
}
const TopBar: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(getCurrentMode);

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
    height: 32,
    width: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
    flexShrink: 0,
  };

  return (
    <nav
      style={{
        width: '100%',
        height: 52,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-primary)',
        flexShrink: 0,
      }}
    >
      {/* ── Left: logo — 8px extra margin aligns icon with sidebar nav icons (12px nav + 8px item padding) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
        {/* Logo mark + app name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BoltzAgentLogo size={24} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.025em',
              whiteSpace: 'nowrap',
            }}
          >
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
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: 32,
              paddingLeft: 32,
              paddingRight: 12,
              borderRadius: 8,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              fontSize: 13,
              color: 'var(--text-primary)',
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
        <TokenStatusDot />
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
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
      </div>
    </nav>
  );
};

export default TopBar;
