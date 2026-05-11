// ─────────────────────────────────────────────────────────────
//  FI Design System — shadcn/ui Adapter
//  Generates CSS custom property declarations for :root,
//  [data-theme="dark"], and [data-theme="light"].
//  Drop this output into your globals.css / index.css.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  Unified CSS Generator
//  Emits the entire theme.css consumed by every app.
//
//  Layer order:
//    1. Chroma Desk · Dark — :root + [data-theme="dark"]
//    2. Chroma Desk · Light — [data-theme="light"]
//    3. CVD override (dark) — [data-theme="dark"][data-cvd="on"]
//    4. CVD override (light) — [data-theme="light"][data-cvd="on"]
//
//  Each base block emits THREE token namespaces:
//    --ds-*       source tokens (hex / rgba)
//    --*          shadcn-compat HSL channel aliases
//    --p-*        PrimeNG / tailwindcss-primeui aliases
// ─────────────────────────────────────────────────────────────

import { dark, light, shared } from '../tokens/semantic';
import type { ColorScheme } from '../tokens/semantic';
import { colors, typography, radius, transition } from '../tokens/primitives';
import { hexToHslChannel } from '../internal/wcag';

// Convert hex to HSL string (e.g. "210 14% 23%") for shadcn CSS vars
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  if (max===min) return `0 0% ${Math.round(l*100)}%`;
  const d = max-min;
  const s = l>0.5 ? d/(2-max-min) : d/(max+min);
  let h = 0;
  if (max===r) h = ((g-b)/d + (g<b?6:0))/6;
  else if (max===g) h = ((b-r)/d + 2)/6;
  else h = ((r-g)/d + 4)/6;
  return `${Math.round(h*360)} ${Math.round(s*100)}% ${Math.round(l*100)}%`;
}

function schemeVars(scheme: ColorScheme, mode: 'dark' | 'light') {
  const primaryFg =
    mode === 'dark' ? '201 74% 9%' : '0 0% 100%';
  const destructiveFg =
    mode === 'dark' ? '340 65% 10%' : '0 0% 100%';
  return `
    /* ── shadcn/ui overrides ── */
    --background: ${hexToHsl(scheme.surface.ground)};
    --foreground: ${hexToHsl(scheme.text.primary)};
    --card: ${hexToHsl(scheme.surface.primary)};
    --card-foreground: ${hexToHsl(scheme.text.primary)};
    --popover: ${hexToHsl(scheme.surface.primary)};
    --popover-foreground: ${hexToHsl(scheme.text.primary)};
    --primary: ${hexToHsl(scheme.accent.info)};
    --primary-foreground: ${primaryFg};
    --secondary: ${hexToHsl(scheme.surface.tertiary)};
    --secondary-foreground: ${hexToHsl(scheme.text.secondary)};
    --muted: ${hexToHsl(scheme.surface.secondary)};
    --muted-foreground: ${hexToHsl(scheme.text.muted)};
    --accent: ${hexToHsl(scheme.surface.tertiary)};
    --accent-foreground: ${hexToHsl(scheme.text.primary)};
    --destructive: ${hexToHsl(scheme.accent.negative)};
    --destructive-foreground: ${destructiveFg};
    --border: ${hexToHsl(scheme.border.primary)};
    --input: ${hexToHsl(scheme.border.primary)};
    --ring: ${hexToHsl(scheme.accent.info)};
    --radius: ${shared.radius.lg};

    --scrollbar-thumb: ${scheme.scrollbar};`;
}

/** Generate the full CSS block for both themes */
export function generateShadcnCSS(): string {
  return `@layer base {
  :root, [data-theme="dark"] {${schemeVars(dark, 'dark')}
  }

  [data-theme="light"] {${schemeVars(light, 'light')}
  }
}`;
}

/** Get token values for a specific scheme (for JS consumers) */
export function getShadcnTokens(mode: 'dark' | 'light') {
  return mode === 'dark' ? dark : light;
}

// ─────────────────────────────────────────────────────────────
//  Unified CSS Generator — Task 9
// ─────────────────────────────────────────────────────────────

/** Dark ink on vivid cyan primary — matches fi-dark.css --primary-foreground */
const DARK_PRIMARY_FOREGROUND_CHANNELS = '201 74% 9%';
/** Dark ink on vivid rose destructive — matches fi-dark.css --destructive-foreground */
const DARK_DESTRUCTIVE_FOREGROUND_CHANNELS = '340 65% 10%';
/** Hex for PrimeNG --p-primary-color-text on signature cyan (same hue as DARK_PRIMARY_FOREGROUND_CHANNELS) */
const DARK_PRIMARY_FOREGROUND_HEX = '#061c28';

function dsVars(scheme: ColorScheme, mode: 'dark' | 'light'): string {
  const primaryFg =
    mode === 'dark' ? DARK_PRIMARY_FOREGROUND_CHANNELS : '0 0% 100%';
  const destructiveFg =
    mode === 'dark' ? DARK_DESTRUCTIVE_FOREGROUND_CHANNELS : '0 0% 100%';
  const successFg = hexToHslChannel(scheme.action.buyText);
  const warningFg =
    mode === 'dark' ? hexToHslChannel(colors.ink[0]) : '0 0% 100%';

  return `
    /* ── Chroma Desk source tokens ── */
    --ds-surface-ground:     ${scheme.surface.ground};
    --ds-surface-primary:    ${scheme.surface.primary};
    --ds-surface-secondary:  ${scheme.surface.secondary};
    --ds-surface-tertiary:   ${scheme.surface.tertiary};
    --ds-surface-quaternary: ${scheme.surface.quaternary};

    --ds-text-primary:   ${scheme.text.primary};
    --ds-text-secondary: ${scheme.text.secondary};
    --ds-text-muted:     ${scheme.text.muted};
    --ds-text-faint:     ${scheme.text.faint};

    --ds-border-primary:   ${scheme.border.primary};
    --ds-border-secondary: ${scheme.border.secondary};

    --ds-accent-positive:       ${scheme.accent.positive};
    --ds-accent-positive-hover: ${scheme.accent.positiveHover};
    --ds-accent-negative:       ${scheme.accent.negative};
    --ds-accent-negative-hover: ${scheme.accent.negativeHover};
    --ds-accent-warning:        ${scheme.accent.warning};
    --ds-accent-info:           ${scheme.accent.info};
    --ds-accent-info-hover:     ${scheme.accent.infoHover};
    --ds-accent-highlight:      ${scheme.accent.highlight};
    --ds-accent-purple:         ${scheme.accent.purple};

    --ds-action-buy-bg:    ${scheme.action.buyBg};
    --ds-action-buy-fg:    ${scheme.action.buyText};
    --ds-action-sell-bg:   ${scheme.action.sellBg};
    --ds-action-sell-fg:   ${scheme.action.sellText};

    --ds-state-focus-ring:    ${scheme.state.focusRing};
    --ds-state-focus-ring-bg: ${scheme.state.focusRingBg};
    --ds-state-disabled-bg:   ${scheme.state.disabledBg};
    --ds-state-disabled-fg:   ${scheme.state.disabledFg};
    --ds-state-hover-overlay: ${scheme.state.hoverOverlay};
    --ds-state-selection:     ${scheme.state.selection};

    --ds-overlay-positive-soft:  ${scheme.overlay.positiveSoft};
    --ds-overlay-positive-ring:  ${scheme.overlay.positiveRing};
    --ds-overlay-negative-soft:  ${scheme.overlay.negativeSoft};
    --ds-overlay-negative-ring:  ${scheme.overlay.negativeRing};
    --ds-overlay-warning-soft:   ${scheme.overlay.warningSoft};
    --ds-overlay-warning-ring:   ${scheme.overlay.warningRing};
    --ds-overlay-info-soft:      ${scheme.overlay.infoSoft};
    --ds-overlay-info-ring:      ${scheme.overlay.infoRing};
    --ds-overlay-neutral-soft:   ${scheme.overlay.neutralSoft};
    --ds-overlay-neutral-ring:   ${scheme.overlay.neutralRing};

    --ds-scrollbar:  ${scheme.scrollbar};

    --ds-elevation-card:    ${scheme.elevation.card};
    --ds-elevation-overlay: ${scheme.elevation.overlay};
    --ds-elevation-glow:    ${scheme.elevation.glow};

    /* ── shadcn-compat HSL channel aliases ── */
    --background:           ${hexToHslChannel(scheme.surface.ground)};
    --foreground:           ${hexToHslChannel(scheme.text.primary)};
    --card:                 ${hexToHslChannel(scheme.surface.primary)};
    --card-foreground:      ${hexToHslChannel(scheme.text.primary)};
    --popover:              ${hexToHslChannel(scheme.surface.primary)};
    --popover-foreground:   ${hexToHslChannel(scheme.text.primary)};
    --primary:              ${hexToHslChannel(scheme.accent.info)};
    --primary-foreground:   ${primaryFg};
    --secondary:            ${hexToHslChannel(scheme.surface.tertiary)};
    --secondary-foreground: ${hexToHslChannel(scheme.text.secondary)};
    --muted:                ${hexToHslChannel(scheme.surface.secondary)};
    --muted-foreground:     ${hexToHslChannel(scheme.text.muted)};
    --accent:               ${hexToHslChannel(scheme.surface.tertiary)};
    --accent-foreground:    ${hexToHslChannel(scheme.text.primary)};
    --destructive:          ${hexToHslChannel(scheme.accent.negative)};
    --destructive-foreground: ${destructiveFg};
    --success:              ${hexToHslChannel(scheme.accent.positive)};
    --success-foreground:   ${successFg};
    --warning:              ${hexToHslChannel(scheme.accent.warning)};
    --warning-foreground:   ${warningFg};
    --info:                 ${hexToHslChannel(scheme.accent.info)};
    --info-foreground:      ${primaryFg};
    --border:               ${hexToHslChannel(scheme.border.primary)};
    --input:                ${hexToHslChannel(scheme.border.primary)};
    --ring:                 ${hexToHslChannel(scheme.accent.info)};

    --surface-50:  ${hexToHslChannel(scheme.surface.primary)};
    --surface-100: ${hexToHslChannel(scheme.surface.secondary)};
    --surface-200: ${hexToHslChannel(scheme.surface.tertiary)};
    --surface-300: ${hexToHslChannel(scheme.surface.quaternary)};
    --surface-400: ${hexToHslChannel(scheme.border.secondary)};
    --surface-500: ${hexToHslChannel(scheme.border.primary)};
    --surface-600: ${hexToHslChannel(scheme.text.faint)};
    --surface-700: ${hexToHslChannel(scheme.text.muted)};
    --surface-800: ${hexToHslChannel(scheme.text.secondary)};
    --surface-900: ${hexToHslChannel(scheme.text.primary)};
    --surface-950: ${hexToHslChannel(scheme.surface.ground)};

    /* ── PrimeNG var bridge (for tailwindcss-primeui) ── */
    --p-primary-color:        ${scheme.accent.info};
    --p-primary-color-text:   ${mode === 'dark' ? DARK_PRIMARY_FOREGROUND_HEX : '#ffffff'};
    --p-surface-50:           ${scheme.surface.primary};
    --p-surface-100:          ${scheme.surface.secondary};
    --p-surface-200:          ${scheme.surface.tertiary};
    --p-surface-900:          ${scheme.text.primary};
    --p-surface-950:          ${scheme.surface.ground};
    --p-text-color:           ${scheme.text.primary};
    --p-text-muted-color:     ${scheme.text.muted};
    --p-content-background:   ${scheme.surface.primary};
    --p-content-border-color: ${scheme.border.primary};
    --p-content-color:        ${scheme.text.primary};

    /* ── Typography vars ── */
    --ds-font-sans:  ${typography.fontFamily.sans};
    --ds-font-mono:  ${typography.fontFamily.mono};
    --ds-font-serif: ${typography.fontFamily.serif};
    --ds-radius-sm:  ${radius.sm};
    --ds-radius-md:  ${radius.md};
    --ds-radius-lg:  ${radius.lg};
    --ds-radius-xl:  ${radius.xl};
    --radius:        ${radius.md};

    /* ── Motion vars ── */
    --ds-tx-fast:   ${transition.fast};
    --ds-tx-normal: ${transition.normal};
    --ds-tx-slow:   ${transition.slow};`;
}

function cvdOverride(scheme: ColorScheme): string {
  return `
    --ds-accent-positive:       ${scheme.cvd.buy};
    --ds-accent-positive-hover: ${scheme.cvd.buy};
    --ds-accent-negative:       ${scheme.cvd.sell};
    --ds-accent-negative-hover: ${scheme.cvd.sell};
    --ds-action-buy-bg:         ${scheme.cvd.buy};
    --ds-action-sell-bg:        ${scheme.cvd.sell};
    --success:                  ${hexToHslChannel(scheme.cvd.buy)};
    --destructive:              ${hexToHslChannel(scheme.cvd.sell)};`;
}

export function generateUnifiedCSS(): string {
  return `@layer base {
  :root, [data-theme="dark"] {${dsVars(dark, 'dark')}
  }

  [data-theme="light"] {${dsVars(light, 'light')}
  }

  [data-theme="dark"][data-cvd="on"] {${cvdOverride(dark)}
  }

  [data-theme="light"][data-cvd="on"] {${cvdOverride(light)}
  }
}`;
}
