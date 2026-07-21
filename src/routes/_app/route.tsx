/**
 * App layout — ChatGPT/Claude/Gemini style:
 *   no top bar; sidebar always visible (expanded 220px ↔ icon-only 52px)
 *
 *   ┌──────────┬──────────────────────────────┐
 *   │ Sidebar  │       <Outlet />             │
 *   │ (220px   │       (app-main)             │
 *   │  or 52px)│                              │
 *   └──────────┴──────────────────────────────┘
 */
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Sidebar from '#/components/Sidebar';

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');

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
          const c = cur[i] ?? 0,
            l = lat[i] ?? 0;
          if (c < l) {
            setOutdated(true);
            return;
          }
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

  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem('bz:sidebarOpen') !== 'false',
  );

  function toggleSidebar() {
    setSidebarOpen(prev => {
      localStorage.setItem('bz:sidebarOpen', String(!prev));
      return !prev;
    });
  }

  return (
    <div className="app-shell">
      <Sidebar
        expanded={sidebarOpen}
        onToggle={toggleSidebar}
        bzcodeOutdated={bzcodeOutdated}
        onNewChat={() => void navigate({ to: '/' })}
      />

      <div className="app-body">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
