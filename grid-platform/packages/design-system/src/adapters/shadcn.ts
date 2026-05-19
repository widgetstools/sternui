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
//    1. FI Design System · Dark — :root + [data-theme="dark"]
//    2. FI Design System · Light — [data-theme="light"]
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
import { controls } from '../tokens/controls';
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

function schemeVars(scheme: ColorScheme) {
  const s = scheme.shadcn;
  return `
    /* ── shadcn/ui overrides (Stockflux SLATE BLUE) ── */
    --background: ${s.background};
    --foreground: ${s.foreground};
    --card: ${s.card};
    --card-foreground: ${s.cardForeground};
    --popover: ${s.popover};
    --popover-foreground: ${s.popoverForeground};
    --primary: ${s.primary};
    --primary-foreground: ${s.primaryForeground};
    --secondary: ${s.secondary};
    --secondary-foreground: ${s.secondaryForeground};
    --muted: ${s.muted};
    --muted-foreground: ${s.mutedForeground};
    --accent: ${s.accent};
    --accent-foreground: ${s.accentForeground};
    --destructive: ${s.destructive};
    --destructive-foreground: ${s.destructiveForeground};
    --border: ${s.border};
    --input: ${s.input};
    --ring: ${s.ring};
    --radius: ${shared.radius.lg};

    --scrollbar-thumb: ${scheme.scrollbar};`;
}

/** Generate the full CSS block for both themes */
export function generateShadcnCSS(): string {
  return `@layer base {
  :root, [data-theme="dark"] {${schemeVars(dark)}
  }

  [data-theme="light"] {${schemeVars(light)}
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

function stockfluxAliasVars(scheme: ColorScheme): string {
  const h = scheme.surface;
  const t = scheme.text;
  const b = scheme.border;
  const a = scheme.accent;
  return `
    /* ── Stockflux --sf-* aliases (SLATE BLUE) ── */
    --sf-bg:        ${h.ground};
    --sf-bg-1:      ${h.sunken};
    --sf-bg-2:      ${h.primary};
    --sf-bg-3:      ${h.secondary};
    --sf-bg-4:      ${h.tertiary};
    --sf-bg-5:      ${h.quaternary};
    --sf-t-0:       ${t.primary};
    --sf-t-1:       ${t.secondary};
    --sf-t-2:       ${t.muted};
    --sf-t-3:       ${t.faint};
    --sf-t-4:       ${t.disabled};
    --sf-border:    ${b.primary};
    --sf-border-2:  ${b.secondary};
    --sf-border-3:  ${b.tertiary};
    --sf-teal:      ${scheme.primary.display};
    --sf-teal-hi:   ${scheme.primary.highlight};
    --sf-teal-lo:   ${scheme.primary.pressed};
    --sf-teal-soft: ${scheme.primary.soft};
    --sf-teal-ring: ${scheme.primary.ring};
    --sf-up:        ${a.positive};
    --sf-up-hi:     ${a.positiveHover};
    --sf-up-soft:   ${scheme.overlay.positiveSoft};
    --sf-up-strip:  ${scheme.trade.positiveStrip};
    --sf-down:      ${a.negative};
    --sf-down-hi:   ${a.negativeHover};
    --sf-down-soft: ${scheme.overlay.negativeSoft};
    --sf-down-strip:${scheme.trade.negativeStrip};
    --sf-flat:      ${scheme.trade.flat};
    --sf-info:      ${a.info};
    --sf-info-soft: ${scheme.overlay.infoSoft};
    --sf-warn:      ${a.warning};
    --sf-warn-soft: ${scheme.overlay.warningSoft};
    --sf-success:   ${a.positive};
    --sf-error:     ${a.negative};
    --sf-bid-fill:  ${scheme.trade.bidFill};
    --sf-ask-fill:  ${scheme.trade.askFill};
    --sf-scrollbar: ${scheme.scrollbar};`;
}

function dsVars(scheme: ColorScheme, mode: 'dark' | 'light'): string {
  const s = scheme.shadcn;
  const successFg = hexToHslChannel(scheme.action.buyText);
  const warningFg =
    mode === 'dark' ? hexToHslChannel(scheme.text.primary) : '0 0% 100%';

  return `
    /* ── FI Design System source tokens ── */
    --ds-primary:           ${scheme.primary.color};
    --ds-primary-hover:     ${scheme.primary.hover};
    --ds-primary-display:   ${scheme.primary.display};
    --ds-primary-highlight: ${scheme.primary.highlight};
    --ds-primary-pressed:   ${scheme.primary.pressed};
    --ds-primary-foreground:${scheme.primary.foreground};
    --ds-primary-soft:      ${scheme.primary.soft};
    --ds-primary-ring:      ${scheme.primary.ring};

    --ds-surface-ground:     ${scheme.surface.ground};
    --ds-surface-sunken:     ${scheme.surface.sunken};
    --ds-surface-primary:    ${scheme.surface.primary};
    --ds-surface-secondary:  ${scheme.surface.secondary};
    --ds-surface-tertiary:   ${scheme.surface.tertiary};
    --ds-surface-quaternary: ${scheme.surface.quaternary};

    --ds-text-primary:   ${scheme.text.primary};
    --ds-text-secondary: ${scheme.text.secondary};
    --ds-text-muted:     ${scheme.text.muted};
    --ds-text-faint:     ${scheme.text.faint};
    --ds-text-disabled:  ${scheme.text.disabled};

    --ds-border-primary:   ${scheme.border.primary};
    --ds-border-secondary: ${scheme.border.secondary};
    --ds-border-tertiary:  ${scheme.border.tertiary};

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

    --ds-trade-flat:           ${scheme.trade.flat};
    --ds-trade-positive-strip: ${scheme.trade.positiveStrip};
    --ds-trade-negative-strip: ${scheme.trade.negativeStrip};
    --ds-trade-bid-fill:       ${scheme.trade.bidFill};
    --ds-trade-ask-fill:       ${scheme.trade.askFill};

    --ds-chart-1: ${scheme.chart[0]};
    --ds-chart-2: ${scheme.chart[1]};
    --ds-chart-3: ${scheme.chart[2]};
    --ds-chart-4: ${scheme.chart[3]};
    --ds-chart-5: ${scheme.chart[4]};

    /* ── shadcn-compat HSL channel aliases (Stockflux SLATE BLUE) ── */
    --background:             ${s.background};
    --foreground:             ${s.foreground};
    --card:                   ${s.card};
    --card-foreground:        ${s.cardForeground};
    --popover:                ${s.popover};
    --popover-foreground:     ${s.popoverForeground};
    --primary:                ${s.primary};
    --primary-foreground:     ${s.primaryForeground};
    --secondary:              ${s.secondary};
    --secondary-foreground:   ${s.secondaryForeground};
    --muted:                  ${s.muted};
    --muted-foreground:       ${s.mutedForeground};
    --accent:                 ${s.accent};
    --accent-foreground:      ${s.accentForeground};
    --destructive:            ${s.destructive};
    --destructive-foreground: ${s.destructiveForeground};
    --success:                ${hexToHslChannel(scheme.accent.positive)};
    --success-foreground:     ${successFg};
    --warning:                ${hexToHslChannel(scheme.accent.warning)};
    --warning-foreground:     ${warningFg};
    --info:                   ${hexToHslChannel(scheme.accent.info)};
    --info-foreground:        ${s.primaryForeground};
    --border:                 ${s.border};
    --input:                  ${s.input};
    --ring:                   ${s.ring};

    --sidebar-background:              ${s.sidebarBackground};
    --sidebar-foreground:              ${s.sidebarForeground};
    --sidebar-primary:                 ${s.sidebarPrimary};
    --sidebar-primary-foreground:      ${s.sidebarPrimaryForeground};
    --sidebar-accent:                  ${s.sidebarAccent};
    --sidebar-accent-foreground:       ${s.sidebarAccentForeground};
    --sidebar-border:                  ${s.sidebarBorder};
    --sidebar-ring:                    ${s.sidebarRing};

    --chart-1: ${s.chart1};
    --chart-2: ${s.chart2};
    --chart-3: ${s.chart3};
    --chart-4: ${s.chart4};
    --chart-5: ${s.chart5};

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
    --p-primary-color:        ${scheme.primary.color};
    --p-primary-color-text:   ${scheme.primary.foreground};
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
    --ds-font-size-2xs: ${typography.fontSize['2xs']};
    --ds-font-size-xs:  ${typography.fontSize.xs};
    --ds-font-size-sm:  ${typography.fontSize.sm};
    --ds-font-size-md:  ${typography.fontSize.md};
    --ds-font-size-lg:  ${typography.fontSize.lg};
    --ds-font-size-xl:  ${typography.fontSize.xl};
    --ds-font-size-2xl: ${typography.fontSize['2xl']};
    --ds-font-size-3xl: ${typography.fontSize['3xl']};
    --ds-font-size-4xl: ${typography.fontSize['4xl']};
    --ds-font-size-5xl: ${typography.fontSize['5xl']};
    --ds-font-variant-tabular: ${typography.fontVariantNumeric.tabular};
    --ds-radius-sm:   ${radius.sm};
    --ds-radius-md:   ${radius.md};
    --ds-radius-lg:   ${radius.lg};
    --ds-radius-xl:   ${radius.xl};
    --ds-radius-full: ${radius.full};
    --radius:         ${radius.md};

    /* ── Motion vars (Stockflux tokens.css) ── */
    --ds-tx-instant: ${transition.instant};
    --ds-tx-fast:    ${transition.fast};
    --ds-tx-normal:  ${transition.normal};
    --ds-tx-slow:    ${transition.slow};
    --ds-tx-tick:    ${transition.tickFlash};
    --sf-t-instant:  ${transition.instant};
    --sf-t-fast:     ${transition.fast};
    --sf-t-normal:   ${transition.normal};
    --sf-t-slow:     ${transition.slow};
    --sf-t-tick:     ${transition.tickFlash};

    /* ── Control density tiers (compact controls — see tokens/controls.ts) ── */
    --ds-control-xs-height:       ${controls.xs.height};
    --ds-control-xs-padding-x:    ${controls.xs.paddingX};
    --ds-control-xs-gap:          ${controls.xs.gap};
    --ds-control-xs-font-size:    ${controls.xs.fontSize};
    --ds-control-xs-icon-size:    ${controls.xs.iconSize};
    --ds-control-xs-radius:       ${controls.xs.borderRadius};
    --ds-control-sm-height:       ${controls.sm.height};
    --ds-control-sm-padding-x:    ${controls.sm.paddingX};
    --ds-control-sm-gap:          ${controls.sm.gap};
    --ds-control-sm-font-size:    ${controls.sm.fontSize};
    --ds-control-sm-icon-size:    ${controls.sm.iconSize};
    --ds-control-sm-radius:       ${controls.sm.borderRadius};
    --ds-control-md-height:       ${controls.md.height};
    --ds-control-md-padding-x:    ${controls.md.paddingX};
    --ds-control-md-gap:          ${controls.md.gap};
    --ds-control-md-font-size:    ${controls.md.fontSize};
    --ds-control-md-icon-size:    ${controls.md.iconSize};
    --ds-control-md-radius:       ${controls.md.borderRadius};
    --ds-control-lg-height:       ${controls.lg.height};
    --ds-control-lg-padding-x:    ${controls.lg.paddingX};
    --ds-control-lg-gap:          ${controls.lg.gap};
    --ds-control-lg-font-size:    ${controls.lg.fontSize};
    --ds-control-lg-icon-size:    ${controls.lg.iconSize};
    --ds-control-lg-radius:       ${controls.lg.borderRadius};

    /* ── Legacy bn-* / fi-* aliases (apps + cell renderers) ── */
    --bn-bg:        ${scheme.surface.ground};
    --bn-bg-sunken: ${scheme.surface.sunken};
    --bn-bg1:       ${scheme.surface.primary};
    --bn-bg2:       ${scheme.surface.secondary};
    --bn-bg3:       ${scheme.surface.tertiary};
    --bn-bg4:       ${scheme.surface.quaternary};
    --bn-t0:        ${scheme.text.primary};
    --bn-t1:        ${scheme.text.secondary};
    --bn-t2:        ${scheme.text.muted};
    --bn-t3:        ${scheme.text.faint};
    --bn-t4:        ${scheme.text.disabled};
    --bn-border:    ${scheme.border.primary};
    --bn-border2:   ${scheme.border.secondary};
    --bn-border3:   ${scheme.border.tertiary};
    --bn-green:     ${scheme.accent.positive};
    --bn-green2:    ${scheme.accent.positiveHover};
    --bn-red:       ${scheme.accent.negative};
    --bn-red2:      ${scheme.accent.negativeHover};
    --bn-amber:     ${scheme.accent.warning};
    --bn-blue:      ${scheme.primary.color};
    --bn-blue2:     ${scheme.primary.hover};
    --bn-info:      ${scheme.accent.info};
    --bn-cyan:      ${scheme.accent.highlight};
    --bn-purple:    ${scheme.accent.purple};
    --bn-buy-bg:    ${scheme.action.buyBg};
    --bn-sell-bg:   ${scheme.action.sellBg};
    --bn-cta-text:  ${scheme.action.buyText};
    --ob-bid-fill:  ${scheme.trade.bidFill};
    --ob-ask-fill:  ${scheme.trade.askFill};
    --tt-bid-strip: ${scheme.trade.positiveStrip};
    --tt-ask-strip: ${scheme.trade.negativeStrip};
    ${stockfluxAliasVars(scheme)}`;
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
