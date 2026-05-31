# Custom App Pages

This guide explains how to create custom app pages that hide the template navigation while preserving the chat bubble functionality.

## Overview

The bz-app-template includes a default layout with:
- **Template Sidebar** - Left navigation for Home, Chat, Pebble pages
- **Main Content Area** - With default padding
- **Chat Bubble** - AI assistant (always visible)

For custom app integrations (like n8n), you may want to:
- ✅ Keep the chat bubble
- ✅ Use your own navigation/layout
- ❌ Hide the template sidebar

## How It Works

### The `/_app` Layout Route

The main app layout ([src/routes/_app/route.tsx](../src/routes/_app/route.tsx)) controls:
1. Authentication check
2. Template sidebar visibility
3. Chat bubble placement

```tsx
// Routes that should hide the template sidebar and use their own layout
const CUSTOM_APP_ROUTES = ['/n8n'];

function AppLayout() {
  const matches = useMatches();

  // Check if current route is a custom app route
  const isCustomAppRoute = matches.some(match =>
    CUSTOM_APP_ROUTES.some(route => match.pathname.startsWith(route)),
  );

  return (
    <div>
      <div className="flex h-screen bg-background">
        {/* Hide template sidebar for custom app routes */}
        {!isCustomAppRoute && <Sidebar />}
        <main className={
          isCustomAppRoute
            ? 'flex flex-1 flex-col overflow-y-auto'
            : 'flex flex-1 flex-col overflow-y-auto p-8'
        }>
          <Outlet />
        </main>
      </div>
      {/* Chat bubble always visible */}
      <ChatBubble>
        <Chat chat={appChat} />
      </ChatBubble>
    </div>
  );
}
```

## Creating a Custom App Page

### Step 1: Register the Route

Add your app route to `CUSTOM_APP_ROUTES` in [src/routes/_app/route.tsx](../src/routes/_app/route.tsx):

```tsx
const CUSTOM_APP_ROUTES = [
  '/n8n',
  '/your-app',  // ← Add your route here
];
```

**Important:** Use the full route path starting with `/`. Routes starting with this path will automatically:
- Hide the template sidebar
- Remove default padding from main content area
- Keep the chat bubble visible

### Step 2: Create Layout Route

Create a layout route file: `src/routes/_app/your-app.tsx`

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { YourAppSidebar } from '#/components/your-app/Sidebar';
import '#/styles/your-app.css';

export const Route = createFileRoute('/_app/your-app')({
  component: YourAppLayout,
});

function YourAppLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      <YourAppSidebar />
      <Outlet />
    </div>
  );
}
```

**Key Points:**
- File must be in `src/routes/_app/` directory
- Use `createFileRoute('/_app/your-app')` to create nested route
- Return a full-height container (`h-full`)
- Include your own sidebar/navigation if needed
- Use `<Outlet />` to render child routes

### Step 3: Create Child Routes

Create child route files in `src/routes/_app/your-app/`:

```
src/routes/_app/your-app/
├── index.tsx              # /your-app
├── dashboard.tsx          # /your-app/dashboard
└── settings.$id.tsx       # /your-app/settings/:id
```

Example child route:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { YourAppDashboard } from '#/components/your-app/Dashboard';

export const Route = createFileRoute('/_app/your-app/dashboard')({
  component: YourAppDashboard,
});
```

### Step 4: Create Components

Organize your app-specific components:

```
src/components/your-app/
├── Sidebar.tsx
├── Dashboard.tsx
├── Settings.tsx
└── icons/
    └── YourAppIcons.tsx
```

### Step 5: Add Styles (Optional)

Create app-specific styles:

```
src/styles/your-app.css
```

Import in your layout route:

```tsx
import '#/styles/your-app.css';
```

## Example: N8n Integration

The n8n integration is a complete example of a custom app page:

### File Structure

```
src/
├── routes/
│   └── _app/
│       ├── n8n.tsx                    # Layout route
│       └── n8n/
│           ├── index.tsx              # Redirects to insights
│           ├── home.tsx               # Home page
│           ├── insights.$metricId.tsx # Insights dashboard
│           └── workflow.$workflowId.tsx # Workflow editor
├── components/
│   └── n8n/
│       ├── Sidebar.tsx                # N8n navigation
│       ├── InsightsPage.tsx
│       ├── WorkflowEditorPage.tsx
│       └── icons/
│           └── N8nIcons.tsx
├── mocks/
│   ├── sidebar.ts                     # N8n menu data
│   ├── insights.ts                    # Metrics data
│   └── workflow.ts                    # Workflow nodes data
└── styles/
    ├── n8n.css                        # N8n wrapper
    └── theme.css                      # N8n theme variables
```

### Registration

In [src/routes/_app/route.tsx](../src/routes/_app/route.tsx):

```tsx
const CUSTOM_APP_ROUTES = ['/n8n'];
```

### Layout Route

[src/routes/_app/n8n.tsx](../src/routes/_app/n8n.tsx):

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Sidebar } from '#/components/n8n/Sidebar';
import '#/styles/n8n.css';

export const Route = createFileRoute('/_app/n8n')({
  component: N8nLayout,
});

function N8nLayout() {
  return (
    <div className="flex h-full overflow-hidden bg-(--chat--body--background)">
      <Sidebar />
      <Outlet />
    </div>
  );
}
```

## Best Practices

### ✅ Do

1. **Always register your route** in `CUSTOM_APP_ROUTES`
2. **Use full-height containers** (`h-full`, `h-screen`) in your layout
3. **Organize components** by app name (`components/your-app/`)
4. **Use mock data** during development (`mocks/your-app-data.ts`)
5. **Import styles** in layout route, not in `src/styles.css`
6. **Keep the chat bubble** - it's shared across all apps

### ❌ Don't

1. **Don't modify the template sidebar** - create your own
2. **Don't add padding to layout containers** - handle in child components
3. **Don't skip route registration** - template sidebar will show
4. **Don't nest too deeply** - keep routes shallow when possible
5. **Don't hardcode routes** - use TanStack Router's type-safe navigation

## Routing Patterns

### Simple Route

```tsx
// src/routes/_app/your-app.tsx
export const Route = createFileRoute('/_app/your-app')({
  component: YourApp,
});

// Accessible at: /your-app
```

### Index Route (Redirect)

```tsx
// src/routes/_app/your-app/index.tsx
function YourAppIndex() {
  return <Navigate to="/your-app/dashboard" replace />;
}

// Accessing /your-app redirects to /your-app/dashboard
```

### Dynamic Route

```tsx
// src/routes/_app/your-app/item.$id.tsx
export const Route = createFileRoute('/_app/your-app/item/$id')({
  component: ItemDetail,
});

function ItemDetail() {
  const { id } = Route.useParams();
  // Use the id parameter
}

// Accessible at: /your-app/item/123
```

## Navigation

### Using Link Component

```tsx
import { Link } from '@tanstack/react-router';

<Link to="/your-app/dashboard">Dashboard</Link>
```

### Programmatic Navigation

```tsx
import { useNavigate } from '@tanstack/react-router';

function Component() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({ to: '/your-app/settings' });
  };
}
```

## Debugging

### Route Not Hiding Template Sidebar

**Check:**
1. Is route added to `CUSTOM_APP_ROUTES`?
2. Does route path start with `/`?
3. Did you restart the dev server after changes?

### Styles Not Loading

**Check:**
1. Is CSS file imported in layout route?
2. Is file path correct relative to `src/`?
3. Check browser console for 404 errors

### TypeScript Errors

**Regenerate route tree:**

```bash
pnpm exec tsr generate
```

## Checklist for New Custom App

- [ ] Add route to `CUSTOM_APP_ROUTES` in `src/routes/_app/route.tsx`
- [ ] Create layout route: `src/routes/_app/your-app.tsx`
- [ ] Create child routes: `src/routes/_app/your-app/*.tsx`
- [ ] Create components: `src/components/your-app/`
- [ ] Create styles (optional): `src/styles/your-app.css`
- [ ] Create mock data (optional): `src/mocks/your-app-*.ts`
- [ ] Test navigation between routes
- [ ] Verify template sidebar is hidden
- [ ] Verify chat bubble is visible
- [ ] Run `pnpm typecheck` to verify types
- [ ] Update README if adding major integration

## Resources

- [TanStack Router Docs](https://tanstack.com/router/latest)
- [N8n Integration Example](../N8N_INTEGRATION.md)
- [Code Structure Guide](./03-code-structure.md)

---

**Last Updated:** March 2026
