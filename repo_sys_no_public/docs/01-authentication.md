# Authentication System

## Overview

The BoltzBit app template uses OAuth-based authentication through the `@boltzbit/auth-utils` package. Authentication is centrally managed and integrated throughout the application.

## Core Components

### 1. Authentication Setup ([src/auth.ts](../src/auth.ts))

The authentication module initializes OAuth and creates authenticated API clients:

```typescript
import { getAccessToken, initOAuth } from '@boltzbit/auth-utils';
import { createBzApiClient } from '@boltzbit/bz-api-client';
import { createDynasClient } from '@boltzbit/dynas-client';

export async function setupAuth() {
  await initOAuth({
    clientId: import.meta.env.VITE_OAUTH_CLIENT_ID,
    redirectUri: `${window.location.origin}/`,
    apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}`,
    gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
  });
}
```

**Key Features:**
- OAuth initialization with configurable client ID and redirect URI
- Automatic token management via `getAccessToken()`
- Falls back to `'PUBLIC'` token when no user is authenticated

### 2. API Client Configuration

Two authenticated clients are exported:

#### BZ API Client
```typescript
const apiClient = createBzApiClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});
```

#### Dynas Client (Database)
```typescript
const dynasClient = createDynasClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-dynas/api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});
```

## Login Flow

### Login Page ([src/routes/login.tsx](../src/routes/login.tsx))

```typescript
function Login() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: '/' });
    }
  }, [isAuthenticated, navigate]);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      await startOAuthFlow();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }
}
```

**Flow:**
1. User clicks "Sign in with BoltzHub"
2. `startOAuthFlow()` initiates OAuth redirect
3. User authenticates with BoltzHub
4. Redirect back to app with auth code
5. Token exchange happens automatically
6. User is redirected to home page

## Protected Routes

### Route Protection ([src/routes/_app/route.tsx](../src/routes/_app/route.tsx))

Protected routes use the `beforeLoad` hook to enforce authentication:

```typescript
export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!OAuthStore.getState().currentUser) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});
```

**Key Points:**
- All routes under `_app` are protected
- Unauthenticated users are redirected to `/login`
- Uses `OAuthStore` for state management
- Checks occur before component rendering

### Runtime Authentication Check

Components can also check authentication status reactively:

```typescript
function AppLayout() {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return null; // or loading state
  }

  return <YourProtectedContent />;
}
```

## Logout Flow

### Logout Implementation ([src/components/Sidebar.tsx](../src/components/Sidebar.tsx))

```typescript
import { logout } from '@boltzbit/auth-utils';

function handleLogout() {
  logout();
  void navigate({ to: '/login' });
}
```

**Behavior:**
- Clears authentication tokens
- Clears user session state
- Redirects to login page
- Does not reload the page (SPA navigation)

## Environment Variables

Required environment variables for authentication:

```env
VITE_OAUTH_CLIENT_ID=your_client_id
VITE_API_BASE_URL=https://api.example.com
VITE_GATEWAY_URL=https://gateway.example.com
```

## Hooks & Utilities

### `useIsAuthenticated()`
Returns boolean indicating current authentication state. Reactive and updates when auth state changes.

```typescript
const isAuthenticated = useIsAuthenticated();
```

### `getAccessToken()`
Synchronously retrieves the current access token. Returns `null` if not authenticated.

```typescript
const token = getAccessToken();
```

### `OAuthStore`
Zustand store managing OAuth state, including `currentUser`.

```typescript
const currentUser = OAuthStore.getState().currentUser;
```

## Application Initialization ([src/main.tsx](../src/main.tsx))

The app initialization ensures auth is ready before rendering:

```typescript
try {
  await setupAuth();
  initChat({ bzApiClient: apiClient });

  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<RouterProvider router={router} />);
  }
} catch (err) {
  console.error('Failed to initialize auth:', err);
  rootElement.innerHTML =
    '<pre>Failed to initialize authentication. Please refresh the page.</pre>';
}
```

**Critical Steps:**
1. `setupAuth()` completes before any rendering
2. Chat system initialized with authenticated client
3. Graceful error handling with user-friendly message
4. No double-render (checks for existing content)

## Best Practices

1. **Always use `void` for promises in event handlers:**
   ```typescript
   onClick={() => void handleLogin()}
   ```

2. **Check authentication at route level:**
   Use `beforeLoad` for redirects before rendering

3. **Handle loading states:**
   Show loading UI during OAuth flow

4. **Graceful degradation:**
   Use `'PUBLIC'` token fallback for unauthenticated API calls

5. **Error handling:**
   Catch OAuth errors and show user-friendly messages

## Security Considerations

- Tokens are managed by `@boltzbit/auth-utils` package
- Never store tokens manually in localStorage
- OAuth state is handled securely by the library
- PKCE flow is used for enhanced security
- Token refresh is automatic
