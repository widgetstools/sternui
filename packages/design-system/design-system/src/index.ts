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
  STOCKFLUX_PALETTES,
  STOCKFLUX_PALETTE_NAMES,
  DEFAULT_STOCKFLUX_PALETTE,
  getStockfluxPack,
  isStockfluxPaletteName,
  schemesByPalette,
  getColorScheme,
  type StockfluxPaletteName,
} from './tokens';
export { buildAgGridParams, buildAgGridTheme, type AgGridThemeOptions } from './adapters/agGrid';
export {
  readDocumentThemeMode,
  readStockfluxPalette,
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
