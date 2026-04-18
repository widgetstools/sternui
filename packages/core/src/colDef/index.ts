/**
 * Shared colDef-level types + writers. Consumed by column-templates,
 * column-customization, conditional-styling, and column-groups. Keeping
 * them centralised breaks the circular dependency v2 had.
 */
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
  PresetId,
  TickToken,
  ValueFormatterTemplate,
  ColumnDataType,
} from './types';
