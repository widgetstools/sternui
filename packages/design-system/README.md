# @marketsui/design-system

Single source of truth for the MarketsUI visual language: CSS variable tokens, theme files, and framework adapters that wire the tokens into shadcn/ui, PrimeNG, and ag-grid.

Every reference app in this monorepo consumes the design system the same way. Copy the snippets below exactly; don't improvise.

---

## What the package provides

| Path | What it is |
|---|---|
| `src/themes/fi-dark.css` | Dark palette — `:root, [data-theme="dark"]` scope |
| `src/themes/fi-light.css` | Light palette — `[data-theme="light"]` scope |
| `src/tokens/primitives.ts` | Raw tokens (colors, typography, spacing, radius, shadow) |
| `src/tokens/semantic.ts` | Role-assigned tokens (`surface`, `text`, `border`, `accent`, `positive`, `negative`, etc.) |
| `src/tokens/components.ts` | Component-scoped token mappings |
| `src/adapters/shadcn.ts` | `generateShadcnCSS()` — produces the `--background/--foreground/...` block |
| `src/adapters/primeng.ts` | `generatePrimeNGPreset()` — Aura-compatible preset |
| `src/adapters/ag-grid.ts` | `agGridDarkParams`, `agGridLightParams` — `themeQuartz.withParams()` inputs |
| `src/cell-renderers.ts` | Framework-agnostic vanilla-TS AG Grid cell renderers |
| `src/icons/` | SVG assets (MarketsUI logo variants) |

The CSS files export **both** FI-specific tokens (`--bn-*`, `--fi-*`) **and** shadcn aliases (`--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--ring`, etc.). You can use either naming scheme; new code should prefer `--bn-*` / `--fi-*`.

---

## The prescribed pattern

Every consuming app does exactly three things:

1. **Load the fonts** — JetBrains Mono + Geist from Google Fonts.
2. **Import both theme files** — fi-dark and fi-light, via a relative `@import` in the app's global stylesheet.
3. **Flip `[data-theme]`** on `document.documentElement` to toggle palettes. No `.dark` class, no PrimeNG `darkModeSelector: '.dark'`.

Initial HTML sets `data-theme="dark"`. A theme context (React) or signal/effect (Angular) persists the choice to `localStorage` and re-applies on mount.

---

## React

### `src/index.css`

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Geist:wght@300;400;500;600&display=swap');

@import '../../../packages/design-system/src/themes/fi-dark.css';
@import '../../../packages/design-system/src/themes/fi-light.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * { @apply border-border; }
  html, body, #root { height: 100%; width: 100%; overflow: hidden; }
  body {
    background: var(--bn-bg);
    color: var(--bn-t0);
    font-family: var(--fi-sans);
    font-size: var(--fi-font-sm);
  }
}
```

### `src/context/ThemeContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void; isDark: boolean }>({
  theme: 'dark', toggleTheme: () => {}, isDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.dataset.agThemeMode = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

### `src/main.tsx`

```tsx
import { ThemeProvider } from './context/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
```

### `index.html`

```html
<html data-theme="dark">
```

---

## Angular

### `src/styles.scss`

```scss
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Geist:wght@300;400;500;600&display=swap');

@import '../../../packages/design-system/src/themes/fi-dark.css';
@import '../../../packages/design-system/src/themes/fi-light.css';

html, body { height: 100%; width: 100%; margin: 0; overflow: hidden; }
body {
  background: var(--bn-bg);
  color: var(--bn-t0);
  font-family: var(--fi-sans);
  font-size: var(--fi-font-sm);
}
```

Remember to set `"styles": ["src/styles.scss"]` in `angular.json`.

### `src/app/app.config.ts` — PrimeNG wiring

If the app or any imported sub-package uses PrimeNG, wire the preset:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from 'primeng/api';
import { Aura } from 'primeng/themes';
import { generatePrimeNGPreset } from '@marketsui/design-system/adapters/primeng';

import { routes } from './app.routes';

const FiTheme = definePreset(Aura, generatePrimeNGPreset());

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: FiTheme,
        options: { darkModeSelector: '[data-theme="dark"]' },
      },
    }),
  ],
};
```

### `src/app/app.ts` — theme signal

```ts
import { Component, signal, effect } from '@angular/core';

@Component({ selector: 'app-root', standalone: true, template: `<router-outlet />` })
export class AppComponent {
  readonly theme = signal<'dark' | 'light'>(
    (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
  );

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      document.body.dataset['agThemeMode'] = t;
      localStorage.setItem('theme', t);
    });
  }

  toggleTheme() {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }
}
```

### `src/index.html`

```html
<html lang="en" data-theme="dark">
```

---

## Token reference

### Surfaces

| Token | Role |
|---|---|
| `--bn-bg` | Application background |
| `--bn-bg1` | Primary panel/card background |
| `--bn-bg2` | Secondary panel (nested) |
| `--bn-bg3` | Hovered / active / selected cell |

### Text

| Token | Role |
|---|---|
| `--bn-t0` | Primary text, headings |
| `--bn-t1` | Secondary text, subtitles, column headers |
| `--bn-t2` | Muted / placeholder |
| `--bn-t3` | Disabled |

### Borders

| Token | Role |
|---|---|
| `--bn-border` | Primary dividing border |
| `--bn-border2` | Secondary / emphasized border (inputs, focused) |

### Accents

| Token | Role |
|---|---|
| `--bn-blue` / `--bn-blue2` | Brand, links, focus ring |
| `--bn-green` / `--bn-green2` | Positive, buy, filled |
| `--bn-red` / `--bn-red2` | Negative, sell, cancel |
| `--bn-amber` | Warning (pure orange — no brown/copper) |
| `--bn-cyan`, `--bn-purple` | Additional accents |

### Overlays (badges, fills)

Paired `*-soft` / `*-ring` for tinted backgrounds + borders: `--bn-positive-*`, `--bn-negative-*`, `--bn-warning-*`, `--bn-info-*`, `--bn-neutral-*`.

### Typography

| Token | Value |
|---|---|
| `--fi-sans` | `'Geist', sans-serif` |
| `--fi-mono` | `'JetBrains Mono', monospace` |
| `--fi-font-xs` | 10px |
| `--fi-font-sm` | 11px (body default) |
| `--fi-font-md` | 13px |
| `--fi-font-lg` | 18px |

### shadcn aliases

The CSS files also set `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius` — all in HSL-triplet form so `hsl(var(--card))` works directly. Use these when integrating shadcn/ui or Tailwind utilities that resolve via these variables.

---

## Adapters

### AG Grid

```ts
import { themeQuartz } from 'ag-grid-community';
import { agGridDarkParams, agGridLightParams } from '@marketsui/design-system/adapters/ag-grid';

const darkTheme  = themeQuartz.withParams(agGridDarkParams);
const lightTheme = themeQuartz.withParams(agGridLightParams);

// Pick theme from [data-theme]:
get gridTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? darkTheme : lightTheme;
}
```

### PrimeNG

See the Angular section above — `generatePrimeNGPreset()` returns an Aura-compatible override object.

### shadcn / Tailwind

No adapter call is needed at runtime — `fi-dark.css` and `fi-light.css` already set the shadcn CSS variable block. `generateShadcnCSS()` exists for code-generation use cases.

### Cell renderers

Framework-agnostic vanilla-TS renderers for AG Grid: `SideCellRenderer`, `StatusBadgeRenderer`, `ColoredValueRenderer`, `OasValueRenderer`, `SignedValueRenderer`, `TickerCellRenderer`, `RatingBadgeRenderer`, `PnlValueRenderer`, `FilledAmountRenderer`, `BookNameRenderer`, `ChangeValueRenderer`, `YtdValueRenderer`, `RfqStatusRenderer`.

```ts
import { SideCellRenderer } from '@marketsui/design-system/cell-renderers';
```

---

## Notes

- **Fonts are loaded from Google Fonts** via `@import url(…)`. For CSP-restricted or offline deployments, self-host the font files and replace the `@import url(…)` line with local `@font-face` declarations.
- **Do not use `.dark` class-based theming.** All sample code and app bootstraps use the `[data-theme]` attribute. PrimeNG's `darkModeSelector` must be `'[data-theme="dark"]'`.
- **Relative import paths** (`../../../packages/design-system/src/themes/fi-dark.css`) are intentional — they resolve correctly under the npm workspace symlinks used by every app here. A package-path import (`@marketsui/design-system/themes/fi-dark.css`) would work too once exports are declared, but the relative path matches every existing app for consistency.

---

## Exemplar apps

These apps demonstrate the full pattern. Use them as copy-paste references when onboarding a new app:

- [apps/fi-trading-reference-angular/](../../apps/fi-trading-reference-angular/) — Angular + PrimeNG
- [apps/fi-trading-reference/](../../apps/fi-trading-reference/) — React + Tailwind + shadcn/ui

For a live, interactive showcase of every token and adapter, see [apps/fi-trading-reference-angular/src/app/widgets/design-system.widget.ts](../../apps/fi-trading-reference-angular/src/app/widgets/design-system.widget.ts).
