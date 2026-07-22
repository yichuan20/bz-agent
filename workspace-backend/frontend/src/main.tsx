import { initChat } from '@boltzbit/chat';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';
import { apiClient } from './auth';
import { initializeTheme } from './design-tokens';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('Cannot find root element. Expecting #app.');
}

initializeTheme();
initChat({ bzApiClient: apiClient });

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
