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
import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import Sidebar from '#/components/Sidebar';
import TopBar  from '#/components/TopBar';
import { isLoggedIn } from '#/auth-store';

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
  beforeLoad: async () => {
    if (isLoggedIn()) return; // frontend JWT present — let through
    try {
      const res = await fetch(`${AGENT_HTTP}/auth/status`);
      if (res.ok) {
        const data = await res.json() as { valid: boolean };
        if (data.valid) return; // server has valid BZ_HOME credentials — let through
      }
    } catch {}
    throw redirect({ to: '/login' });
  },
  component: AppLayout,
});

function AppLayout() {
  const pathname  = useRouterState({ select: s => s.location.pathname });
  const onAgent   = pathname === '/agent';
  const bzcodeOutdated = useBzcodeOutdated();

  const [sidebarOpen,  setSidebarOpen]  = useState(!onAgent);
  const [hoveredOpen,  setHoveredOpen]  = useState(false);

  // Auto-collapse when entering agent, restore when leaving
  useEffect(() => {
    setSidebarOpen(!onAgent);
    setHoveredOpen(false);
  }, [onAgent]);

  const navOpen = sidebarOpen || hoveredOpen;

  function toggleSidebar() {
    setSidebarOpen(prev => !prev);
    setHoveredOpen(false);
  }

  return (
    <div className="app-shell">
      <TopBar />

      <div className="app-body">
        <Sidebar
          open={navOpen}
          onMouseLeave={() => setHoveredOpen(false)}
          onCollapse={toggleSidebar}
          bzcodeOutdated={bzcodeOutdated}
        />

        {/* Hover strip + expand indicator — only when sidebar is fully closed */}
        {!sidebarOpen && (
          <>
            <div
              className="sidebar-hover-zone"
              onMouseEnter={() => setHoveredOpen(true)}
            />
            <button
              type="button"
              className="sidebar-expand-indicator"
              title="Open navigation"
              onClick={toggleSidebar}
              onMouseEnter={() => setHoveredOpen(true)}
              style={{ position: 'relative' }}
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
          </>
        )}

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
