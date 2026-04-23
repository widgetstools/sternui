// ─────────────────────────────────────────────────────────────
//  FI Design System — shadcn/ui Adapter
//  Generates CSS custom property declarations for :root,
//  [data-theme="dark"], and [data-theme="light"].
//  Drop this output into your globals.css / index.css.
// ─────────────────────────────────────────────────────────────

import { dark, light, shared } from '../tokens/semantic';
import type { ColorScheme } from '../tokens/semantic';

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

function schemeVars(scheme: ColorScheme, _mode: 'dark'|'light') {
  return `
    /* ── shadcn/ui overrides ── */
    --background: ${hexToHsl(scheme.surface.ground)};
    --foreground: ${hexToHsl(scheme.text.primary)};
    --card: ${hexToHsl(scheme.surface.primary)};
    --card-foreground: ${hexToHsl(scheme.text.primary)};
    --popover: ${hexToHsl(scheme.surface.primary)};
    --popover-foreground: ${hexToHsl(scheme.text.primary)};
    --primary: ${hexToHsl(scheme.accent.info)};
    --primary-foreground: 0 0% 100%;
    --secondary: ${hexToHsl(scheme.surface.tertiary)};
    --secondary-foreground: ${hexToHsl(scheme.text.secondary)};
    --muted: ${hexToHsl(scheme.surface.secondary)};
    --muted-foreground: ${hexToHsl(scheme.text.muted)};
    --accent: ${hexToHsl(scheme.surface.tertiary)};
    --accent-foreground: ${hexToHsl(scheme.text.primary)};
    --destructive: ${hexToHsl(scheme.accent.negative)};
    --destructive-foreground: 0 0% 100%;
    --border: ${hexToHsl(scheme.border.primary)};
    --input: ${hexToHsl(scheme.border.primary)};
    --ring: ${hexToHsl(scheme.accent.info)};
    --radius: ${shared.radius.lg};

    /* ── FI Design System tokens ── */
    --bn-bg:      ${scheme.surface.ground};
    --bn-bg1:     ${scheme.surface.primary};
    --bn-bg2:     ${scheme.surface.secondary};
    --bn-bg3:     ${scheme.surface.tertiary};
    --bn-border:  ${scheme.border.primary};
    --bn-border2: ${scheme.border.secondary};
    --bn-t0:      ${scheme.text.primary};
    --bn-t1:      ${scheme.text.secondary};
    --bn-t2:      ${scheme.text.muted};
    --bn-t3:      ${scheme.text.faint};
    --bn-green:   ${scheme.accent.positive};
    --bn-green2:  ${scheme.accent.positiveHover};
    --bn-red:     ${scheme.accent.negative};
    --bn-red2:    ${scheme.accent.negativeHover};
    --bn-amber:   ${scheme.accent.warning};
    --bn-blue:    ${scheme.accent.info};
    --bn-blue2:   ${scheme.accent.infoHover};
    --bn-cyan:    ${scheme.accent.highlight};
    --bn-purple:  ${scheme.accent.purple};
    --bn-buy-bg:  ${scheme.action.buyBg};
    --bn-sell-bg: ${scheme.action.sellBg};
    --bn-cta-text: #ffffff;
    --bn-logo-bg: ${scheme.surface.ground};
    --scrollbar-thumb: ${scheme.scrollbar};

    /* ── Interactive states ── */
    --bn-focus-ring:    ${scheme.state.focusRing};
    --bn-focus-ring-bg: ${scheme.state.focusRingBg};
    --bn-disabled-bg:   ${scheme.state.disabledBg};
    --bn-disabled-fg:   ${scheme.state.disabledFg};
    --bn-hover-overlay: ${scheme.state.hoverOverlay};

    /* ── Overlay tints ── */
    --bn-positive-soft: ${scheme.overlay.positiveSoft};
    --bn-positive-ring: ${scheme.overlay.positiveRing};
    --bn-negative-soft: ${scheme.overlay.negativeSoft};
    --bn-negative-ring: ${scheme.overlay.negativeRing};
    --bn-warning-soft:  ${scheme.overlay.warningSoft};
    --bn-warning-ring:  ${scheme.overlay.warningRing};
    --bn-info-soft:     ${scheme.overlay.infoSoft};
    --bn-info-ring:     ${scheme.overlay.infoRing};
    --bn-neutral-soft:  ${scheme.overlay.neutralSoft};
    --bn-neutral-ring:  ${scheme.overlay.neutralRing};

    /* ── Typography ── */
    --fi-mono: ${shared.typography.fontFamily.mono};
    --fi-sans: ${shared.typography.fontFamily.sans};
    --fi-font-xs: ${shared.typography.fontSize.xs};
    --fi-font-sm: ${shared.typography.fontSize.sm};
    --fi-font-md: ${shared.typography.fontSize.md};
    --fi-font-lg: ${shared.typography.fontSize.lg};

    /* ── Legacy aliases ── */
    --fi-bg0: var(--bn-bg);
    --fi-bg1: var(--bn-bg1);
    --fi-bg2: var(--bn-bg2);
    --fi-bg3: var(--bn-bg3);
    --fi-bg4: var(--bn-bg3);
    --fi-border: var(--bn-border);
    --fi-border2: var(--bn-border2);
    --fi-border3: var(--bn-border2);
    --fi-t0: var(--bn-t0);
    --fi-t1: var(--bn-t1);
    --fi-t2: var(--bn-t2);
    --fi-t3: var(--bn-t3);
    --fi-green: var(--bn-green);
    --fi-red: var(--bn-red);
    --fi-blue: var(--bn-blue);
    --fi-amber: var(--bn-amber);
    --fi-yellow: var(--bn-amber);
    --bn-yellow: var(--bn-amber);
    --fi-cyan: var(--bn-cyan);
    --fi-purple: var(--bn-purple);
    --fi-title: var(--bn-t0);
    --fi-col-header: var(--bn-t1);
    --divider: 1px solid var(--bn-border);`;
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
