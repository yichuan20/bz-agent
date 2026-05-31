# BZ App Zero

This is a copy of the BoltzBit app template with comprehensive documentation.

## 📚 Documentation

See the [docs/](./docs/) directory for complete documentation:

- **[Documentation Index](./docs/README.md)** - Overview and quick start
- **[Authentication](./docs/01-authentication.md)** - OAuth setup, login/logout, protected routes
- **[Data Services](./docs/02-data-services.md)** - Dynas database, API clients, AI chat tools
- **[Code Structure](./docs/03-code-structure.md)** - Architecture, routing, components, hooks
- **[Coding Style](./docs/04-coding-style.md)** - Formatting, TypeScript, React patterns
- **[Custom App Pages](./docs/05-custom-app-pages.md)** - Creating custom app integrations

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `VITE_OAUTH_CLIENT_ID` - Your OAuth client ID
- `VITE_API_BASE_URL` - API base URL
- `VITE_GATEWAY_URL` - Gateway URL
- `VITE_DYNAS_APP_ID` - Dynas app ID

### 3. Start Development Server

```bash
pnpm dev
```

The app will be available at http://localhost:3000

## 📁 Project Structure

```
bz-app-zero/
├── docs/                    # 📚 Comprehensive documentation
├── src/
│   ├── components/          # Reusable UI components
│   ├── hooks/               # Custom React hooks
│   ├── routes/              # File-based routing
│   ├── auth.ts              # Authentication setup
│   ├── main.tsx             # App entry point
│   └── styles.css           # Global styles
├── .env.example             # Environment variables template
├── biome.json               # Linter/formatter config
├── package.json
├── tsconfig.json            # TypeScript config
└── vite.config.ts           # Vite config
```

## 🛠️ Available Commands

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

## 🔧 Tech Stack

- **React 19** - UI library
- **TypeScript 5.9** - Type-safe JavaScript
- **Vite 8** - Build tool
- **TanStack Router** - File-based routing
- **Tailwind CSS 4** - Styling
- **Biome** - Linting & formatting

### BoltzBit Packages

- `@boltzbit/auth-utils` - OAuth authentication
- `@boltzbit/bz-api-client` - API client
- `@boltzbit/dynas-client` - Database client
- `@boltzbit/chat` - AI chat integration
- `@boltzbit/pebble` - Dashboard builder

## 📖 Learn More

Start with the [Documentation Index](./docs/README.md) for a complete guide to the codebase.

For the original template README, see [README-template.md](./README-template.md).

## 🎯 What's Included

### Copied from bz-app-template:
- ✅ Complete source code (`src/`)
- ✅ Configuration files (TypeScript, Vite, Biome)
- ✅ Package dependencies
- ✅ Git hooks (Lefthook)
- ✅ VS Code settings

### Documentation Created:
- ✅ Authentication guide
- ✅ Data services & Dynas guide
- ✅ Code structure overview
- ✅ Coding style guide
- ✅ Custom app pages guide
- ✅ Quick start instructions

### Not Included:
- ❌ `node_modules/` (run `pnpm install`)
- ❌ `.env` file (copy from `.env.example`)
- ❌ Lock file (will be generated on install)

---

**Source:** bz-app-template
**Created:** March 2026
