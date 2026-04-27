/**
 * columnRegistry — single source of truth for the AG-Grid value
 * formatter + cell renderer ids that DataProvider configurators offer
 * users when they build a column definition from inferred fields.
 *
 * Why centralise: today the React configurator's `useColumnConfig` and
 * the Angular configurator's column-build path both hardcode the same
 * lookup table (`'2DecimalWithThousandSeparator'` for numbers,
 * `'NumericCellRenderer'` for numerics, `'YYYY-MM-DD HH:mm:ss'` for
 * dates). Drift between the two is a known awkwardness; this module
 * is the canonical place to add / rename / remove.
 *
 * The strings here are AG-Grid registration keys. The actual formatter
 * + renderer functions are registered with AG-Grid by the consuming
 * grid host (MarketsGrid registers them via its valueFormatters /
 * components props). The configurator only needs to know the *menu*
 * of choices for the dropdowns.
 */

import type { ColumnDefinition } from '@marketsui/shared-types';

/** Cell-data type categories supported by the configurator. */
export type CellDataType = NonNullable<ColumnDefinition['cellDataType']>;

/**
 * A formatter the user can pick for a column. The `appliesTo` array
 * tells the configurator UI which cellDataTypes this formatter is
 * sensible for, so we can hide irrelevant choices in the dropdown.
 */
export interface FormatterOption {
  /** AG-Grid registration key — what we write into `column.valueFormatter`. */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** Free-text hint shown in the picker. Optional. */
  description?: string;
  /** Cell types this formatter applies to. */
  appliesTo: CellDataType[];
}

/**
 * A cell renderer the user can pick. Same shape as FormatterOption.
 */
export interface CellRendererOption {
  id: string;
  label: string;
  description?: string;
  appliesTo: CellDataType[];
}

// ─── Formatters ───────────────────────────────────────────────────────

export const FORMATTERS: FormatterOption[] = [
  {
    id: '2DecimalWithThousandSeparator',
    label: 'Number — 2 decimals + thousands',
    description: 'e.g. 1,234.56',
    appliesTo: ['number'],
  },
  {
    id: '4DecimalWithThousandSeparator',
    label: 'Number — 4 decimals + thousands',
    description: 'e.g. 1,234.5678',
    appliesTo: ['number'],
  },
  {
    id: 'IntegerWithThousandSeparator',
    label: 'Integer — thousands',
    description: 'e.g. 1,234',
    appliesTo: ['number'],
  },
  {
    id: 'Percent2Decimal',
    label: 'Percent — 2 decimals',
    description: 'e.g. 12.34%',
    appliesTo: ['number'],
  },
  {
    id: 'CurrencyUSD',
    label: 'Currency — USD',
    description: 'e.g. $1,234.56',
    appliesTo: ['number'],
  },
  {
    id: 'YYYY-MM-DD',
    label: 'Date — ISO short',
    description: 'e.g. 2026-04-26',
    appliesTo: ['date', 'dateString'],
  },
  {
    id: 'YYYY-MM-DD HH:mm:ss',
    label: 'Datetime — ISO',
    description: 'e.g. 2026-04-26 14:30:00',
    appliesTo: ['date', 'dateString'],
  },
  {
    id: 'TimeAgo',
    label: 'Date — time ago',
    description: 'e.g. "5 minutes ago"',
    appliesTo: ['date', 'dateString'],
  },
];

// ─── Cell renderers ───────────────────────────────────────────────────

export const CELL_RENDERERS: CellRendererOption[] = [
  {
    id: 'NumericCellRenderer',
    label: 'Numeric — coloured ± with arrow',
    description: 'Green/red on positive/negative; subtle arrow glyph',
    appliesTo: ['number'],
  },
  {
    id: 'StatusBadgeCellRenderer',
    label: 'Status badge',
    description: 'Pill-shaped chip; respects design-system status colours',
    appliesTo: ['text'],
  },
  {
    id: 'BooleanIconCellRenderer',
    label: 'Boolean icon',
    description: 'Check / cross icon instead of literal true/false',
    appliesTo: ['boolean'],
  },
  {
    id: 'BarSparklineCellRenderer',
    label: 'Sparkline — bar',
    description: 'Inline bar from a numeric array',
    appliesTo: ['object'],
  },
  {
    id: 'LineSparklineCellRenderer',
    label: 'Sparkline — line',
    description: 'Inline line from a numeric array',
    appliesTo: ['object'],
  },
];

// ─── Defaults by cell type ────────────────────────────────────────────
// Used when a user picks a field for the first time and no override is
// set. Keep in sync with the buildColumnsFromFields helper in
// useColumnConfig (which currently inlines these — Phase B refactors
// it to read from this registry).

export const DEFAULT_FORMATTER_BY_TYPE: Partial<Record<CellDataType, string>> = {
  number: '2DecimalWithThousandSeparator',
  date: 'YYYY-MM-DD HH:mm:ss',
  dateString: 'YYYY-MM-DD HH:mm:ss',
};

export const DEFAULT_RENDERER_BY_TYPE: Partial<Record<CellDataType, string>> = {
  number: 'NumericCellRenderer',
};

// ─── Helpers ──────────────────────────────────────────────────────────

export function formattersFor(type: CellDataType): FormatterOption[] {
  return FORMATTERS.filter((f) => f.appliesTo.includes(type));
}

export function renderersFor(type: CellDataType): CellRendererOption[] {
  return CELL_RENDERERS.filter((r) => r.appliesTo.includes(type));
}

/**
 * Default column shape for a newly-selected field of the given cell
 * type. Used by the Columns tab when a user toggles a field on.
 * Returns just the type-driven slots; caller layers in field, headerName.
 */
export function defaultColumnFor(type: CellDataType): Partial<ColumnDefinition> {
  const out: Partial<ColumnDefinition> = { cellDataType: type };
  const formatter = DEFAULT_FORMATTER_BY_TYPE[type];
  const renderer = DEFAULT_RENDERER_BY_TYPE[type];
  if (formatter) out.valueFormatter = formatter;
  if (renderer) out.cellRenderer = renderer;
  if (type === 'number') {
    out.type = 'numericColumn';
    out.filter = 'agNumberColumnFilter';
  } else if (type === 'date' || type === 'dateString') {
    out.filter = 'agDateColumnFilter';
  }
  return out;
}
