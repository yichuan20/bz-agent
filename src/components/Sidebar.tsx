/**
 * Sidebar (SideNav) — exact port of bz-codespace SideNav/index.tsx
 *
 * Key structural match:
 *   • `transition-[width] duration-300 ease-in-out` → `transition: width 300ms ease-in-out`
 *     applied directly via `style` prop (no class toggling = no repaint jank)
 *   • Width driven purely by the `open` prop: 220px ↔ 0
 *   • overflow-hidden on the <aside> so content clips smoothly during animation
 *   • scroll area fills remaining height; footer is shrink-0 with border-top
 */
import {
  BrainIcon,
  ChatCircleDotsIcon,
  GearIcon,
  HouseSimpleIcon,
  SignOutIcon,
  TerminalIcon,
} from '@phosphor-icons/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { clearAccessToken } from '#/auth-store';
import { FRONTEND_VERSION } from '#/version';

const SIDEBAR_WIDTH = 220;   // px — matches bz-codespace --spacing-bl-sidebar

const NAV_ITEMS = [
  { to: '/',          label: 'Home',     Icon: HouseSimpleIcon,    exact: true  },
  { to: '/chat',      label: 'Chat',     Icon: ChatCircleDotsIcon, exact: false },
  { to: '/agent',     label: 'Agent',    Icon: TerminalIcon,       exact: false },
  { to: '/learning',  label: 'Learning', Icon: BrainIcon,          exact: false },
] as const;

interface SidebarProps {
  open:          boolean;
  onMouseLeave?: () => void;
  onCollapse?:   () => void;
}

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined)
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');

export default function Sidebar({ open, onMouseLeave, onCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${AGENT_HTTP}/api/version`)
      .then(r => r.json())
      .then((d: { backend: string }) => setBackendVersion(d.backend))
      .catch(() => {/* non-fatal */});
  }, []);

  function isActive(to: string, exact: boolean) {
    return exact ? location.pathname === to : location.pathname.startsWith(to);
  }

  function handleLogout() {
    clearAccessToken();
    void navigate({ to: '/login' });
  }

  return (
    /* Width transition applied directly — no class toggle = smooth GPU compositing */
    <aside
      onMouseLeave={onMouseLeave}
      style={{
        width:      open ? SIDEBAR_WIDTH : 0,
        flexShrink: 0,
        height:     '100%',
        display:    'flex',
        flexDirection: 'column',
        overflow:   'hidden',
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-primary)',
        /* exact bz-codespace: transition-[width] duration-300 ease-in-out */
        transition: 'width 300ms ease-in-out',
        willChange: 'width',
      }}
    >
      {/* ── Scrollable nav — flex-1 ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        minHeight: 0,
        /* custom thin scrollbar matching bz-codespace */
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(20,115,223,0.2) transparent',
      }}>
        <nav style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 12px 16px',
          /* width must be explicit so content doesn't reflow during animation */
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
        }}>
          {NAV_ITEMS.map(({ to, label, Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         10,           /* mr-2.5 ≈ 10px */
                  margin:      '1px 0',
                  padding:     '8px 8px',
                  borderRadius: 8,
                  fontSize:    13,
                  fontWeight:  active ? 500 : 400,
                  color:       active ? '#fff' : 'var(--text-secondary)',
                  background:  active ? 'var(--accent-blue)' : 'transparent',
                  textDecoration: 'none',
                  whiteSpace:  'nowrap',
                  transition:  'background 120ms ease, color 120ms ease',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-tertiary)';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                    const icon = e.currentTarget.querySelector('span') as HTMLSpanElement | null;
                    if (icon) { icon.style.borderColor = 'var(--accent-blue)'; icon.style.color = 'var(--accent-blue)'; }
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                    const icon = e.currentTarget.querySelector('span') as HTMLSpanElement | null;
                    if (icon) { icon.style.borderColor = 'var(--border-primary)'; icon.style.color = 'var(--text-secondary)'; }
                  }
                }}
              >
                {/* Square icon container — matches TopBar logo-mark style */}
                <span style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  background: active
                    ? 'rgba(255,255,255,0.18)'
                    : 'var(--bg-tertiary)',
                  border: active
                    ? '1px solid rgba(255,255,255,0.12)'
                    : '1px solid var(--border-primary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  transition: 'background 120ms ease, border-color 120ms ease',
                }}>
                  <Icon size={14} weight={active ? 'fill' : 'duotone'} />
                </span>
                <span style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '1',
                }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Footer — shrink-0, border-top ── */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border-primary)',
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        {/* Settings link */}
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to={'/settings' as any}
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:         8,
            padding:     '8px 8px',
            borderRadius: 8,
            fontSize:    13,
            fontWeight:  isActive('/settings', false) ? 500 : 400,
            color:       isActive('/settings', false) ? '#fff' : 'var(--text-secondary)',
            background:  isActive('/settings', false) ? 'var(--accent-blue)' : 'transparent',
            textDecoration: 'none',
            whiteSpace:  'nowrap',
            transition:  'background 120ms ease, color 120ms ease',
          }}
          onMouseEnter={e => {
            if (!isActive('/settings', false)) {
              (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-tertiary)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            }
          }}
          onMouseLeave={e => {
            if (!isActive('/settings', false)) {
              (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }
          }}
        >
          <GearIcon size={15} weight={isActive('/settings', false) ? 'fill' : 'regular'} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1' }}>Settings</span>
        </Link>

        {/* Collapse button */}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse navigation"
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         8,
              width:       '100%',
              padding:     '8px 8px',
              borderRadius: 8,
              border:      'none',
              background:  'transparent',
              fontSize:    13,
              color:       'var(--text-secondary)',
              cursor:      'pointer',
              textAlign:   'left',
              whiteSpace:  'nowrap',
              transition:  'background 120ms ease, color 120ms ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
          >
            {/* ‹‹ double chevron left */}
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M8.5 3L4.5 7.5L8.5 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 3L8 7.5L12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Collapse</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:         8,
            width:       '100%',
            padding:     '8px 8px',
            borderRadius: 8,
            border:      'none',
            background:  'transparent',
            fontSize:    13,
            color:       'var(--text-secondary)',
            cursor:      'pointer',
            textAlign:   'left',
            whiteSpace:  'nowrap',
            transition:  'background 120ms ease, color 120ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          <SignOutIcon size={15} style={{ flexShrink: 0 }} />
          <span>Sign out</span>
        </button>

        {/* Version badge */}
        <div style={{
          marginTop: 8,
          padding: '4px 8px',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}>
          FE v{FRONTEND_VERSION}{backendVersion ? ` · BE v${backendVersion}` : ''}
        </div>
      </div>
    </aside>
  );
}
