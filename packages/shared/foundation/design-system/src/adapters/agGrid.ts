// ─────────────────────────────────────────────────────────────
//  FI Design System — AG Grid Adapter
//  Exports raw param objects for light and dark modes.
//  Each app wraps them with themeQuartz.withParams() locally
//  (avoids importing ag-grid-community from the design system).
// ─────────────────────────────────────────────────────────────

import { dark, light, shared } from '../tokens/semantic';

// Note: AG-Grid v35 uses `headerTextColor` (not `headerForegroundColor`) and
// has no `rowBorderColor` equivalent — those were renamed/removed between
// v31 and v35. Keeping the adapter aligned with what the installed grid
// actually accepts.
export const agGridLightParams: Record<string, unknown> = {
  backgroundColor:            light.surface.primary,
  foregroundColor:            light.text.primary,
  headerBackgroundColor:      light.surface.secondary,
  headerTextColor:            light.text.secondary,
  oddRowBackgroundColor:      light.surface.ground,
  rowHoverColor:              light.surface.secondary,
  selectedRowBackgroundColor: light.overlay.infoSoft,
  borderColor:                light.border.primary,
  fontFamily:                 shared.typography.fontFamily.mono,
  fontSize:                   parseInt(shared.typography.fontSize.sm),
  headerFontSize:             parseInt(shared.typography.fontSize.xs) + 1,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:              false,
  columnBorder:               false,
};

export const agGridDarkParams: Record<string, unknown> = {
  backgroundColor:            dark.surface.primary,
  foregroundColor:            dark.text.primary,
  headerBackgroundColor:      dark.surface.secondary,
  headerTextColor:            dark.text.secondary,
  oddRowBackgroundColor:      dark.surface.primary,
  rowHoverColor:              dark.surface.secondary,
  selectedRowBackgroundColor: dark.overlay.infoSoft,
  borderColor:                dark.border.primary,
  fontFamily:                 shared.typography.fontFamily.mono,
  fontSize:                   parseInt(shared.typography.fontSize.sm),
  headerFontSize:             parseInt(shared.typography.fontSize.xs) + 1,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:              false,
  columnBorder:               false,
};

// ─── Blotter preset ────────────────────────────────────────────
//
// Trading-blotter variant of the base preset. Distinct visual
// identity: TEAL row selection (matches the buy/positive accent),
// column borders ON, slightly tighter spacing, no rounded corners,
// 10px header font, 11px body font.
//
// This is the canonical theme for `<HostedMarketsGrid>` and any
// other blotter-style grid. Consumers wrap it once with
// `themeQuartz.withParams(...)`. Update colors / spacing here and
// every blotter picks the change up — no per-grid overrides.

const blotterSharedParams = {
  fontFamily:                 shared.typography.fontFamily.mono,
  fontSize:                   11,
  headerFontSize:             10,
  iconSize:                   10,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:              false,
  columnBorder:               true,
  spacing:                    6,
  borderRadius:               0,
  wrapperBorderRadius:        0,
};

export const agGridBlotterDarkParams: Record<string, unknown> = {
  ...blotterSharedParams,
  backgroundColor:            '#161a1e',
  foregroundColor:            '#eaecef',
  headerBackgroundColor:      '#1e2329',
  headerTextColor:            '#a0a8b4',
  oddRowBackgroundColor:      '#161a1e',
  rowHoverColor:              '#1e2329',
  selectedRowBackgroundColor: '#14b8a614',  // teal-500 @ ~8% — matches buy/positive accent
  borderColor:                '#313944',
};

export const agGridBlotterLightParams: Record<string, unknown> = {
  ...blotterSharedParams,
  backgroundColor:            '#ffffff',
  foregroundColor:            '#3b3b3b',
  headerBackgroundColor:      '#f3f3f3',
  headerTextColor:            '#616161',
  oddRowBackgroundColor:      '#fafafa',
  rowHoverColor:              '#f3f3f3',
  selectedRowBackgroundColor: '#0d948814',  // teal-600 @ ~8%
  borderColor:                '#e5e5e5',
};
