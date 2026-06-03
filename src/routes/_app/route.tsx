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
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import Sidebar from '#/components/Sidebar';
import TopBar  from '#/components/TopBar';
import { isLoggedIn, useIsLoggedIn } from '#/auth-store';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!isLoggedIn()) throw redirect({ to: '/login' });
  },
  component: AppLayout,
});

function AppLayout() {
  const loggedIn     = useIsLoggedIn();
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [hoveredOpen,  setHoveredOpen]  = useState(false);

  if (!loggedIn) return null;

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
            >
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
