# Integrating Existing Frontend Projects into BZ Template

This guide shows how to integrate an existing React app (like Nexus Connect, Databricks) into the BZ app template, following the actual approach that worked successfully.

## Philosophy

**Don't merge codebases - integrate cleanly**

- Keep the template structure intact
- Adopt the existing app into the template's patterns
- Convert routing, but keep components mostly unchanged
- Apply design tokens for consistent theming

## What's New in This Guide

This guide has been updated based on lessons learned from integrating the Databricks mock. **Key improvements**:

✅ **Proactive prevention** - Instructions now prevent issues before they happen, not just fix them after
✅ **Radix UI monorepo handling** - Explicit steps for converting monorepo aliases to standalone packages
✅ **Base path strategy** - Clear pattern for managing route prefixes throughout the app
✅ **Route file naming** - Detailed rules for TanStack Router parent-child vs sibling routes
✅ **Pre-launch checklist** - Verification steps to catch issues before running the app

**Common pitfalls now addressed in the instructions**:
- Monorepo aliases (Radix UI)
- Missing UI components and utilities
- Type import syntax errors
- Route structure confusion
- Navigation path prefixes
- Blank pages and 404s

---

## ⚠️ CRITICAL: Most Common Integration Error

**Error you'll see**: `The requested module '/src/types/your-app.ts' does not provide an export named 'SomeType'`

**Root cause**: TypeScript types/interfaces don't exist at runtime. When imported without `import type`, Vite/esbuild tries to find them at runtime and fails.

**Solution**: ALWAYS use `import type` for type-only imports:

```tsx
// ❌ WRONG - Will cause runtime error
import { Task, User, Project } from '#/types/your-app';

// ✅ CORRECT - Compile-time only
import type { Task, User, Project } from '#/types/your-app';
```

**When to apply**: After bulk updating import paths (Phase 3.4 below), you MUST verify all type imports use `import type`.

**Quick check**:
```bash
# Find problematic imports (replace 'your-app' with your app name)
grep -r "from '#/types/your-app'" src/components/your-app --include="*.tsx" | grep -v "import type"
```

If this returns any results, fix them immediately before running the app.

---

## Overview: What We Did with Nexus Connect

Starting with:
- **Original Nexus**: React Router DOM, Context API, hardcoded Tailwind colors
- **BZ Template**: TanStack Router, TanStack Query, design token system

Result:
- ✅ Nexus works at `/nexus` route
- ✅ Uses TanStack Router (no nested routers)
- ✅ Uses template design tokens (supports light/dark mode)
- ✅ Template auth protects Nexus
- ✅ Chat bubble visible on all pages

**Time taken**: ~3 hours
**Lines of code changed in Nexus**: ~50 (mostly imports and routing)

---

## Step-by-Step Integration

### Phase 1: Project Setup (15 min)

#### 1.1 Copy Template

```bash
# Copy template to new location
rsync -av \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='docs' \
  --exclude='README.md' \
  --exclude='.env' \
  --exclude='dist' \
  /path/to/bz-app-zero/ \
  /path/to/your-new-project/
```

#### 1.2 Update package.json

**⚠️ CRITICAL: Check for Monorepo Aliases**

Before copying dependencies, check your source project for monorepo-specific imports that won't work in standalone projects.

**Common problematic pattern**:
```tsx
// In source project - monorepo alias
import { Collapsible } from 'radix-ui';  // ❌ Won't work standalone
```

**How to check**:
```bash
# Search for radix-ui imports in source
grep -r "from 'radix-ui'" /path/to/source/src --include="*.tsx"

# Search for other potential aliases
grep -r "from '@workspace/" /path/to/source/src --include="*.tsx"
```

**If you find monorepo aliases**, add the individual packages instead:

```json
{
  "dependencies": {
    // ... template dependencies ...

    // ✅ Add individual Radix UI packages (not 'radix-ui')
    "@radix-ui/react-collapsible": "^1.0.3",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "@radix-ui/react-slot": "^1.0.2",

    // Your app's actual dependencies
    "lucide-react": "^0.546.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.5.0",
    "class-variance-authority": "^0.7.0"
  }
}
```

**Then run**:
```bash
pnpm install
```

#### 1.3 Rename Template Components to Avoid Conflicts

```bash
cd src/components
mv Sidebar.tsx AppSidebar.tsx
```

Update import in `src/routes/_app/route.tsx`:

```tsx
import Sidebar from '#/components/AppSidebar';
```

#### 1.4 Configure Custom Route

In `src/routes/_app/route.tsx`, add your app to `CUSTOM_APP_ROUTES`:

```tsx
const CUSTOM_APP_ROUTES: string[] = ['/nexus'];  // Hides template sidebar
```

---

### Phase 2: Copy Existing App Files (20 min)

#### 2.1 Create Folders

```bash
cd src
mkdir -p components/nexus components/ui context services data types utils pages/nexus lib
```

#### 2.2 Copy Core Files with Renaming

```bash
# Copy components
cp -r /original/src/components/*.tsx src/components/nexus/

# Copy with renaming to avoid conflicts
cp /original/src/context/AppContext.tsx src/context/NexusContext.tsx
cp /original/src/services/api.ts src/services/nexus-api.ts
cp /original/src/types.ts src/types/nexus.ts
cp /original/src/data/mock-data.json src/data/
```

#### 2.3 Copy UI Components

**⚠️ IMPORTANT**: Copy all UI primitives your app uses to avoid missing component errors.

**Step 1 - Identify UI components**:
```bash
# Find all UI component imports in source
grep -r "from.*components/ui" /path/to/source/src --include="*.tsx" | \
  sed 's/.*from.*ui\/\([^'"'"'"]*\)'"'"'.*/\1/' | sort -u
```

**Step 2 - Copy UI components**:
```bash
# Copy all UI components your app uses
cp /original/src/components/ui/{button,input,textarea,table,popover,badge,dropdown-menu,collapsible,scroll-area,input-group}.tsx src/components/ui/

# Copy the UI index file if it exists
cp /original/src/components/ui/index.tsx src/components/ui/
```

**Step 3 - Update Radix UI imports** in copied UI components:

```bash
# Change monorepo alias to individual packages
find src/components/ui -name "*.tsx" -exec sed -i '' \
  "s|from 'radix-ui'|from '@radix-ui/react-component-name'|g" {} \;
```

You'll need to manually fix the specific component names:
```tsx
// Before (monorepo)
import { Collapsible } from 'radix-ui';

// After (standalone)
import * as Collapsible from '@radix-ui/react-collapsible';
```

**Step 4 - Ensure cn utility is re-exported**:

Edit `src/components/ui/index.tsx` to add:
```tsx
export { cn } from '#/lib/utils';
// ... other exports
```

This allows components to import `cn` from either `#/lib/utils` or `#/components/ui`.

#### 2.4 Copy Utility Functions

**⚠️ IMPORTANT**: Copy all utility functions to avoid "does not provide an export" errors.

```bash
# Copy utilities your app uses
cp /original/src/utils/helpers.ts src/utils/
cp /original/src/lib/utils.ts src/lib/  # Or merge with existing
```

**Common utilities to check for**:
- `cn()` - className merger (usually in `lib/utils.ts`)
- `usePrefersColorScheme()` - Theme detection hook
- Date formatters
- String helpers

**If merging with existing utils.ts**, add missing functions:

```tsx
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as React from 'react';

// Template's cn function (keep)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Add from source if missing
type ColorScheme = 'light' | 'dark';

const getCurrentColorScheme = (): ColorScheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const usePrefersColorScheme = (): ColorScheme => {
  const [colorScheme, setColorScheme] = React.useState<ColorScheme>(getCurrentColorScheme);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent): void => {
      setColorScheme(event.matches ? 'dark' : 'light');
    };
    setColorScheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  return colorScheme;
};
```

#### 2.5 Copy Custom Styles and CSS Variables

**⚠️ CRITICAL**: Custom theme CSS files are often missed during migration, causing missing styles.

**Step 1 - Check for custom CSS variables**:
```bash
# Look for custom CSS variables in the source project
grep -r "\-\-[a-z]" /path/to/source/src --include="*.css" | head -20

# Common patterns to look for:
# --app-*, --db-*, --custom-*, etc.
```

**Step 2 - Identify theme/styles directory**:
```bash
# Check if source has a styles directory
ls -la /path/to/source/src/styles/

# Check main CSS file for custom imports
cat /path/to/source/src/styles.css | grep "@import"
```

**Step 3 - Copy custom CSS files**:
```bash
# If source has custom theme files in src/styles/
cp -r /path/to/source/src/styles/*.css src/styles/

# Example structure you might find:
# src/styles/theme.css       - Custom CSS variables
# src/styles/main.css        - Base styles and theme setup
# src/styles/animations.css  - Custom animations
```

**Step 4 - Update main styles.css to import custom theme**:

Edit `src/styles.css` to import your custom theme files:

```css
@import url("https://fonts.googleapis.com/css2?family=...");
@import "tailwindcss";
@import "tw-animate-css";
@import "@boltzbit/md-utils/styles.css";
@import "@boltzbit/pebble/styles.css";

// ... existing imports ...

/**
 * 🎨 Custom App Theme
 * Import your app's custom theme files here
 */
@import "./styles/main.css";  // ← Add this line
```

**Step 5 - Verify Tailwind integration**:

If your custom CSS uses `@theme` or CSS variables, ensure they're properly configured:

```css
// In src/styles/theme.css
:root {
  --db-bg-main: #11171c;
  --db-text: #e3e8ee;
  --db-accent-blue: #8acaff;
  // ... other variables
}

// Map to Tailwind classes
@theme {
  --color-db-bg-main: var(--db-bg-main);
  --color-db-text: var(--db-text);
  --color-db-accent-blue: var(--db-accent-blue);
  // ... other mappings
}
```

**Common CSS patterns to check**:
- Custom color schemes (dark/light mode)
- Brand-specific CSS variables
- Custom animations or transitions
- Font imports or custom font families
- Global styles (scrollbars, resets, etc.)
- Framework-specific styles (Grid Layout, Chart libraries, etc.)

**Why this matters**:
Without custom CSS files, components using app-specific classes like `bg-db-bg-main` or `text-custom-accent` will have no styling, resulting in a broken UI even though the HTML structure is correct.

**Result structure**:

```
src/
├── components/
│   ├── AppSidebar.tsx        ← Template (renamed)
│   ├── Chat.tsx              ← Template
│   ├── ThemeToggle.tsx       ← Template
│   └── nexus/                ← YOUR APP
│       ├── Navbar.tsx
│       ├── Sidebar.tsx
│       ├── ChatArea.tsx
│       ├── RightSidebar.tsx
│       └── ThreadView.tsx
├── context/
│   └── NexusContext.tsx      ← Renamed from AppContext
├── services/
│   └── nexus-api.ts          ← Renamed from api.ts
├── types/
│   └── nexus.ts              ← Renamed from types.ts
├── styles/                   ← YOUR APP THEME
│   ├── theme.css             ← Custom CSS variables
│   └── main.css              ← Theme setup & base styles
├── styles.css                ← Updated to import custom theme
└── routes/_app/              ← Template routing
```

---

### Phase 3: Update Imports (30 min)

#### 3.1 Update Context File

Edit `src/context/NexusContext.tsx`:

```tsx
// Before
import { User, Channel } from '../types';
import { api } from '../services/api';

// After
import type { User, Channel } from '#/types/nexus';
import { api } from '#/services/nexus-api';
```

#### 3.2 Update API Service

Edit `src/services/nexus-api.ts`:

```tsx
// Before
import { MockData, Channel, Message } from '../types';
import mockDataRaw from '../data/mock-data.json';

// After
import type { MockData, Channel, Message, User, Thread } from '#/types/nexus';
import mockDataRaw from '#/data/mock-data.json';
```

#### 3.3 Bulk Update Component Imports

For all files in `src/components/nexus/`:

```tsx
// Before
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Message, User } from '../types';
import { cn, formatTimestamp } from '../utils/helpers';

// After
import { useApp } from '#/context/NexusContext';
import { api } from '#/services/nexus-api';
import type { Message, User } from '#/types/nexus';  // Note: `import type`
import { cn, formatTimestamp } from '#/utils/helpers';
```

**⚠️ CRITICAL**: Use `import type` for type-only imports to avoid module resolution errors like:
```
The requested module '/src/types/nexus.ts' does not provide an export named 'Message'
```

**Automated approach**:

```bash
cd src/components/nexus
for file in *.tsx; do
  sed -i '' "s|from '\.\./types'|from '#/types/nexus'|g" "$file"
  sed -i '' "s|from '\.\./context/AppContext'|from '#/context/NexusContext'|g" "$file"
  sed -i '' "s|from '\.\./services/api'|from '#/services/nexus-api'|g" "$file"
  sed -i '' "s|from '\.\./utils/helpers'|from '#/utils/helpers'|g" "$file"
done
```

#### 3.4 **REQUIRED**: Fix Type-Only Imports

After updating paths, you MUST convert type imports to use `import type`. This prevents module resolution errors.

**Find files that need fixing**:
```bash
# Find all imports from your types file that DON'T use 'import type'
grep -r "from '#/types/nexus'" src/components/nexus --include="*.tsx" | grep -v "import type"
```

**Manual fix** (recommended for safety):
For each file found, change:
```tsx
// ❌ Wrong - Will cause runtime error
import { Message, User, Thread } from '#/types/nexus';

// ✅ Correct
import type { Message, User, Thread } from '#/types/nexus';
```

**Automated fix** (use with caution):
```bash
cd src/components/nexus
# This regex finds and fixes type imports
find . -name "*.tsx" -exec sed -i '' 's/^import { \([^}]*\) } from .*\/types\/nexus.*;$/import type { \1 } from "#\/types\/nexus";/g' {} \;
```

**Verify the fix**:
```bash
# Should return no results (all type imports now use 'import type')
grep -r "from '#/types/nexus'" src/components/nexus --include="*.tsx" | grep -v "import type"
```

**Why this matters**:
- TypeScript interfaces and types don't exist at runtime
- Vite/esbuild detect this and fail with "does not provide an export" errors
- `import type` tells the bundler these are compile-time only
- This is the #1 cause of integration errors

---

### Phase 4: Convert Routing (45 min)

**⚠️ CRITICAL CONCEPTS**:
- **Base path**: Your app will live under a route like `/databricks` or `/nexus`
- **All internal paths** must include this base path
- **TanStack Router file naming** creates route hierarchy
- **Parent routes** need `<Outlet />` to render children

#### 4.1 Define Your Base Path

Choose a base path for your app and create a constant:

```tsx
// src/config/routes.ts (create this file)
export const DATABRICKS_BASE = '/databricks';  // Change to your app name
```

This will be used throughout routing configuration.

#### 4.2 Update Root Route to Redirect

Make the root path redirect to your app:

```tsx
// src/routes/_app/index.tsx
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/')({
  component: () => <Navigate to="/databricks" replace />,  // Use your base path
});
```

#### 4.3 Create Layout Component

Create `src/components/nexus/NexusLayout.tsx`:

```tsx
import React, { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { AppProvider, useApp } from '#/context/NexusContext';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { RightSidebar } from './RightSidebar';
import { ThreadView } from './ThreadView';
import type { Message } from '#/types/nexus';
import { AnimatePresence } from 'motion/react';

const MainLayout: React.FC = () => {
  const { activeChannel, setActiveChannel, channels } = useApp();
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const params = useParams({ strict: false });
  const channelId = 'channelId' in params ? params.channelId as string : undefined;
  const navigate = useNavigate();

  // Sync route with context
  React.useEffect(() => {
    if (channelId && channels.length > 0) {
      const channel = channels.find(c => c.id === channelId);
      if (channel && activeChannel?.id !== channel.id) {
        setActiveChannel(channel);
      }
    }
  }, [channelId, channels, activeChannel, setActiveChannel]);

  const handleChannelChange = (channel: any) => {
    setActiveChannel(channel);
    navigate({ to: '/nexus/channel/$channelId', params: { channelId: channel.id } });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ChatArea onOpenThread={setActiveThread} />
        <AnimatePresence>
          {activeThread ? (
            <ThreadView
              parentMessage={activeThread}
              onClose={() => setActiveThread(null)}
            />
          ) : (
            <RightSidebar />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default function NexusLayout() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
```

**Key changes from original App.tsx**:
- ❌ Removed `BrowserRouter` wrapper
- ✅ Used `useNavigate()` and `useParams()` from `@tanstack/react-router`
- ✅ Changed navigation paths to `/nexus/channel/$channelId`

#### 4.4 Create TanStack Routes

**⚠️ CRITICAL: Route File Naming Rules**

TanStack Router uses file names to determine route hierarchy:

| File Name | Route Path | Type | Notes |
|-----------|------------|------|-------|
| `databricks/route.tsx` | `/databricks` | Layout | Must render `<Outlet />` |
| `databricks/index.tsx` | `/databricks/` | Page | Renders at base path |
| `databricks/sql.dashboards.index.tsx` | `/databricks/sql/dashboards/` | Page | List page |
| `databricks/sql.dashboards.$id.tsx` | `/databricks/sql/dashboards/:id` | Page | Detail page |

**Key rules**:
- `route.tsx` = Layout (needs `<Outlet />`)
- `index.tsx` = Default page at that path
- `feature.index.tsx` + `feature.$id.tsx` = **Sibling routes** (both render independently)
- `feature.tsx` + `feature.$id.tsx` = **Parent-child** (parent needs `<Outlet />`)

**Step 1 - Create layout route** (with `<Outlet />`):

```tsx
// src/routes/_app/databricks/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';
import AppShell from '#/components/databricks/layout/AppShell';

export const Route = createFileRoute('/_app/databricks')({
  component: DatabricksLayout,
});

function DatabricksLayout() {
  return <AppShell />;  // AppShell should render <Outlet />
}
```

**Step 2 - Create home page** (index route):

```tsx
// src/routes/_app/databricks/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import HomePage from '#/pages/databricks/home';

export const Route = createFileRoute('/_app/databricks/')({
  component: HomePage,
});
```

**Step 3 - Create feature routes** (sibling pattern):

```tsx
// src/routes/_app/databricks/sql.dashboards.index.tsx
import { createFileRoute } from '@tanstack/react-router';
import DashboardsPage from '#/pages/databricks/dashboards';

export const Route = createFileRoute('/_app/databricks/sql/dashboards/')({
  component: DashboardsPage,
});

// src/routes/_app/databricks/sql.dashboards.$dashboardId.tsx
import { createFileRoute } from '@tanstack/react-router';
import DashboardEditorPage from '#/pages/databricks/dashboard-editor';

export const Route = createFileRoute('/_app/databricks/sql/dashboards/$dashboardId')({
  component: DashboardEditorPage,
});
```

**Result**:
- `/databricks` → HomePage (via index.tsx)
- `/databricks/sql/dashboards/` → DashboardsPage (list)
- `/databricks/sql/dashboards/sample-taxi` → DashboardEditorPage (detail)

**✅ Verification**:
```bash
# Check your route structure
ls src/routes/_app/databricks/
# Should see:
# route.tsx               - Layout
# index.tsx               - Home page
# sql.dashboards.index.tsx    - List page
# sql.dashboards.$dashboardId.tsx  - Detail page
```

#### 4.5 Update Navigation Links with Base Path

**⚠️ CRITICAL**: All navigation paths must include your base path prefix.

**Step 1 - Update navigation config/mock files**:

```tsx
// src/mocks/sideNav.mock.ts
// ❌ WRONG - Missing base path
export const sideNavSections = [
  {
    title: 'SQL',
    items: [
      { label: 'Dashboards', path: '/sql/dashboards' },  // 404!
      { label: 'Queries', path: '/sql/queries' },
    ],
  },
];

// ✅ CORRECT - Includes base path
import { DATABRICKS_BASE } from '#/config/routes';

export const sideNavSections = [
  {
    title: 'SQL',
    items: [
      { label: 'Dashboards', path: `${DATABRICKS_BASE}/sql/dashboards` },
      { label: 'Queries', path: `${DATABRICKS_BASE}/sql/queries` },
    ],
  },
];
```

**Step 2 - Update path helper functions**:

```tsx
// src/lib/dashboardPaths.ts
import { DATABRICKS_BASE } from '#/config/routes';

// ❌ WRONG - Missing base path
export const dashboardEditorPath = (dashboardId: string): string => {
  return `/sql/dashboards/${encodeURIComponent(dashboardId)}`;
};

// ✅ CORRECT - Includes base path
export const dashboardEditorPath = (
  dashboardId: string,
  query?: { title?: string; tab?: string },
): string => {
  const q = new URLSearchParams();
  if (query?.title) q.set('title', query.title);
  if (query?.tab) q.set('tab', query.tab);
  const s = q.toString();
  return `${DATABRICKS_BASE}/sql/dashboards/${encodeURIComponent(dashboardId)}${s ? `?${s}` : ''}`;
};
```

**Step 3 - Find and update all hardcoded paths**:

```bash
# Find all path definitions
grep -r "path: '/" src/mocks src/config src/lib --include="*.ts" --include="*.tsx"

# Find all navigate/Link calls
grep -r "to: '/" src/components --include="*.tsx"
```

**Step 4 - Update component navigation**:

```tsx
// src/components/databricks/Sidebar.tsx
import { useNavigate } from '@tanstack/react-router';
import { DATABRICKS_BASE } from '#/config/routes';

const navigate = useNavigate();

// ❌ WRONG
navigate({ to: '/sql/dashboards/$dashboardId', params: { dashboardId } });

// ✅ CORRECT
navigate({ to: `${DATABRICKS_BASE}/sql/dashboards/$dashboardId`, params: { dashboardId } });
```

---

### Phase 5: Convert to Design Tokens (60 min)

#### 5.1 Color Mapping Reference

| Old (Hardcoded) | New (Design Token) | Usage |
|-----------------|-------------------|-------|
| `bg-white` | `bg-background` | Main background |
| `bg-slate-50` | `bg-surface-low` | Subtle surface |
| `bg-slate-100` | `bg-surface-low` | Input backgrounds |
| `bg-slate-200` | `bg-surface` | Hover states |
| `text-slate-400` | `text-on-surface-low` | Muted text |
| `text-slate-600` | `text-on-surface` | Secondary text |
| `text-slate-800` | `text-on-background` | Primary text |
| `border-slate-200` | `border-outline` | Borders |
| `bg-brand-600` | `bg-primary` | Brand color |
| `text-brand-600` | `text-primary` | Brand text |
| `bg-rose-500` | `bg-destructive` | Error/delete |
| `bg-emerald-500` | `bg-success` | Success states |

#### 5.2 Example Conversion (Navbar)

**Before**:
```tsx
<header className="h-14 border-b border-slate-200 bg-white">
  <div className="w-8 h-8 bg-brand-600 text-white">
    N
  </div>
  <span className="font-bold text-slate-800">Nexus</span>
  <input className="bg-slate-100 focus:border-brand-500" />
  <button className="text-slate-500 hover:bg-slate-100">
    <Bell />
  </button>
</header>
```

**After**:
```tsx
<header className="h-14 border-b border-outline bg-background">
  <div className="w-8 h-8 bg-primary text-on-primary">
    N
  </div>
  <span className="font-bold text-on-background">Nexus</span>
  <input className="bg-surface-low focus:border-primary" />
  <button className="text-on-surface-low hover:bg-surface-low">
    <Bell />
  </button>
</header>
```

**Benefits**:
- ✅ Automatically adapts to light/dark mode
- ✅ Consistent with template theme
- ✅ Can switch between 16 themes easily

#### 5.3 Recommended Conversion Order

1. **Navbar** - Most visible, sets the tone
2. **Sidebar** - Navigation component
3. **ChatArea** - Main content area
4. **RightSidebar** - Additional content
5. **ThreadView** - Modal/overlay

---

### Phase 6: Add Navigation Link (5 min)

Edit `src/components/AppSidebar.tsx`:

```tsx
<Link
  to="/nexus"
  className="rounded-lg px-3 py-2 text-sm font-medium text-on-surface-low transition hover:bg-surface-high hover:text-on-surface-high [&.active]:bg-primary [&.active]:text-on-primary"
>
  Nexus Connect
</Link>
```

---

### Phase 7: Environment Setup (5 min)

Create `.env` file:

```bash
cp .env.example .env
```

The template uses these auth endpoints by default:

```env
VITE_OAUTH_CLIENT_ID=abb448ee-3a8b-4568-a5d8-2b2adc6337b2
VITE_API_BASE_URL=https://test.boltzhub.com/bz-appstore-api
VITE_GATEWAY_URL=https://auth.test.boltzhub.com
```

---

## Pre-Launch Checklist

**Before running the app**, verify these preventive measures:

### Phase 1 Verification
- [ ] All dependencies installed: `pnpm install` succeeded
- [ ] No `radix-ui` monorepo alias in package.json
- [ ] Individual `@radix-ui/react-*` packages added

### Phase 2 Verification
- [ ] All UI components copied from source
- [ ] UI component imports updated from `'radix-ui'` to `'@radix-ui/react-*'`
- [ ] `cn` utility re-exported in `src/components/ui/index.tsx`
- [ ] All utility functions copied (check for `usePrefersColorScheme`, etc.)
- [ ] **Custom CSS/theme files copied** from `src/styles/` directory
- [ ] Custom theme imported in `src/styles.css`
- [ ] CSS variables verified: `grep -r "\-\-" src/styles/*.css` shows custom variables

### Phase 3 Verification
- [ ] All type imports use `import type` syntax
- [ ] No regular imports from `#/types/*` files
- [ ] Verify: `grep -r "from '#/types/" src --include="*.tsx" | grep -v "import type"` returns nothing

### Phase 4 Verification
- [ ] Base path constant created: `src/config/routes.ts`
- [ ] Root route redirects to your app
- [ ] Layout route (`route.tsx`) exists and renders `<Outlet />`
- [ ] Index route (`index.tsx`) exists for home page
- [ ] List/detail routes use sibling pattern (`.index.tsx` + `.$id.tsx`)
- [ ] All navigation configs include base path
- [ ] All path helper functions include base path
- [ ] Route structure verified with `ls src/routes/_app/your-app/`

### Phase 5 Verification
- [ ] Design tokens used instead of hardcoded colors
- [ ] No `bg-blue-500` or `text-gray-600` in app components

---

## Testing Checklist

```bash
# Clear cache and run
rm -rf node_modules/.vite
pnpm run dev
```

### Basic Flow

- [ ] Navigate to `http://localhost:3000`
- [ ] Redirects to your app (not blank page)
- [ ] See app home page with content
- [ ] No console errors about missing modules
- [ ] No console errors about missing exports

### Routing

- [ ] All navigation links work (no 404s)
- [ ] List pages load: `/databricks/sql/dashboards/`
- [ ] Detail pages load: `/databricks/sql/dashboards/sample-id`
- [ ] URL changes AND content updates when clicking links
- [ ] Browser back/forward works
- [ ] Direct URL navigation works
- [ ] No blank pages on any route

### UI Components

- [ ] All components render (no missing Popover, Table, etc.)
- [ ] No "does not provide an export named X" errors
- [ ] Radix UI components work (dropdowns, popovers, etc.)

### CSS & Styling

- [ ] **Page has visible styling** (not just unstyled HTML)
- [ ] Custom colors appear correctly (check backgrounds, borders, text colors)
- [ ] App-specific CSS classes work (e.g., `bg-db-bg-main`, `text-custom-accent`)
- [ ] Layout renders properly (sidebars, headers positioned correctly)
- [ ] Fonts load correctly (not falling back to system fonts)
- [ ] Custom scrollbars appear (if your app has them)
- [ ] Open browser DevTools → Inspect element → Check if CSS variables are defined
  - Look for `--db-*`, `--app-*`, or similar custom properties in computed styles
  - If missing, check that custom theme CSS files were copied and imported

**Quick diagnostic**:
```bash
# Check if custom CSS variables are present in the page
# Open DevTools Console and run:
getComputedStyle(document.documentElement).getPropertyValue('--db-bg-main')
# Should return a color value, not empty string
```

### Theming

- [ ] Click theme toggle (sun/moon icon)
- [ ] App switches between light/dark modes
- [ ] Colors look appropriate in both modes
- [ ] No hardcoded colors visible

### Integration

- [ ] Chat bubble visible in bottom right
- [ ] Can navigate between template pages and your app
- [ ] Auth persists across navigation
- [ ] No runtime errors in console

---

## Common Issues & Solutions

### Issue 1: Radix UI Module Not Found

**Error**: `Failed to resolve import "radix-ui" from "src/components/ui/collapsible.tsx"`

**Root Cause**: The original project used a monorepo alias `'radix-ui'` that doesn't exist in a standalone project.

**Solution**: Install individual Radix UI packages and update imports.

**Step 1 - Install packages**:
```bash
pnpm add @radix-ui/react-collapsible @radix-ui/react-dropdown-menu \
  @radix-ui/react-popover @radix-ui/react-scroll-area @radix-ui/react-slot
```

**Step 2 - Update imports** in UI components:
```tsx
// ❌ Wrong - Monorepo alias
import { Collapsible } from 'radix-ui';

// ✅ Correct - Individual package
import * as Collapsible from '@radix-ui/react-collapsible';
```

**Files commonly affected**:
- `src/components/ui/collapsible.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/badge.tsx`

### Issue 2: Module Resolution Errors (Type Imports) ⚠️ MOST COMMON

**Error**: `The requested module '/src/types/nexus.ts' does not provide an export named 'Message'`

**Root Cause**: TypeScript types/interfaces don't exist at runtime. When imported without `import type`, the bundler tries to find them at runtime and fails.

**Solution**: Use `import type` for type-only imports.

**Step 1 - Find problematic files**:
```bash
# Replace 'nexus' with your app name (e.g., 'vividplan')
grep -r "from '#/types/nexus'" src/components/nexus --include="*.tsx" | grep -v "import type"
```

**Step 2 - Fix each file**:
```tsx
// ❌ Wrong - Causes runtime error
import { Message, User } from '#/types/nexus';

// ✅ Correct - Compile-time only
import type { Message, User } from '#/types/nexus';
```

**Step 3 - Verify the fix**:
```bash
# Should return nothing (all imports now use 'import type')
grep -r "from '#/types/nexus'" src/components/nexus --include="*.tsx" | grep -v "import type"
```

**Quick automated fix** (review changes carefully):
```bash
cd src/components/nexus
find . -name "*.tsx" -exec grep -l "from '#/types/nexus'" {} \; | while read file; do
  sed -i '' 's/^import { \([^}]*\) } from .*\/types\/nexus.*;$/import type { \1 } from "#\/types\/nexus";/g' "$file"
done
```

**Prevention**: Always add this as **Phase 3.4** after bulk updating imports (see Phase 3 in this guide).

### Issue 3: Missing Utility Hooks/Functions

**Error**: `The requested module '/src/lib/utils.ts' does not provide an export named 'usePrefersColorScheme'`

**Root Cause**: Components imported utilities that exist in the source project but weren't copied to the template.

**Solution**: Add the missing utility to the appropriate file.

**Example - usePrefersColorScheme hook**:

Add to `src/lib/utils.ts`:
```typescript
import * as React from 'react';

type ColorScheme = 'light' | 'dark';

const getCurrentColorScheme = (): ColorScheme => {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const usePrefersColorScheme = (): ColorScheme => {
  const [colorScheme, setColorScheme] = React.useState<ColorScheme>(getCurrentColorScheme);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent): void => {
      setColorScheme(event.matches ? 'dark' : 'light');
    };
    setColorScheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return colorScheme;
};
```

**How to diagnose**:
1. Check the error message for the missing export name
2. Search the source project for that export: `grep -r "export.*usePrefersColorScheme" /path/to/source`
3. Copy the implementation to the corresponding file in your integrated project

### Issue 4: Missing UI Components

**Error**: `The requested module '/src/components/ui/index.tsx' does not provide an export named 'Popover'`

**Root Cause**: Component imports UI primitives that weren't copied from the source project.

**Solution**: Copy missing UI components and their dependencies.

**Common missing components**:
- Popover
- Table
- Input
- Textarea
- InputGroup

**Step 1 - Copy component file**:
```bash
cp /path/to/source/src/components/ui/popover.tsx src/components/ui/
```

**Step 2 - Install dependencies** (check component imports):
```bash
pnpm add @radix-ui/react-popover  # If using Radix
```

**Step 3 - Update imports** in the copied component:
```tsx
// Change relative imports to path aliases
import { cn } from '#/lib/utils';  // Instead of '../lib/utils'
```

**Step 4 - Export from ui/index.tsx**:
```tsx
export * from './popover';
```

**Tip**: You can batch copy multiple UI components:
```bash
cp /path/to/source/src/components/ui/{popover,table,input,textarea,input-group}.tsx src/components/ui/
```

### Issue 5: cn Utility Import Path Inconsistency

**Error**: `The requested module '/src/components/ui/index.tsx' does not provide an export named 'cn'`

**Root Cause**: Some components import `cn` from `#/components/ui` while it's actually defined in `#/lib/utils`.

**Solution**: Re-export `cn` from `components/ui/index.tsx`:

```tsx
// src/components/ui/index.tsx
export { cn } from '#/lib/utils';

// Now both import paths work:
import { cn } from '#/lib/utils';       // ✅ Direct
import { cn } from '#/components/ui';   // ✅ Re-exported
```

**Alternative**: Update all imports to use `#/lib/utils` (more consistent):
```bash
find src/components/your-app -name "*.tsx" -exec sed -i '' \
  "s|from '#/components/ui'|from '#/lib/utils'|g" {} \;
```

### Issue 6: Vite Cache Issues

**Error**: Types work in IDE but not in browser

**Solution**: Clear Vite cache:

```bash
rm -rf node_modules/.vite
pnpm run dev
```

### Issue 7: Missing CSS Styling - Page Renders But Looks Unstyled ⚠️ COMMON

**Symptom**:
- App loads and components render
- HTML structure is correct (can see text and elements)
- But page looks completely unstyled or uses wrong colors
- Missing backgrounds, borders, custom fonts, or layout positioning
- Browser DevTools shows elements but no custom CSS classes apply

**Example**: A Databricks app that should have dark backgrounds (`#11171c`) shows white backgrounds instead.

**Root Cause**: Custom theme CSS files (with CSS variables like `--db-bg-main`, `--app-color-primary`, etc.) weren't copied from the source project during migration.

**Solution**: Copy custom theme files and import them into main CSS.

**Step 1 - Check if source project has custom CSS**:
```bash
# Look for custom CSS files in source
ls -la /path/to/source/src/styles/

# Check for custom CSS variables
grep -r "\-\-" /path/to/source/src/styles/ --include="*.css"
```

**Step 2 - Copy all custom CSS files**:
```bash
# Copy entire styles directory if it exists
cp -r /path/to/source/src/styles/*.css src/styles/

# Common files to look for:
# - theme.css (CSS variables)
# - main.css (base styles)
# - animations.css (custom animations)
# - fonts.css (font imports)
```

**Step 3 - Update src/styles.css to import custom theme**:
```css
@import "tailwindcss";
@import "tw-animate-css";

// ... other imports ...

/**
 * 🎨 Custom App Theme
 */
@import "./styles/main.css";  // ← Add this
```

**Step 4 - Fix import paths in copied CSS files**:

If the copied CSS files have Tailwind-specific syntax that conflicts, simplify them:

```css
// If you see this in copied files:
@import "tailwindcss" source(none);
@source "../**/*.{ts,tsx}";

// Replace with just:
// (Remove these lines - they're already in main styles.css)
```

**Step 5 - Verify CSS variables are loaded**:
```bash
# Open browser DevTools Console:
getComputedStyle(document.documentElement).getPropertyValue('--db-bg-main')
# Should return: "#11171c" or similar (not empty)
```

**Common custom CSS patterns**:
- `--db-*` (Databricks style)
- `--app-*` (Generic app prefix)
- `--brand-*` (Brand colors)
- `--theme-*` (Theme variables)

**Prevention**: Always check Phase 2.5 in the integration guide to copy custom styles before running the app.

### Issue 8: Route Conflict at Root Path

**Error**: `Route conflict - "/" path defined in two files`

**Root Cause**: TanStack Router found multiple routes trying to match the same path.

**Common scenario**:
```
src/routes/
├── _app/index.tsx              → "/"
└── _app/_your-app/index.tsx    → "/" (conflict!)
```

**Solution**: Use proper route hierarchy with redirects.

**Step 1 - Make root redirect** to your app:
```tsx
// src/routes/_app/index.tsx
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/')({
  component: () => <Navigate to="/databricks" replace />,
});
```

**Step 2 - Remove underscore prefix** from app folder if you want it accessible:
```bash
# ❌ Wrong - underscore makes it layout-only, not accessible
src/routes/_app/_databricks/

# ✅ Correct - no underscore makes it a route
src/routes/_app/databricks/
```

**Step 3 - Create app layout** route:
```tsx
// src/routes/_app/databricks/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/databricks')({
  component: () => <YourAppLayout />,
});
```

### Issue 9: Blank Home Page After Integration

**Symptom**: Navigating to `http://localhost:3000/` shows blank page, no errors in console

**Root Cause**: Layout route has `<Outlet />` but no child route to render.

**Bad structure**:
```tsx
// src/routes/_app/databricks/route.tsx - Has Outlet
export const Route = createFileRoute('/_app/databricks')({
  component: () => (
    <AppShell>
      <Outlet />  {/* Nothing to render here! */}
    </AppShell>
  ),
});

// Missing: src/routes/_app/databricks/index.tsx
```

**Solution**: Add an index route for the home page:

```tsx
// src/routes/_app/databricks/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import HomePage from '#/pages/databricks/home';

export const Route = createFileRoute('/_app/databricks/')({
  component: HomePage,
});
```

**Verify route structure**:
```bash
# Should have both layout and index
ls src/routes/_app/databricks/
# route.tsx   - Layout with <Outlet />
# index.tsx   - Home page component
```

### Issue 10: Navigation Links Missing Base Path

**Symptom**: Clicking navigation link goes to `/sql/dashboards` instead of `/databricks/sql/dashboards`, resulting in "Not Found"

**Root Cause**: Mock data or navigation config has hardcoded paths without the base route prefix.

**Solution**: Update all navigation paths to include the base prefix.

**Example - sideNav.mock.ts**:
```tsx
// ❌ Wrong - Missing base path
export const sideNavSections = [
  {
    title: 'SQL',
    items: [
      { label: 'Dashboards', path: '/sql/dashboards' },  // 404!
      { label: 'Queries', path: '/sql/queries' },
    ],
  },
];

// ✅ Correct - Includes base path
export const sideNavSections = [
  {
    title: 'SQL',
    items: [
      { label: 'Dashboards', path: '/databricks/sql/dashboards' },
      { label: 'Queries', path: '/databricks/sql/queries' },
    ],
  },
];
```

**Find all hardcoded paths**:
```bash
# Search for path definitions in mock/config files
grep -r "path: '/" src/mocks src/config --include="*.ts" --include="*.tsx"
```

**Automated fix** (review carefully):
```bash
# Add /databricks prefix to paths in mock files
find src/mocks -name "*.ts" -exec sed -i '' \
  "s|path: '/|path: '/databricks/|g" {} \;
```

### Issue 11: Dynamic Route Helper Functions Missing Base Path

**Symptom**: Clicking a dashboard/item jumps to `/sql/dashboards/id` instead of `/databricks/sql/dashboards/id`

**Root Cause**: Helper functions that generate dynamic paths don't include the base route prefix.

**Example problem**:
```tsx
// ❌ src/lib/dashboardPaths.ts - Missing prefix
export const dashboardEditorPath = (dashboardId: string): string => {
  return `/sql/dashboards/${encodeURIComponent(dashboardId)}`;
};
```

**Solution**: Add base path to helper functions:
```tsx
// ✅ src/lib/dashboardPaths.ts - Includes prefix
export const dashboardEditorPath = (
  dashboardId: string,
  query?: { title?: string; tab?: string },
): string => {
  const q = new URLSearchParams();
  if (query?.title) {
    q.set('title', query.title);
  }
  if (query?.tab) {
    q.set('tab', query.tab);
  }
  const s = q.toString();
  return `/databricks/sql/dashboards/${encodeURIComponent(dashboardId)}${s ? `?${s}` : ''}`;
};
```

**Better approach** - Use a constant for base path:
```tsx
// src/config/routes.ts
export const DATABRICKS_BASE = '/databricks';

// src/lib/dashboardPaths.ts
import { DATABRICKS_BASE } from '#/config/routes';

export const dashboardEditorPath = (dashboardId: string): string => {
  return `${DATABRICKS_BASE}/sql/dashboards/${encodeURIComponent(dashboardId)}`;
};
```

This makes it easier to change the base path later if needed.

### Issue 12: React Router Hooks Not Working

**Error**: `useNavigate is not a function`

**Solution**: Make sure you're importing from `@tanstack/react-router`:

```tsx
// ❌ Wrong
import { useNavigate } from 'react-router-dom';

// ✅ Correct
import { useNavigate } from '@tanstack/react-router';
```

### Issue 13: Routes Not Matching

**Error**: Nexus shows blank page at `/nexus`

**Solution**: Check route file names:
- `index.tsx` → matches `/nexus`
- `channel.$channelId.tsx` → matches `/nexus/channel/:id`

### Issue 14: CSS Classes Not Working

**Symptom**: Component looks unstyled or colors don't change with theme

**Solution**: Convert hardcoded colors to design tokens (see Phase 5)

### Issue 15: Child Route Not Rendering (Parent-Child Outlet Issue) ⚠️ COMMON

**Symptom**:
- URL changes correctly when navigating (e.g., `/databricks/sql/dashboards/sample-taxi`)
- But the page still shows the parent route's content (e.g., dashboards list)
- No console errors

**Root Cause**: TanStack Router's file naming convention creates parent-child relationships. When you have:
- `sql.dashboards.tsx` (parent)
- `sql.dashboards.$dashboardId.tsx` (child)

The second file becomes a **child route** of the first. The parent route acts as a layout and must render `<Outlet />` for the child to display. If the parent only renders its own component without `<Outlet />`, children will never show.

**Example of the problem**:
```tsx
// ❌ sql.dashboards.tsx - No <Outlet />, children won't render
export const Route = createFileRoute('/_app/databricks/sql/dashboards')({
  component: DashboardsPage,  // Missing <Outlet /> for children
});

// This child route will never show
// sql.dashboards.$dashboardId.tsx
export const Route = createFileRoute('/_app/databricks/sql/dashboards/$dashboardId')({
  component: DashboardEditorPage,
});
```

**Solution Option 1**: Make them sibling routes by renaming the parent to `*.index.tsx`:

```bash
# Rename parent to index route
mv src/routes/_app/databricks/sql.dashboards.tsx \
   src/routes/_app/databricks/sql.dashboards.index.tsx
```

```tsx
// ✅ sql.dashboards.index.tsx - Now a sibling
export const Route = createFileRoute('/_app/databricks/sql/dashboards/')({
  component: DashboardsPage,
});

// ✅ sql.dashboards.$dashboardId.tsx - Also a sibling
export const Route = createFileRoute('/_app/databricks/sql/dashboards/$dashboardId')({
  component: DashboardEditorPage,
});
```

**Result**:
- `/databricks/sql/dashboards/` → Shows DashboardsPage (index route)
- `/databricks/sql/dashboards/sample-taxi` → Shows DashboardEditorPage (detail route)

**Solution Option 2**: Add `<Outlet />` to the parent (if you want a shared layout):

```tsx
// ✅ sql.dashboards.tsx - Renders children via <Outlet />
import { Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/databricks/sql/dashboards')({
  component: () => (
    <div>
      <SharedHeader />
      <Outlet />  {/* Children render here */}
    </div>
  ),
});
```

**When to use each approach**:
- **Option 1 (sibling routes)**: When list and detail pages are completely different layouts
- **Option 2 (parent with Outlet)**: When they share a header, sidebar, or other layout elements

**How to diagnose**:
1. Check if your route file names create a parent-child relationship:
   - `feature.tsx` + `feature.$id.tsx` = parent-child ❌
   - `feature.index.tsx` + `feature.$id.tsx` = siblings ✅
2. Add console.log in the child component - if it never logs, the component isn't rendering
3. Check the parent component - does it have `<Outlet />`?

---

## Architecture Comparison

### Before Integration

```
Original App
├── React Router DOM
├── Context API
├── Hardcoded colors
└── Standalone

Template
├── TanStack Router
├── TanStack Query
├── Design tokens
└── Auth system
```

### After Integration

```
Integrated App
├── TanStack Router (everywhere)
├── Context API (Nexus only)
├── TanStack Query (template features)
├── Design tokens (everywhere)
└── Single auth system
    ├── Template pages: /, /chat, /pebble
    └── Nexus pages: /nexus, /nexus/channel/:id
```

**Result**: Best of both worlds - template infrastructure with Nexus features.

---

## Performance Considerations

### Bundle Size

**Before** (separate apps):
- Template: ~200KB
- Nexus: ~150KB
- **Total**: 350KB (if deployed separately)

**After** (integrated):
- Combined: ~280KB
- **Savings**: ~70KB (shared dependencies)

### Load Time

- Template auth loads first
- Nexus code splits automatically (TanStack Router)
- Only loads when user navigates to `/nexus`

---

## Next Steps

### Optional Enhancements

1. **Convert remaining components** to design tokens
2. **Replace Lucide icons** with Phosphor icons (template standard)
3. **Add TanStack Query** for Nexus data fetching (optional)
4. **Integrate Nexus API** with template API client (if applicable)
5. **Add loading states** using TanStack Router loaders

### Production Readiness

- [ ] Convert all CSS to design tokens
- [ ] Test all user flows
- [ ] Add error boundaries
- [ ] Configure proper OAuth credentials
- [ ] Test light/dark modes thoroughly
- [ ] Add route loading states
- [ ] Optimize bundle size

---

## Summary

This approach successfully integrated Nexus Connect into the BZ template with:

✅ **Minimal changes** to existing code (~50 lines)
✅ **Clean separation** between template and app
✅ **Unified routing** (no nested routers)
✅ **Consistent theming** (design tokens)
✅ **Working in ~3 hours** (vs 16+ hours for full rewrite)

**Key insight**: Don't fight the template - adopt its patterns at the boundaries (routing, theming) but keep your app's internal logic intact.
