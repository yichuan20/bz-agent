# BoltzBit App Template Documentation

Complete documentation for the BoltzBit application template based on `bz-app-template`.

## 📚 Documentation Index

### [01. Authentication](./01-authentication.md)
Comprehensive guide to the OAuth-based authentication system.

**Topics Covered:**
- OAuth setup and configuration
- Login/logout flows
- Protected routes and route guards
- API client authentication
- Environment variables
- Security best practices

**Key Components:**
- [src/auth.ts](../src/auth.ts) - Auth initialization and API clients
- [src/routes/login.tsx](../src/routes/login.tsx) - Login page
- [src/routes/_app/route.tsx](../src/routes/_app/route.tsx) - Protected route layout

---

### [02. Data Services](./02-data-services.md)
Guide to data fetching, Dynas database integration, and AI chat tools.

**Topics Covered:**
- BZ API Client configuration
- Dynas Client for database operations
- React Query setup
- Custom data sources for Pebble
- AI chat with tool calling
- SQL query execution
- Error handling patterns

**Key Components:**
- [src/query-client.ts](../src/query-client.ts) - React Query setup
- [src/hooks/useAppChat.ts](../src/hooks/useAppChat.ts) - App chat hook
- [src/hooks/usePebbleChat.ts](../src/hooks/usePebbleChat.ts) - Pebble chat hook

---

### [03. Code Structure](./03-code-structure.md)
Architecture and organization of the application codebase.

**Topics Covered:**
- Directory structure
- File-based routing with TanStack Router
- Component architecture and patterns
- Custom hooks organization
- State management strategies
- Build configuration (Vite)
- TypeScript project setup
- Module patterns and imports
- Code splitting
- Performance optimizations

**Key Concepts:**
- Route tree generation
- Layout routes vs page routes
- Path aliases (`#/` imports)
- Component composition
- Data flow architecture

---

### [04. Coding Style](./04-coding-style.md)
Code style guidelines and conventions enforced by Biome.

**Topics Covered:**
- Formatting rules (indentation, line width, semicolons, quotes)
- TypeScript strict mode configuration
- React patterns and hooks conventions
- Naming conventions
- Import organization
- Code quality rules
- CSS/Tailwind conventions
- Accessibility guidelines
- Available scripts and commands

**Key Tools:**
- Biome for linting and formatting
- TypeScript strict mode
- Lefthook for pre-commit checks

---

### [05. Custom App Pages](./05-custom-app-pages.md)
Guide to creating custom app integrations that hide the template navigation.

**Topics Covered:**
- Custom app page architecture
- Hiding template sidebar for specific routes
- Preserving chat bubble functionality
- Route registration and organization
- Layout patterns for custom apps
- File structure best practices
- Navigation between custom routes
- Real-world examples

**Use Cases:**
- Integrating external app UIs (like n8n, Notion, etc.)
- Building standalone dashboards
- Creating specialized workflows
- Apps with custom navigation systems

**Key Files:**
- [src/routes/_app/route.tsx](../src/routes/_app/route.tsx) - Main layout with route logic

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm package manager

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Environment Setup

Create a `.env` file with:

```env
VITE_OAUTH_CLIENT_ID=your_oauth_client_id
VITE_API_BASE_URL=https://api.boltzbit.com
VITE_GATEWAY_URL=https://gateway.boltzbit.com
VITE_DYNAS_APP_ID=your_dynas_app_id
```

### Development Commands

```bash
# Development
pnpm dev              # Start dev server (port 3000)

# Code Quality
pnpm check            # Run Biome linter
pnpm check:fix        # Auto-fix linting issues
pnpm typecheck        # TypeScript type checking

# Testing
pnpm test             # Run tests

# Build
pnpm build            # Production build
pnpm preview          # Preview production build
```

## 🏗️ Tech Stack

### Core Framework
- **React 19** - UI library
- **TypeScript 5.9** - Type-safe JavaScript
- **Vite 8** - Build tool and dev server

### Routing & Navigation
- **TanStack Router** - File-based routing with type safety
- Auto-generated route tree
- Intent-based prefetching

### Styling
- **Tailwind CSS 4** - Utility-first CSS framework
- Custom design token system
- Dark/light mode support

### State Management
- **React Query** - Server state management
- **Zustand** (via auth-utils) - Client state for auth
- React hooks for local state

### Authentication
- **@boltzbit/auth-utils** - OAuth flow management
- Automatic token handling
- Protected routes

### Data & APIs
- **@boltzbit/bz-api-client** - BoltzHub API client
- **@boltzbit/dynas-client** - Database operations
- **@boltzbit/chat** - AI chat with tool calling

### AI & Visualization
- **@boltzbit/pebble** - Dashboard building
- **@boltzbit/ui__chat** - Chat UI components
- Claude 4.5 Sonnet model integration

### Code Quality
- **Biome** - Fast linter and formatter
- **Vitest** - Unit testing framework
- **Lefthook** - Git hooks manager

## 📁 Project Structure

```
bz-app-template/
├── docs/                    # 📚 This documentation
│   ├── README.md
│   ├── 01-authentication.md
│   ├── 02-data-services.md
│   ├── 03-code-structure.md
│   ├── 04-coding-style.md
│   └── 05-custom-app-pages.md
├── src/
│   ├── components/          # Reusable UI components
│   ├── hooks/               # Custom React hooks
│   ├── routes/              # File-based routing
│   │   ├── __root.tsx       # Root layout
│   │   ├── login.tsx        # Login page
│   │   └── _app/            # Protected routes
│   ├── auth.ts              # Auth setup
│   ├── main.tsx             # App entry point
│   ├── query-client.ts      # React Query config
│   └── styles.css           # Global styles
├── biome.json               # Linter/formatter config
├── package.json
├── tsconfig.json            # TypeScript config
└── vite.config.ts           # Vite config
```

## 🎯 Key Features

### Authentication
- OAuth-based login with BoltzHub
- Protected routes with automatic redirects
- Token management and refresh
- Secure API client configuration

### AI Chat Integration
- Built-in chat interface
- Tool calling capabilities
- Streaming responses
- Database query tools
- API integration tools

### Dashboard Builder (Pebble)
- Visual component creation via chat
- Drag-and-drop grid layout
- Real-time data visualization
- SQL query integration

### Developer Experience
- Fast HMR with Vite
- Type-safe routing
- Auto-formatted code
- Path aliases for clean imports
- Automatic code splitting

## 🔍 Common Patterns

### Creating a New Page

1. Create route file:
```typescript
// src/routes/_app/mypage.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/mypage')({
  component: MyPage,
});

function MyPage() {
  return <div>My page content</div>;
}
```

2. Add navigation link:
```typescript
// src/components/Sidebar.tsx
<Link to="/mypage">My Page</Link>
```

### Using Data Services

```typescript
// In a component or hook
import { dynasClient } from '#/auth';

const { data, error } = await dynasClient.POST('/v1/apps/{appId}/tables/query', {
  params: { path: { appId: import.meta.env.VITE_DYNAS_APP_ID } },
  body: { query: 'SELECT * FROM users', readonly: true },
});
```

### Creating Custom Hooks

```typescript
// src/hooks/useMyFeature.ts
import { useState, useEffect } from 'react';

export function useMyFeature() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Fetch data
  }, []);

  return { data };
}
```

## 📖 Learning Path

**For New Developers:**
1. Start with [Code Structure](./03-code-structure.md) to understand the architecture
2. Review [Coding Style](./04-coding-style.md) for conventions
3. Read [Authentication](./01-authentication.md) to understand auth flow
4. Explore [Data Services](./02-data-services.md) for data fetching
5. Learn [Custom App Pages](./05-custom-app-pages.md) if building integrations

**For Experienced Developers:**
1. Skim [Code Structure](./03-code-structure.md) for project overview
2. Focus on [Data Services](./02-data-services.md) for API usage
3. Reference [Coding Style](./04-coding-style.md) as needed
4. See [Custom App Pages](./05-custom-app-pages.md) for custom layouts

## 🔗 External Resources

### Framework Documentation
- [React Documentation](https://react.dev)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Query](https://tanstack.com/query)
- [Vite](https://vite.dev)
- [TypeScript](https://www.typescriptlang.org)

### Tools
- [Biome](https://biomejs.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Vitest](https://vitest.dev)

### BoltzBit Packages
- `@boltzbit/auth-utils` - Authentication utilities
- `@boltzbit/bz-api-client` - API client
- `@boltzbit/dynas-client` - Database client
- `@boltzbit/chat` - AI chat integration
- `@boltzbit/pebble` - Dashboard builder

## 🤝 Contributing

When contributing to this template:

1. Follow the [Coding Style](./04-coding-style.md) guidelines
2. Run `pnpm check:fix` before committing
3. Ensure `pnpm typecheck` passes
4. Write tests for new features
5. Update documentation as needed

## 📝 License

This template is proprietary to BoltzBit.

---

**Last Updated:** March 2026
**Template Version:** Based on bz-app-template
