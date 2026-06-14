/**
 * Types for the field-format catalog — a curated repository of field names
 * used across fixed-income / equity trading systems, mapped to the format,
 * alignment and (theme-safe) semantic colour they are conventionally shown
 * with. Consumed by {@link matchFieldToCatalog} and
 * {@link buildAutoFormatPlan} to drive the toolbar's "Auto Format" action.
 *
 * Colours are delivered through existing zero-config cell renderers (which
 * resolve their own dark/light palette) rather than hard-coded hex, so the
 * catalog never violates the design-system no-hex rule.
 */
import type { ValueFormatterTemplate } from '../types.js';

/**
 * The zero-config cell renderers the catalog assigns for semantic colour.
 * Kept as a local string-literal union (NOT imported from
 * `@starui/design-system`) so the engine stays decoupled from the
 * design-system catalogue — the ids still match `CellRendererId` there.
 */
export type AutoFormatRendererId =
  | 'pnl-value'
  | 'signed-value'
  | 'change-value'
  | 'side'
  | 'status-badge'
  | 'rfq-status'
  | 'rating-badge'
  | 'ticker';

export type AutoFormatAlignment = 'left' | 'center' | 'right';

/**
 * A resolved bundle of formatting to apply to a single column. Produced by
 * the matcher; consumed by `applyAutoFormatPlanReducer`. Every field is
 * optional so an entry can set only what it needs (e.g. a categorical field
 * sets just `cellRendererId`).
 */
export interface AutoFormatAssignment {
  valueFormatterTemplate?: ValueFormatterTemplate;
  alignment?: AutoFormatAlignment;
  cellRendererId?: AutoFormatRendererId;
  /** Reserved for configurable renderers; unused by the curated catalog. */
  cellRendererConfig?: unknown;
  headerName?: string;
}

/**
 * One catalog entry. A column matches an entry when its (normalised) field
 * name equals one of `aliases`, or ends with one of `suffixes` (matching the
 * "last element of the field name" — e.g. `bidPrice` → `price`). Exact alias
 * matches outrank suffix matches; among suffix matches the longest wins.
 */
export interface FieldFormatEntry {
  id: string;
  /** Grouping label (documentation only — not used for matching). */
  category: string;
  /** Exact field-name aliases (normalised, case-insensitive). */
  aliases?: readonly string[];
  /** Trailing tokens matched against the field's last element. */
  suffixes?: readonly string[];
  format?: ValueFormatterTemplate;
  alignment?: AutoFormatAlignment;
  cellRendererId?: AutoFormatRendererId;
  headerName?: string;
}

/** Minimal column descriptor consumed by {@link buildAutoFormatPlan}. */
export interface AutoFormatColumn {
  colId: string;
  field?: string;
  headerName?: string;
  /** AG-Grid `cellDataType` — drives the generic fallback when unmatched. */
  cellDataType?: string;
}
