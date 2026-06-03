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

  return (
    <div className="app-shell">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          setSidebarOpen(prev => !prev);
          setHoveredOpen(false);
        }}
      />

      <div className="app-body">
        <Sidebar
          open={navOpen}
          onMouseLeave={() => setHoveredOpen(false)}
        />

        {/* 2px hover strip — only visible when sidebar is fully closed */}
        {!sidebarOpen && (
          <div
            className="sidebar-hover-zone"
            onMouseEnter={() => setHoveredOpen(true)}
          />
        )}

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
