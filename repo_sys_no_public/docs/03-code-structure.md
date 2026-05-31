# Code Structure & Architecture

## Project Overview

The BoltzBit app template is a modern React application built with Vite, TanStack Router, and TypeScript. It follows a file-based routing pattern with a clear separation of concerns.

## Directory Structure

```
bz-app-template/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Chat.tsx
│   │   ├── Sidebar.tsx
│   │   └── ThemeToggle.tsx
│   ├── hooks/               # Custom React hooks
│   │   ├── useAppChat.ts
│   │   └── usePebbleChat.ts
│   ├── routes/              # File-based routing
│   │   ├── __root.tsx       # Root layout
│   │   ├── login.tsx        # Public login page
│   │   └── _app/            # Protected routes group
│   │       ├── route.tsx    # Layout for protected routes
│   │       ├── index.tsx    # Home page
│   │       ├── chat.tsx     # Chat page
│   │       └── pebble.tsx   # Pebble dashboard page
│   ├── auth.ts              # Authentication setup
│   ├── main.tsx             # Application entry point
│   ├── query-client.ts      # React Query configuration
│   ├── router.tsx           # Router configuration
│   ├── routeTree.gen.ts     # Auto-generated route tree
│   └── styles.css           # Global styles
├── biome.json               # Linter/formatter config
├── package.json
├── tsconfig.json            # TypeScript references
├── tsconfig.base.json       # Base TypeScript config
├── tsconfig.node.json       # Node-specific TS config
├── tsconfig.vite.json       # Vite-specific TS config
└── vite.config.ts           # Vite configuration
```

## Application Entry Point

### [src/main.tsx](../src/main.tsx)

The main entry point initializes authentication, chat, and renders the app:

```typescript
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

try {
  await setupAuth();
  initChat({ bzApiClient: apiClient });

  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<RouterProvider router={router} />);
  }
} catch (err) {
  console.error('Failed to initialize auth:', err);
  // Error UI
}
```

**Key Features:**
- Top-level await for auth initialization
- Intent-based prefetching
- Scroll restoration
- Error boundary with graceful degradation

## Routing Architecture

### File-Based Routing

The template uses TanStack Router with file-based routing conventions:

```
routes/
├── __root.tsx         → "/"     (root layout)
├── login.tsx          → "/login"
└── _app/              → Protected route group
    ├── route.tsx      → "/"     (layout + auth guard)
    ├── index.tsx      → "/"     (home page)
    ├── chat.tsx       → "/chat"
    └── pebble.tsx     → "/pebble"
```

### Route Patterns

#### Root Route ([src/routes/__root.tsx](../src/routes/__root.tsx))

Provides global providers for the entire app:

```typescript
export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
```

#### Layout Routes ([src/routes/_app/route.tsx](../src/routes/_app/route.tsx))

Layout routes use the `_` prefix and provide shared UI + logic:

```typescript
export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!OAuthStore.getState().currentUser) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const appChat = useAppChat();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />  {/* Child routes render here */}
      </main>
      <ChatBubble>
        <Chat chat={appChat} />
      </ChatBubble>
    </div>
  );
}
```

**Key Features:**
- Authentication guard in `beforeLoad`
- Shared layout (sidebar + chat bubble)
- Outlet for child route content

#### Page Routes ([src/routes/_app/index.tsx](../src/routes/_app/index.tsx))

Individual pages are simple components:

```typescript
export const Route = createFileRoute('/_app/')({
  component: Home,
});

function Home() {
  return <div>Home page content</div>;
}
```

### Route Tree Generation

Routes are automatically discovered and typed:

```typescript
// Auto-generated: src/routeTree.gen.ts
import { Route as rootRoute } from './routes/__root';
import { Route as AppRoute } from './routes/_app/route';
import { Route as ChatRoute } from './routes/_app/chat';
// ... etc
```

**Benefits:**
- Type-safe navigation
- Autocomplete for route paths
- Compile-time route validation

## Component Architecture

### Component Categories

#### 1. Layout Components
- **Sidebar**: Navigation and app header
- **AppLayout**: Main application shell

#### 2. Feature Components
- **Chat**: AI chat interface
- **ThemeToggle**: Dark/light mode switcher

#### 3. Page Components
- **Home**: Landing page with feature cards
- **ChatPage**: Full-page chat interface
- **PebblePage**: Dashboard builder

### Component Patterns

#### Props Typing

Always explicitly type component props:

```typescript
type ChatProps = {
  className?: string;
  chat: UseChatReturn;
  suggestions?: { text: string; delay: string }[];
};

export default function Chat({ className, chat, suggestions }: ChatProps) {
  // ...
}
```

#### Default Props

Use default parameters instead of `defaultProps`:

```typescript
function Chat({ suggestions = defaultSuggestions }: ChatProps) {
  // ...
}
```

#### Component Composition

Leverage composition over inheritance:

```typescript
<ChatConversation.Container>
  <ChatConversation.Block
    chatRole={msg.role}
    content={msg.content}
  />
</ChatConversation.Container>
```

## Custom Hooks

### Hook Organization

Custom hooks are stored in `src/hooks/` and follow the `use` prefix convention:

```typescript
// src/hooks/useAppChat.ts
export function useAppChat() {
  const apiTools = useBzApiTools();
  const dynasDbTools = useDynasDbTools({
    client: dynasClient,
    appId: import.meta.env.VITE_DYNAS_APP_ID,
  });

  return useChat({
    chatKey: 'app-chat',
    model: 'anthropic-claude-4.5-sonnet',
    tools: [...apiTools, ...dynasDbTools],
  });
}
```

### Hook Patterns

#### Composition
Hooks compose other hooks:

```typescript
export function usePebbleChat({ onConfirm }: UsePebbleChatOptions) {
  const apiTools = useBzApiTools();
  const pebbleTools = usePebbleTools({ bzApiClient: apiClient, onConfirm });
  const dynasDbTools = useDynasDbTools({ client: dynasClient, appId });

  return useChat({
    chatKey: 'pebble-chat',
    tools: [...apiTools, ...pebbleTools, ...dynasDbTools],
  });
}
```

#### Type Safety
Export and use specific types:

```typescript
type UsePebbleChatOptions = {
  onConfirm: (pebble: { spec: PebbleSpec; queries?: Record<string, DataQuery> }) => void;
};
```

## State Management

### React State
Local component state uses `useState`:

```typescript
const [value, setValue] = useState('');
const [loading, setLoading] = useState(false);
```

### Refs for Mutable Values
Use `useRef` for values that don't trigger re-renders:

```typescript
const layoutRef = useRef(layout);
layoutRef.current = layout;
```

### Zustand (via Auth Utils)
Authentication state is managed by Zustand store:

```typescript
import { OAuthStore } from '@boltzbit/auth-utils';

const currentUser = OAuthStore.getState().currentUser;
```

### React Query
Server state is managed by TanStack Query:

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['key'],
  queryFn: fetchData,
});
```

## Build Configuration

### Vite Config ([vite.config.ts](../vite.config.ts))

```typescript
export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
});
```

**Plugins:**
- `tsconfigPaths`: Path alias resolution
- `tailwindcss`: CSS processing
- `tanstackRouter`: Route generation + code splitting
- `viteReact`: React Fast Refresh

### TypeScript Configuration

The project uses composite TypeScript projects:

```json
// tsconfig.json
{
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.vite.json" }
  ]
}
```

**Benefits:**
- Faster incremental builds
- Better IDE performance
- Separate configs for different contexts

### Path Aliases

Import aliases are configured in `package.json`:

```json
{
  "imports": {
    "#/*": "./src/*"
  }
}
```

**Usage:**
```typescript
import { apiClient } from '#/auth';
import Chat from '#/components/Chat';
```

## Module Patterns

### Named Exports

Prefer named exports for utilities:

```typescript
// auth.ts
export { apiClient, dynasClient };
export async function setupAuth() { }
```

### Default Exports

Use default exports for components:

```typescript
// Chat.tsx
export default function Chat({ chat }: ChatProps) { }
```

### Type-Only Imports

Import types explicitly:

```typescript
import type { UseChatReturn } from '@boltzbit/chat';
import type { DynasClient } from '@boltzbit/dynas-client';
```

## Data Flow

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ↓
┌──────────────┐      ┌───────────────┐
│  Components  │ ←──→ │  Custom Hooks │
└──────┬───────┘      └───────┬───────┘
       │                      │
       ↓                      ↓
┌──────────────┐      ┌───────────────┐
│ React Query  │      │  API Clients  │
└──────┬───────┘      └───────┬───────┘
       │                      │
       ↓                      ↓
┌───────────────────────────────┐
│      Backend Services         │
└───────────────────────────────┘
```

## Code Splitting

### Automatic Route-Based Splitting

TanStack Router automatically code-splits by route:

```typescript
tanstackRouter({
  target: 'react',
  autoCodeSplitting: true
})
```

### Manual Lazy Loading

For large components:

```typescript
import { lazy } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

## Error Handling

### Route-Level Errors

Routes can define error boundaries:

```typescript
export const Route = createFileRoute('/example')({
  component: Example,
  errorComponent: ErrorComponent,
});
```

### Component-Level Errors

Use try-catch in async handlers:

```typescript
async function handleAction() {
  try {
    await someAsyncOperation();
  } catch (error) {
    console.error('Operation failed:', error);
    setError('User-friendly message');
  }
}
```

## Testing Strategy

### Test Files

Tests are placed alongside source files:

```
src/
├── components/
│   ├── Chat.tsx
│   └── Chat.test.tsx
```

### Testing Tools

From `package.json`:
- **Vitest**: Unit and integration tests
- **@testing-library/react**: Component testing
- **jsdom**: DOM simulation

## Performance Optimizations

1. **Intent-Based Prefetching**: Hover to preload
2. **Code Splitting**: Route-based automatic splitting
3. **Memoization**: `useCallback` for stable functions
4. **Ref Usage**: Avoid re-renders for non-reactive values
5. **Lazy Loading**: Defer heavy component loads

## Best Practices Summary

1. **File organization**: Group by feature/route
2. **Component structure**: Single responsibility
3. **Type safety**: Explicit prop types
4. **Error handling**: Try-catch + user feedback
5. **State management**: Use the right tool (useState vs Query vs Zustand)
6. **Imports**: Use path aliases (`#/`)
7. **Exports**: Named for utils, default for components
8. **Hooks**: Compose and reuse logic
9. **Routes**: File-based, type-safe navigation
10. **Build**: Leverage Vite for fast HMR
