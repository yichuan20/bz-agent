# Design Token Library

15 themes × 3 modes = 45 token sets.

## Structure

```
tokens/
├── index.css          ← import all themes at once
├── index.ts           ← TypeScript re-exports
├── meridian/
│   ├── meridian.light.css
│   ├── meridian.dark.css
│   ├── meridian.hc.css
│   ├── meridian.css           ← all modes combined
│   ├── meridian.tokens.json   ← W3C DTCG format
│   └── meridian.ts            ← typed token object
├── solace/ ...
└── (13 more themes)
```

## Usage

### CSS
```html
<link rel="stylesheet" href="tokens/index.css">
<!-- or a single theme: -->
<link rel="stylesheet" href="tokens/meridian/meridian.css">
```

Apply a theme by setting `data-theme` on any element:
```html
<html data-theme="meridian-dark">
<div data-theme="solace-light">
```

### TypeScript
```ts
import { meridianTokens } from './tokens';
const darkAccent = meridianTokens.dark['--color-accent-1']; // '#00D4FF'
```

## Themes

| Theme | Sector | Default Mode |
|-------|--------|--------------|
| Meridian | Finance & Trading | dark |
| Solace | Healthcare & Clinical | light |
| Forge | Developer Tools & CLI | dark |
| Lumen | Marketing & Editorial | light |
| Nexus | CRM & Sales | light |
| Slate | Legal & Compliance | light |
| Pulse | Analytics & Data Visualization | dark |
| Grove | Sustainability & ESG | light |
| Canvas | Productivity & Knowledge Management | light |
| Flow | SaaS & Payment Infrastructure | light |
| Duo | Gamification & Learning | light |
| Signal | Media & Music Streaming | dark |
| Terra | Consumer & Marketplace Trust | light |
| Apex | Sports & Fitness Tracking | light |
| Aura | Minimal & Product | light |

## Modes
- `light` — light mode
- `dark` — dark mode  
- `hc` — high contrast (WCAG AAA)

## Token Categories
- `--color-bg-*` — background surfaces (primary, secondary, tertiary, elevated)
- `--color-text-*` — text hierarchy (primary, secondary, tertiary)
- `--color-border-*` — border colors (primary, secondary)
- `--color-accent-*` — brand accents (1–4)
- `--shadow-card`, `--shadow-hover` — elevation
- `--radius-sm/md/lg` — border radius scale
- `--motion-transition` — default transition
- `--font-display`, `--font-body` — typefaces
- `--font-size-xs/sm/md/lg/xl/2xl` — type scale
- `--card-padding`, `--hero-padding`, `--section-gap` — spacing
