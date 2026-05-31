# Design Token Library Integration

This project uses a comprehensive design token library with **16 professionally designed themes** across 3 modes each (light, dark, high-contrast).

## Quick Start: Changing Themes

### Step 1: Edit the Theme Import

Open `src/design-tokens/tailwind-adapter.css` and change line ~57:

```css
/* Change this line to your desired theme */
@import './duo/duo.css';

/* Available themes:
 * - @import './original/original.css';  (Original BZ Template)
 * - @import './aura/aura.css';          (Minimal & Product)
 * - @import './meridian/meridian.css';  (Finance & Trading)
 * - @import './solace/solace.css';      (Healthcare & Clinical)
 * - @import './forge/forge.css';        (Developer Tools & CLI)
 * - @import './lumen/lumen.css';        (Marketing & Editorial)
 * - @import './nexus/nexus.css';        (CRM & Sales)
 * - @import './slate/slate.css';        (Legal & Compliance)
 * - @import './pulse/pulse.css';        (Analytics & Data Viz)
 * - @import './grove/grove.css';        (Sustainability & ESG)
 * - @import './canvas/canvas.css';      (Productivity)
 * - @import './flow/flow.css';          (SaaS & Payments)
 * - @import './duo/duo.css';            (Gamification & Learning)
 * - @import './signal/signal.css';      (Media & Music)
 * - @import './terra/terra.css';        (Consumer & Marketplace)
 * - @import './apex/apex.css';          (Sports & Fitness)
 */
```

### Step 2: Update Active Theme Config

Edit `src/design-tokens/active-theme.ts`:

```ts
export const ACTIVE_THEME: ThemeName = 'duo'; // Match your import
```

### Step 3: Reload

Just reload your browser (Ctrl+R or Cmd+R). That's it!

**No localStorage clearing needed** - the theme is controlled purely by the code, not browser storage.

---

## Available Themes (16 Total)

| Theme | Sector | Default Mode | Description |
|-------|--------|--------------|-------------|
| **Original** | Default | Light | Original BZ app template theme with OKLCH color space |
| **Aura** | Minimal & Product | Light | Minimalist, product-focused design with generous spacing |
| **Meridian** | Finance & Trading | Dark | Professional trading interface with high-contrast accents |
| **Solace** | Healthcare & Clinical | Light | Calming, accessible design for healthcare applications |
| **Forge** | Developer Tools & CLI | Dark | Terminal-inspired theme for developer tools |
| **Lumen** | Marketing & Editorial | Light | Bright, editorial-focused design with emphasis on content |
| **Nexus** | CRM & Sales | Light | Professional CRM interface with clear hierarchy |
| **Slate** | Legal & Compliance | Light | Formal, document-focused design for legal workflows |
| **Pulse** | Analytics & Data Viz | Dark | Data-dense interface optimized for charts and metrics |
| **Grove** | Sustainability & ESG | Light | Nature-inspired palette for sustainability platforms |
| **Canvas** | Productivity | Light | Clean workspace design for productivity tools |
| **Flow** | SaaS & Payments | Light | Modern SaaS interface with smooth interactions |
| **Duo** | Gamification & Learning | Light | Playful, engaging design for educational platforms |
| **Signal** | Media & Music | Dark | Immersive media experience with bold accents |
| **Terra** | Consumer & Marketplace | Light | Trustworthy, consumer-friendly marketplace design |
| **Apex** | Sports & Fitness | Light | Energetic design for fitness and performance tracking |

---

## Light/Dark Mode Toggle

The app includes a light/dark mode toggle in the top-right corner of the sidebar.

**How it works:**
- Toggles between light and dark modes only (does not change the theme)
- Mode changes are **session-only** - they reset on page reload
- Default mode is determined by system preference (`prefers-color-scheme`)
- No localStorage involved - simple and reliable

**To use in your components:**

```tsx
import ThemeToggle from '#/components/ThemeToggle';

function Header() {
  return (
    <header className="flex items-center justify-between">
      <h1>My App</h1>
      <ThemeToggle />
    </header>
  );
}
```

---

## How It Works

### Simple Architecture

```
1. CSS Import (tailwind-adapter.css)
   └─> Imports ONE theme (e.g., duo.css)
       └─> Contains all 3 modes: light, dark, high-contrast

2. TypeScript Config (active-theme.ts)
   └─> Specifies theme name (must match CSS import)

3. Initialization (main.tsx)
   └─> Sets initial mode based on system preference
   └─> User can toggle light/dark during session

4. User toggles mode
   └─> Changes data-theme attribute on <html>
   └─> No persistence - resets on reload
```

### Data Attribute Format

The theme is controlled by a `data-theme` attribute on the `<html>` element:

```html
<!-- Examples -->
<html data-theme="duo-light">   <!-- Duo theme, light mode -->
<html data-theme="duo-dark">    <!-- Duo theme, dark mode -->
<html data-theme="forge-dark">  <!-- Forge theme, dark mode -->
```

### Initialization Flow

```ts
// main.tsx
import { ACTIVE_THEME, initializeTheme } from './design-tokens';

// Called before app renders
initializeTheme(ACTIVE_THEME);

// This:
// 1. Gets system preference (light/dark)
// 2. Uses theme's default mode or system preference
// 3. Sets data-theme attribute
// 4. That's it - no localStorage
```

---

## Design Token Categories

All themes include these token categories:

### Colors

```css
/* Backgrounds */
--color-bg-primary       /* Main background */
--color-bg-secondary     /* Secondary surfaces */
--color-bg-tertiary      /* Tertiary surfaces */
--color-bg-elevated      /* Elevated/modal backgrounds */

/* Text */
--color-text-primary     /* Primary text */
--color-text-secondary   /* Secondary text */
--color-text-tertiary    /* Tertiary/muted text */

/* Borders */
--color-border-primary   /* Primary borders */
--color-border-secondary /* Secondary borders */

/* Accents (Brand colors) */
--color-accent-1         /* Primary brand accent */
--color-accent-2         /* Secondary brand accent */
--color-accent-3         /* Tertiary brand accent */
--color-accent-4         /* Quaternary brand accent */
```

### Other Tokens

```css
/* Shadows */
--shadow-card            /* Card/component shadow */
--shadow-hover           /* Hover state shadow */

/* Border Radius */
--radius-sm              /* Small radius */
--radius-md              /* Medium radius */
--radius-lg              /* Large radius */

/* Typography */
--font-display           /* Display/heading font */
--font-body              /* Body text font */
--font-size-xs to 2xl    /* Font sizes */

/* Spacing */
--card-padding           /* Default card padding */
--hero-padding           /* Hero section padding */
--section-gap            /* Section spacing */

/* Motion */
--motion-transition      /* Default transition timing */
```

---

## Tailwind Integration

Design tokens are mapped to Tailwind utilities automatically:

```tsx
<div className="bg-background">           {/* Uses theme's background */}
<div className="bg-surface">              {/* Uses theme's surface */}
<div className="text-on-surface">         {/* Uses theme's text color */}
<div className="border-outline">          {/* Uses theme's border */}
<button className="bg-primary">           {/* Uses theme's primary accent */}
<div className="shadow-card">             {/* Uses theme's card shadow */}
```

### Theme Variants

```tsx
<div className="dark:bg-surface">         {/* Only in dark mode */}
<div className="light:bg-background">     {/* Only in light mode */}
```

---

## Programmatic Theme Control

If you need to change modes programmatically:

```tsx
import { applyTheme, getCurrentTheme, ACTIVE_THEME } from '#/design-tokens';

// Toggle mode
function toggleMode() {
  const current = getCurrentTheme();
  const nextMode = current?.mode === 'light' ? 'dark' : 'light';
  applyTheme(ACTIVE_THEME, nextMode);

  // Notify other components
  window.dispatchEvent(new Event('themechange'));
}

// Get current theme
const current = getCurrentTheme(); // { theme: 'duo', mode: 'light' }
```

---

## Utilities API

```ts
import {
  type ThemeName,
  type ThemeMode,
  type ThemeInfo,
  THEMES,
  ACTIVE_THEME,
  applyTheme,
  getCurrentTheme,
  getAllThemes,
  getSystemMode,
} from '#/design-tokens';

// Get all available themes
const themes = getAllThemes();

// Get current theme and mode
const current = getCurrentTheme();

// Get theme metadata
const themeInfo = THEMES['meridian'];

// Get system preference
const systemMode = getSystemMode(); // 'light' | 'dark'
```

---

## Best Practices

### 1. Use Semantic Tokens

Prefer semantic tokens over hardcoded colors:

```tsx
/* ✅ Good - adapts to theme and mode changes */
<div className="bg-surface text-on-surface border-outline">

/* ❌ Avoid - bypasses theming system */
<div className="bg-gray-100 text-gray-900 border-gray-300">
```

### 2. Test in Both Modes

Always test your UI in both light and dark modes using the toggle button.

### 3. One Theme Per App

This system is designed for **one theme per app** with light/dark mode support. If you need multi-theme switching, you'll need to import all themes (increases bundle size significantly).

---

## Troubleshooting

### Theme not applying?

1. Check `tailwind-adapter.css` - which theme is imported?
2. Check `active-theme.ts` - does ACTIVE_THEME match the import?
3. Reload the page (Ctrl+R / Cmd+R)

### Light/Dark toggle not working?

1. Reload the page to reset
2. Check browser console for errors
3. Verify `ThemeToggle` component is rendered

### Want to change default mode?

Edit the theme's `defaultMode` in `theme-config.ts`, or it will use system preference.

### TypeScript errors?

Restart TypeScript server: VS Code → Cmd+Shift+P → "TypeScript: Restart TS Server"

---

## Why No localStorage?

**Previous version:** Theme preferences were saved to localStorage, which caused conflicts when changing themes in development.

**Current version:** No localStorage - theme is controlled purely by code. This means:
- ✅ No conflicts when changing themes
- ✅ Simpler mental model
- ✅ More reliable
- ✅ Easier to debug
- ⚠️ Mode preference doesn't persist across reloads (resets to system preference)

If you need mode persistence, you can add it back by modifying `ThemeToggle.tsx` to call `localStorage.setItem('theme-mode', mode)` and reading it in `initializeTheme()`.

---

## AI Agent Instructions

When helping users with themes:

### Changing Theme

```
1. Edit tailwind-adapter.css: Change @import line
2. Edit active-theme.ts: Update ACTIVE_THEME
3. Tell user to reload (Ctrl+R / Cmd+R)
```

### Toggle Not Working

```
1. Tell user to reload page
2. Check console for errors
3. Verify ThemeToggle is rendered
```

### What NOT to Do

❌ Don't mention localStorage (it's not used)
❌ Don't import multiple themes unless specifically requested
❌ Don't modify theme CSS files
❌ Don't over-complicate - the system is intentionally simple
