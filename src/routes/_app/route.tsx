import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import Sidebar from '#/components/Sidebar';
import { isLoggedIn, useIsLoggedIn } from '#/auth-store';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!isLoggedIn()) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const loggedIn = useIsLoggedIn();

  if (!loggedIn) return null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
