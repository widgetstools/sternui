// ─────────────────────────────────────────────────────────────
//  @starui/design-system — Public API
//
//  Subpath imports for direct adapter access:
//    @starui/design-system/tailwind  → tailwindPreset
//    @starui/design-system/primeng   → primengPreset
//    @starui/design-system/css       → bundled stylesheet (theme + scrollbar + base)
//
//  Root import for tokens + helpers:
//    import { dark, light, componentTokens, applyTheme } from '@starui/design-system';
// ─────────────────────────────────────────────────────────────

export * from './tokens';
export * from './adapters';
export {
  applyTheme,
  getTheme,
  PALETTE_STORAGE_KEY,
  type ThemeOptions,
  type Mode,
} from './applyTheme';
export {
  STARUI_PALETTES,
  STARUI_PALETTE_NAMES,
  DEFAULT_STARUI_PALETTE,
  getStarUIPack,
  isStarUIPaletteName,
  schemesByPalette,
  getColorScheme,
  type StarUIPaletteName,
} from './tokens';
export { buildAgGridParams, buildAgGridTheme, type AgGridThemeOptions } from './adapters/agGrid';
export {
  readDocumentThemeMode,
  readStarUIPalette,
  readHostAppearance,
  type HostAppearance,
  type HostThemeMode,
} from './readHostAppearance';
export {
  SideCellRenderer, StatusBadgeRenderer, ColoredValueRenderer,
  OasValueRenderer, SignedValueRenderer, TickerCellRenderer,
  RatingBadgeRenderer, PnlValueRenderer, FilledAmountRenderer,
  BookNameRenderer, ChangeValueRenderer, YtdValueRenderer,
  RfqStatusRenderer,
} from './cellRenderers';

/** @deprecated Use StarUI-named exports (`STARUI_PALETTES`, `readStarUIPalette`, etc.) */
export {
  DEFAULT_STARUI_PALETTE as DEFAULT_STOCKFLUX_PALETTE,
  STARUI_PALETTE_NAMES as STOCKFLUX_PALETTE_NAMES,
  STARUI_PALETTES as STOCKFLUX_PALETTES,
  getStarUIPack as getStockfluxPack,
  isStarUIPaletteName as isStockfluxPaletteName,
} from './tokens';
export type {
  StarUIPaletteName as StockfluxPaletteName,
  StarUIPalettePack as StockfluxPalettePack,
} from './tokens';
export { readStarUIPalette as readStockfluxPalette } from './readHostAppearance';
