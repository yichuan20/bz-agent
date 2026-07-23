/**
 * Sidebar — icon-only collapsed (52px) or expanded (220px) mode.
 * No TopBar: logo, theme toggle, and user avatar all live here.
 *
 * Layout:
 *   Header  — logo mark + "BoltzAgent" text (hidden when collapsed) + toggle button
 *   Body    — new-chat button, nav items, sessions list (hidden when collapsed)
 *   Footer  — settings, theme toggle, user avatar (sign-out)
 */
import {
  BrainIcon,
  GearIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TerminalIcon,
  UserCircleIcon,
} from '@phosphor-icons/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoltzAgentLogo } from '#/components/BoltzAgentLogo';
import { MODE_COLORS, ModeIconSvg } from '#/components/ModeIconSvg';
import { applyTheme, getCurrentMode } from '#/design-tokens';

import { HTTP_BASE, getApiKeyStatus, getUserMe, listSessions as apiListSessions, deleteSession as apiDeleteSession, renameSession as apiRenameSession } from '#/lib/api';
// HTTP_BASE imported from '#/lib/api'

const SIDEBAR_WIDTH = 220;
const SIDEBAR_ICON_WIDTH = 52;

const NAV_ITEMS = [
  { to: '/agent', label: 'Agent', Icon: TerminalIcon, exact: false },
  { to: '/learning', label: 'Learning', Icon: BrainIcon, exact: false },
] as const;

type SessionItem = {
  sessionId: string;
  workingDir: string;
  dirName: string;
  title: string;
  lastModified: number;
  mode?: string;
};

interface SidebarProps {
  expanded: boolean;
  onToggle?: () => void;
  bzcodeOutdated?: boolean;
  onNewChat?: () => void;
}

// ── Context menu ──────────────────────────────────────────────────────────────
interface CtxMenu {
  sessionId: string;
  title: string;
  x: number;
  y: number;
}

export default function Sidebar({ expanded, onToggle, bzcodeOutdated, onNewChat }: SidebarProps) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [copied, setCopied] = useState(false);
  // Rename inline state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  // Theme state (moved from TopBar)
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

  // API key status (lightweight — status-only, 60s poll)
  const [keyPresent, setKeyPresent] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => {
      getApiKeyStatus(HTTP_BASE)
        .then((d) => setKeyPresent(d.present))
        .catch(() => null);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  const keyDotColor =
    keyPresent === true ? '#22c55e' : keyPresent === false ? '#ef4444' : '#6b7280';

  // User info from BoltzHub
  const [userInfo, setUserInfo] = useState<{ displayName: string; email: string } | null>(null);
  useEffect(() => {
    getUserMe(HTTP_BASE)
      .then(d => {
        if (d?.displayName) setUserInfo({ displayName: d.displayName, email: d.email ?? '' });
      })
      .catch(() => null);
  }, []);

  function userInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  // Read current sessionId from URL search params for active highlight
  const currentSessionId =
    (location.search as Record<string, string | undefined>).sessionId ?? null;

  const loadSessions = useCallback(() => {
    apiListSessions(HTTP_BASE)
      .then(d => {
        setSessions((d.sessions ?? []).sort((a, b) => b.lastModified - a.lastModified));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadSessions();
    const id = setInterval(loadSessions, 30_000);
    return () => clearInterval(id);
  }, [loadSessions]);

  useEffect(() => {
    if (!currentSessionId) return;
    loadSessions();
  }, [currentSessionId, loadSessions]);

  // Dismiss context menu on outside click / scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = () => setCtxMenu(null);
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismiss);
    window.addEventListener('scroll', dismiss, { capture: true });
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('scroll', dismiss, { capture: true });
    };
  }, [ctxMenu]);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  function handleSessionClick(s: SessionItem) {
    if (renamingId === s.sessionId) return;
    void navigate({
      to: '/agent',
      search: { cwd: s.workingDir, sessionId: s.sessionId, mode: s.mode ?? 'general' } as never,
    });
    window.dispatchEvent(
      new CustomEvent('bz:open-session', {
        detail: { cwd: s.workingDir, sessionId: s.sessionId, mode: s.mode ?? 'general' },
      }),
    );
  }

  function handleContextMenu(e: React.MouseEvent, s: SessionItem) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ sessionId: s.sessionId, title: s.title || s.dirName, x: e.clientX, y: e.clientY });
  }

  function copySessionId(sessionId: string) {
    navigator.clipboard.writeText(sessionId).catch(() => null);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setCtxMenu(null);
    }, 1200);
  }

  function startRename(sessionId: string, currentTitle: string) {
    setCtxMenu(null);
    setRenamingId(sessionId);
    setRenameVal(currentTitle);
  }

  function commitRename(sessionId: string) {
    const trimmed = renameVal.trim();
    setRenamingId(null);
    if (!trimmed) return;
    apiRenameSession(HTTP_BASE, sessionId, trimmed)
      .then(() => loadSessions())
      .catch(() => null);
  }

  function deleteSession(sessionId: string) {
    setCtxMenu(null);
    if (!confirm('Delete this session? This cannot be undone.')) return;
    apiDeleteSession(HTTP_BASE, sessionId)
      .then(() => {
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
        if (sessionId === currentSessionId) {
          void navigate({ to: '/agent' });
        }
      })
      .catch(() => null);
  }

  function isActive(to: string, exact: boolean) {
    return exact ? location.pathname === to : location.pathname.startsWith(to);
  }

  const w = expanded ? SIDEBAR_WIDTH : SIDEBAR_ICON_WIDTH;

  // Custom tooltip (replaces slow native title tooltips in collapsed mode)
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showTooltip(label: string, el: HTMLElement) {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTooltip({ label, y: rect.top + rect.height / 2 });
    }, 120);
  }

  function hideTooltip() {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = null;
    setTooltip(null);
  }

  // Shared icon-button style for footer items
  const footerItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: expanded ? 8 : 0,
    justifyContent: expanded ? 'flex-start' : 'center',
    width: '100%',
    padding: expanded ? '7px 8px' : '10px 0',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
    transition: 'background 120ms ease, color 120ms ease',
    flexShrink: 0,
  };

  return (
    <aside
      style={{
        width: w,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-primary)',
        transition: 'width 250ms cubic-bezier(0.4,0,0.2,1)',
        willChange: 'width',
      }}
    >
      {/* ── Header: logo + toggle ── */}
      <div
        style={{
          flexShrink: 0,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center',
          padding: expanded ? '0 8px 0 12px' : '0',
          gap: 8,
          minWidth: w,
        }}
      >
        {expanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BoltzAgentLogo size={32} />
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
        )}
        {/* Collapsed + not hovered: logo directly (no button wrapper) */}
        {!expanded ? (
          <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={onToggle}>
            <BoltzAgentLogo size={32} />
            {bzcodeOutdated && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#f97316',
                  border: '1.5px solid var(--bg-primary)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 120ms ease, color 120ms ease',
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2" width="2" height="12" rx="1" fill="currentColor" opacity="0.6" />
              <path
                d={expanded ? 'M10 4L6 8L10 12' : 'M6 4L10 8L6 12'}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* ── New chat button ── */}
      <div style={{ flexShrink: 0, padding: expanded ? '0 12px 6px' : '0 10px 6px', minWidth: w }}>
        <button
          type="button"
          onClick={() => onNewChat?.()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: expanded ? 10 : 0,
            justifyContent: expanded ? 'flex-start' : 'center',
            width: '100%',
            padding: expanded ? '7px 8px' : '7px 0',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            textAlign: 'left',
            whiteSpace: 'nowrap',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
            if (!expanded) showTooltip('New chat', e.currentTarget as HTMLElement);
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            hideTooltip();
          }}
        >
          <PlusIcon size={16} weight="bold" style={{ flexShrink: 0, opacity: 0.75 }} />
          {expanded && <span>New chat</span>}
        </button>
      </div>

      {/* ── Nav items ── */}
      <div
        style={{
          flexShrink: 0,
          padding: expanded ? '0 12px 4px' : '0 10px 4px',
          minWidth: w,
        }}
      >
        {NAV_ITEMS.map(({ to, label, Icon, exact }) => {
          const active = isActive(to, exact);
          return (
            <Link
              key={to}
              to={to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: expanded ? 10 : 0,
                justifyContent: expanded ? 'flex-start' : 'center',
                margin: '1px 0',
                padding: expanded ? '7px 8px' : '9px 0',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? '#fff' : 'var(--text-secondary)',
                background: active ? 'var(--accent-blue)' : 'transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'background 120ms ease, color 120ms ease',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-tertiary)';
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                }
                if (!expanded) showTooltip(label, e.currentTarget as HTMLElement);
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                }
                hideTooltip();
              }}
            >
              <Icon
                size={16}
                weight={active ? 'fill' : 'regular'}
                style={{ flexShrink: 0, opacity: active ? 1 : 0.55 }}
              />
              {expanded && (
                <span
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1' }}
                >
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── Scrollable sessions list (only when expanded) ── */}
      {expanded && (
        <>
          {sessions.length > 0 && (
            <div style={{ flexShrink: 0, padding: '0 12px', minWidth: SIDEBAR_WIDTH }}>
              <div
                style={{ height: 1, background: 'var(--border-primary)', margin: '4px -12px 4px' }}
              />
              <div
                style={{
                  padding: '2px 8px 4px',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  userSelect: 'none',
                }}
              >
                Recent
              </div>
            </div>
          )}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              minHeight: 0,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(20,115,223,0.2) transparent',
              padding: '0 12px 8px',
              width: SIDEBAR_WIDTH,
              minWidth: SIDEBAR_WIDTH,
              boxSizing: 'border-box',
            }}
          >
            {sessions.map(s => {
              const modeKey =
                s.mode === 'widget'
                  ? 'canvas'
                  : s.mode === 'worker'
                    ? 'document'
                    : s.mode === 'coder'
                      ? 'code'
                      : 'chat';
              const accentColor = MODE_COLORS[modeKey] ?? 'var(--accent-blue)';
              const modeLabel =
                s.mode === 'widget'
                  ? 'Widget'
                  : s.mode === 'worker'
                    ? 'Worker'
                    : s.mode === 'coder'
                      ? 'Coder'
                      : 'General';
              const label = s.title || s.dirName;
              const isSessionActive = s.sessionId === currentSessionId;
              const isRenaming = renamingId === s.sessionId;

              return (
                <button
                  key={s.sessionId}
                  type="button"
                  className="sidebar-session-row"
                  data-tooltip={modeLabel}
                  onClick={() => handleSessionClick(s)}
                  onContextMenu={e => handleContextMenu(e, s)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    width: '100%',
                    margin: '1px 0',
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: isSessionActive ? 'var(--bg-tertiary)' : 'transparent',
                    fontSize: 12,
                    color: isSessionActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    transition: 'background 120ms ease, color 120ms ease',
                    borderLeft: isSessionActive
                      ? `2px solid ${accentColor}`
                      : '2px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isSessionActive) {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--bg-tertiary)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSessionActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      color: accentColor,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ModeIconSvg iconKey={modeKey} size={12} />
                  </span>
                  {isRenaming ? (
                    <input
                      ref={renameRef}
                      className="sidebar-rename-input"
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename(s.sessionId);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => commitRename(s.sessionId)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: '1.3',
                      }}
                    >
                      {label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Spacer when collapsed (sessions area replaced by flex spacer) */}
      {!expanded && <div style={{ flex: 1 }} />}

      {/* ── Footer ── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-primary)',
          padding: expanded ? '6px 12px' : '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          minWidth: w,
        }}
      >
        {/* Settings */}
        <Link
          to={'/settings' as never}
          style={{
            ...footerItemStyle,
            color: isActive('/settings', false) ? '#fff' : 'var(--text-secondary)',
            background: isActive('/settings', false) ? 'var(--accent-blue)' : 'transparent',
            textDecoration: 'none',
          }}
          onMouseEnter={e => {
            if (!isActive('/settings', false)) {
              (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-tertiary)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            }
            if (!expanded) showTooltip('Settings', e.currentTarget as HTMLElement);
          }}
          onMouseLeave={e => {
            if (!isActive('/settings', false)) {
              (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }
            hideTooltip();
          }}
        >
          <span style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
            <GearIcon size={16} weight={isActive('/settings', false) ? 'fill' : 'regular'} />
            {bzcodeOutdated && (
              <span
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#f97316',
                  border: '1.5px solid var(--bg-primary)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </span>
          {expanded && (
            <span
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1' }}
            >
              Settings
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          style={footerItemStyle}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            if (!expanded)
              showTooltip(
                theme === 'dark' ? 'Light mode' : 'Dark mode',
                e.currentTarget as HTMLElement,
              );
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            hideTooltip();
          }}
        >
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          {expanded && (
            <span style={{ flex: 1 }}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          )}
        </button>

        {/* User avatar — display only, no sign-out (API key auth) */}
        <div style={{ ...footerItemStyle, cursor: 'default' }}>
          <span
            title={!expanded ? (userInfo?.displayName ?? 'User') : undefined}
            style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          >
            {userInfo ? (
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--accent-blue)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                {userInitials(userInfo.displayName)}
              </span>
            ) : (
              <UserCircleIcon size={18} />
            )}
            <span
              style={{
                position: 'absolute',
                bottom: -1,
                right: -2,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: keyDotColor,
                border: '1.5px solid var(--bg-primary)',
              }}
            />
          </span>
          {expanded && (
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userInfo?.displayName ?? ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Collapsed tooltip ── */}
      {!expanded && tooltip && (
        <div
          style={{
            position: 'fixed',
            left: SIDEBAR_ICON_WIDTH + 10,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            letterSpacing: '0.01em',
          }}
        >
          {tooltip.label}
        </div>
      )}

      {/* ── Context menu (fixed position) ── */}
      {ctxMenu && (
        <div
          role="menu"
          className="sidebar-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            className="sidebar-ctx-item"
            onClick={() => copySessionId(ctxMenu.sessionId)}
          >
            {copied ? 'Copied!' : 'Copy session ID'}
          </button>
          <button
            type="button"
            className="sidebar-ctx-item"
            onClick={() => startRename(ctxMenu.sessionId, ctxMenu.title)}
          >
            Rename
          </button>
          <div className="sidebar-ctx-divider" />
          <button
            type="button"
            className="sidebar-ctx-item sidebar-ctx-item--danger"
            onClick={() => deleteSession(ctxMenu.sessionId)}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}
