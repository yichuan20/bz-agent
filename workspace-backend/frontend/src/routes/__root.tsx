import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet, redirect } from '@tanstack/react-router';

import '../styles.css';
import { queryClient } from '#/query-client';

export const Route = createRootRoute({
  beforeLoad: () => {
    // Gateway injects JWT into the URL path as /token=eyJ... — strip it and go home.
    if (window.location.pathname.startsWith('/token=')) {
      window.history.replaceState(null, '', '/');
      throw redirect({ to: '/' });
    }
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
