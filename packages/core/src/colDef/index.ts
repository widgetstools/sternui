/**
 * Shared colDef-level types + writers. Consumed by column-templates,
 * column-customization, conditional-styling, and column-groups. Keeping
 * them centralised breaks the circular dependency v2 had.
 */
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
  ColumnDataType,
  PresetId,
  TickToken,
  ValueFormatterTemplate,
} from './types';

// ─── Writers / adapters ─────────────────────────────────────────────────────
export {
  cellStyleToAgStyle,
  type AgGridStyle,
} from './adapters/cellStyleToAgStyle';
export {
  valueFormatterFromTemplate,
  type Formatter,
  type FormatterParams,
} from './adapters/valueFormatterFromTemplate';
export {
  excelFormatter,
  excelFormatColorResolver,
  isValidExcelFormat,
} from './adapters/excelFormatter';
export { tickFormatter } from './adapters/tickFormatter';
export { presetToExcelFormat } from './adapters/presetToExcelFormat';
