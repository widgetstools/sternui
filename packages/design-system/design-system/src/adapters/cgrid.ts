/**
 * cgrid theme adapter — sibling of `agGrid.ts` for the MarketsCgrid
 * surface.
 *
 * Same design decision as the AG adapter: every color routes through
 * the live OKLCH design tokens (`--card`, `--foreground`,
 * `--grid-border`, `--primary`, …) so light/dark flips with
 * `data-theme` on `<html>` with ZERO JavaScript — but where AG needs a
 * baked `Theme` object, cgrid themes are plain CSS custom properties
 * (`--cg-*`) on a theme class. This adapter is therefore a stylesheet:
 * `.cg-theme-starui` maps `--cg-*` → `oklch(var(--token))`, and the
 * density presets are modifier classes. Inject once per document via
 * `ensureCgridThemeStyles()` and hand the class names to the grid.
 *
 * Token mapping mirrors `staruiSharedColorParams()` +
 * `gridDensityStructuralParams()` in agGrid.ts — keep the two in sync.
 */

import type { GridDensity } from './agGrid';

export const CGRID_THEME_CLASS = 'cg-theme-starui';

/** Density is scoped from the WRAPPER element (cgrid's `theme` option
 *  takes exactly one class), so the surface adds this class to its own
 *  container div and the stylesheet targets
 *  `.cgd-<density> .cg-theme-starui`. */
export function cgridDensityClass(density: GridDensity): string {
  return `cgd-${density}`;
}

const FONT_STACK = "'Inter', system-ui, -apple-system, sans-serif";
const MONO_STACK = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace";

/** The full theme stylesheet. Colors: staruiSharedColorParams parity.
 *  Structure: gridDensityStructuralParams parity (ultra/compact/comfort). */
export const CGRID_THEME_CSS = `
.${CGRID_THEME_CLASS} {
  color-scheme: light;
  --cg-bg-color: oklch(var(--card));
  --cg-fg-color: oklch(var(--foreground));
  --cg-border-color: oklch(var(--grid-border));
  --cg-grid-line-color: oklch(var(--grid-border) / 0.7);
  --cg-header-bg: oklch(var(--card));
  --cg-header-fg: oklch(var(--foreground));
  --cg-row-alt-bg: oklch(var(--primary) / 0.022);
  --cg-row-hover-bg: oklch(var(--primary) / 0.07);
  --cg-row-selected-bg: oklch(var(--primary) / 0.12);
  --cg-range-fill-color: oklch(var(--primary) / 0.14);
  --cg-range-border-color: oklch(var(--primary) / 0.5);
  --cg-chrome-accent: oklch(var(--primary));
  --cg-focus-ring-color: oklch(var(--primary));
  --cg-popup-bg: oklch(var(--popover));
  --cg-popup-border: oklch(var(--border));
  --cg-menu-hover-bg: oklch(var(--primary) / 0.07);
  --cg-tooltip-bg: oklch(var(--popover));
  --cg-tooltip-fg: oklch(var(--popover-foreground));
  --cg-tooltip-border: oklch(var(--border));
  --cg-input-bg: oklch(var(--card));
  --cg-input-fg: oklch(var(--foreground));
  --cg-input-border: oklch(var(--border));
  --cg-input-focus-border: oklch(var(--primary));
  --cg-font-family: ${FONT_STACK};
  --cg-cell-font-family: ${MONO_STACK};
}
html[data-theme='dark'] .${CGRID_THEME_CLASS} {
  color-scheme: dark;
  /* Header + chrome sit one step (~L +10%) above the data surface in dark
     mode — 97.5% card + 2.5% white ≈ L 0.203 → 0.223 on graphite. */
  --cg-header-bg: color-mix(in oklch, oklch(var(--card)) 97.5%, white);
}
/* Density presets — gridDensityStructuralParams parity. Scoped from the
   wrapper so the vars land ON the theme-class element (higher
   specificity than the base block above). */
.${cgridDensityClass('ultra')} .${CGRID_THEME_CLASS} {
  --cg-row-height: 22px;
  --cg-header-height: 26px;
  --cg-font-size: 10px;
  --cg-font-size-sm: 10px;
  --cg-cell-padding-x: 12px;
}
.${cgridDensityClass('compact')} .${CGRID_THEME_CLASS} {
  --cg-row-height: 30px;
  --cg-header-height: 32px;
  --cg-font-size: 12px;
  --cg-font-size-sm: 11px;
  --cg-cell-padding-x: 12px;
}
.${cgridDensityClass('comfort')} .${CGRID_THEME_CLASS} {
  --cg-row-height: 40px;
  --cg-header-height: 42px;
  --cg-font-size: 14px;
  --cg-font-size-sm: 13px;
  --cg-cell-padding-x: 12px;
}
`;

const STYLE_ID = 'starui-cgrid-theme';

/** Inject the theme stylesheet once per document. Idempotent. */
export function ensureCgridThemeStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CGRID_THEME_CSS;
  doc.head.appendChild(style);
}

/** cgrid `theme` option value (exactly one class). Density goes on the
 *  surface wrapper via `cgridDensityClass`. */
export function cgridThemeClass(): string {
  return CGRID_THEME_CLASS;
}
