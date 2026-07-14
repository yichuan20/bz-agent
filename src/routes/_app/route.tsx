/**
 * App layout — exact bz-codespace AppShell:
 *
 *   ┌──────────────────────────────────────────┐  TopBar  (52px, full width)
 *   ├────────┬─────────────────────────────────┤
 *   │Sidebar │        <Outlet />               │  Sidebar: 220px open, 0px collapsed
 *   │(220px) │        (app-main)               │  Hover left edge → temporary reveal
 *   └────────┴─────────────────────────────────┘
 *
 * Collapse behavior (bz-codespace):
 *   • sidebarOpen=false → sidebar width: 0  (fully hidden, not icon-mode)
 *   • 2px hover zone at left edge → hoveredOpen=true → sidebar slides in as overlay
 *   • Mouse leaves sidebar → hoveredOpen=false → sidebar slides out
 */
import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import Sidebar from '#/components/Sidebar';
import TopBar  from '#/components/TopBar';
import { ModeSelector } from '#/components/ModeSelector';
import type { AgentMode } from '#/lib/agentModes';

declare global { interface WindowEventMap { 'bz:start-new-session': CustomEvent<{ mode: AgentMode }> } }

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined)
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');

function useBzcodeOutdated(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    fetch(`${AGENT_HTTP}/api/version`)
      .then(r => r.json())
      .then((d: { bzcode?: string | null; bzcode_latest?: string | null }) => {
        if (!d.bzcode || !d.bzcode_latest) return;
        const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
        const cur = parse(d.bzcode);
        const lat = parse(d.bzcode_latest);
        for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
          const c = cur[i] ?? 0, l = lat[i] ?? 0;
          if (c < l) { setOutdated(true); return; }
          if (c > l) return;
        }
      })
      .catch(() => null);
  }, []);
  return outdated;
}

export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  const bzcodeOutdated = useBzcodeOutdated();
  const navigate = useNavigate();
  const { location } = useRouterState();

  const [sidebarOpen,      setSidebarOpen]      = useState(true);
  const [hoveredOpen,      setHoveredOpen]      = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  const navOpen = sidebarOpen || hoveredOpen;

  function toggleSidebar() {
    setSidebarOpen(prev => !prev);
    setHoveredOpen(false);
  }

  function handleModeSelected(mode: AgentMode) {
    setShowNewChatModal(false);
    if (location.pathname.startsWith('/agent')) {
      // agent.tsx is mounted — let it handle session creation
      window.dispatchEvent(new CustomEvent('bz:start-new-session', { detail: { mode } }));
    } else {
      // Navigate to /agent then let it pick up the event
      void navigate({ to: '/agent', search: {} as never });
      setTimeout(() => window.dispatchEvent(new CustomEvent('bz:start-new-session', { detail: { mode } })), 80);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />

      <div className="app-body">
        <Sidebar
          open={navOpen}
          overlay={!sidebarOpen}
          onMouseLeave={() => setHoveredOpen(false)}
          onCollapse={toggleSidebar}
          bzcodeOutdated={bzcodeOutdated}
          onNewChat={() => setShowNewChatModal(true)}
        />

        {/* Hover strip + expand indicator — only when sidebar is fully closed */}
        {!sidebarOpen && (
          <div
            className="sidebar-expand-zone"
            onMouseEnter={() => setHoveredOpen(true)}
            onClick={toggleSidebar}
          >
            <button
              type="button"
              className="sidebar-expand-indicator"
              title="Open navigation"
            >
              {bzcodeOutdated && (
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  width: 8, height: 8,
                  borderRadius: '50%',
                  background: '#f97316',
                  border: '2px solid var(--bg-primary)',
                  pointerEvents: 'none',
                }} />
              )}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {showNewChatModal && (
          <div className="new-session-overlay" onClick={() => setShowNewChatModal(false)}>
            <div className="new-session-panel" onClick={e => e.stopPropagation()}>
              <div className="new-session-header">
                <span className="new-session-title">New chat</span>
              </div>
              <p className="new-session-hint">Select how this agent should behave.</p>
              <ModeSelector selected="general" onSelect={handleModeSelected} />
              <button type="button" className="new-session-cancel" onClick={() => setShowNewChatModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
