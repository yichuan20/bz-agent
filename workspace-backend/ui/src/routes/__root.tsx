import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import '#/styles.css';

export const Route = createRootRoute({
  component: RootLayout,
});

const NAV_ITEMS = [
  { to: '/', label: 'Home', exact: true },
  { to: '/agents', label: 'Agents', exact: false },
] as const;

function RootLayout() {
  const { location } = useRouterState();

  function isActive(to: string, exact: boolean) {
    return exact ? location.pathname === to : location.pathname.startsWith(to);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          padding: '0 24px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          height: '48px',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: 600, marginRight: '8px' }}>Workspace</span>
        <nav style={{ display: 'flex', gap: '4px', height: '100%' }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  fontSize: '13px',
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                  textDecoration: 'none',
                  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                  transition: 'color 120ms ease, border-color 120ms ease',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
