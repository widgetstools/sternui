// ─────────────────────────────────────────────────────────────
//  FI Design System — Public API
//
//  Usage:
//    import { primitives, semantic, componentTokens } from '@/design-system';
//    import { generateShadcnCSS } from '@/design-system/adapters/shadcn';
//    import { generatePrimeNGPreset } from '@/design-system/adapters/primeng';
//    import { fiGridTheme } from '@/design-system/adapters/ag-grid';
// ─────────────────────────────────────────────────────────────

// Tokens
export { primitives } from './tokens/primitives';
export { colors, typography, spacing, radius, opacity, transition, shadow } from './tokens/primitives';
export { semantic, dark, light, shared } from './tokens/semantic';
export type { ColorScheme } from './tokens/semantic';
export { componentTokens } from './tokens/components';

// Adapters
export { generateShadcnCSS, getShadcnTokens } from './adapters/shadcn';
export { generatePrimeNGPreset } from './adapters/primeng';
export { agGridLightParams, agGridDarkParams } from './adapters/ag-grid';

// Cell Renderers (vanilla TS — framework-agnostic)
export {
  SideCellRenderer, StatusBadgeRenderer, ColoredValueRenderer,
  OasValueRenderer, SignedValueRenderer, TickerCellRenderer,
  RatingBadgeRenderer, PnlValueRenderer, FilledAmountRenderer,
  BookNameRenderer, ChangeValueRenderer, YtdValueRenderer,
  RfqStatusRenderer,
} from './cell-renderers';
