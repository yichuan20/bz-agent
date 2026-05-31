---
name: BZ App Zero v2 Architecture
description: Design token system and CSS architecture for this app template
type: project
---

This is a React + TanStack Router app template using plain CSS (no Tailwind).

**Design Token Architecture — single file to swap:**
- `design_tokens/boltzhub-tokens.css` — raw CSS custom properties (--bg-primary, --text-primary, --accent-blue, etc.)
- `src/styles.css` — imports the token file + fonts + app.css. Change only the token import to swap themes.
- `src/styles/app.css` — all app-level semantic CSS classes that reference token variables

**Theme system:** simplified to light/dark only via `data-theme="dark"` on `<html>`. No attribute = light mode.
- `src/design-tokens/theme-config.ts` — `applyTheme('light'|'dark')`, `getCurrentMode()`, `initializeTheme()`
- `src/design-tokens/index.ts` — re-exports theme utils

**Key CSS classes (boltzhub-tokens.css provides):** `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-cta`, `.btn-small`, `.card`, `.card-interactive`, `.input`, `.navbar`, `.table-header`, `.table-row`

**Key CSS classes (app.css provides):** `.app-shell`, `.app-main`, `.sidebar`, `.nav-link`, `.page`, `.page-title`, `.card-grid`, `.data-table`, `.badge`, `.empty-state`, `.loading-state`, `.error-state`, `.chat-wrapper`, `.chat-conversation-container`

**Removed packages:** tailwindcss, @tailwindcss/vite, tw-animate-css, @boltzbit/pebble, @boltzbit/react-utils

**Routes:** /, /login, /chat, /files, /products (pebble removed)

**Why:** User wants minimum code changes when swapping design tokens. New token files must use the same CSS custom property names as boltzhub-tokens.css format.
