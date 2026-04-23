// ─── Icon Registry ──────────────────────────────────────────────────
//
// Re-exports from @markets/icons-svg — the single source of truth
// for all market icon SVG strings, metadata, and utilities.

export {
  MARKET_ICON_SVGS,
  svgToDataUrl,
  marketIconToDataUrl,
} from "@markets/icons-svg/all-icons";

export {
  ICON_META,
  ICON_NAMES,
  ICON_CATEGORIES,
  ICON_CATEGORY_NAMES,
  getIconsByCategory,
  type MarketIconName,
  type IconCategory,
  type IconMeta,
} from "@markets/icons-svg";
