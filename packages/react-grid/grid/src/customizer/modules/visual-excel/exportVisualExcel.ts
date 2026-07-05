import {
  defaultVisualExcelFileName,
  type VisualExcelState,
} from '@starui/engine';
import type { MarketsGridApi } from '@starui/engine';

export interface VisualExcelExportOptions {
  fileName?: string;
  /** When true, export only selected rows. Default false. */
  onlySelected?: boolean;
  /** Default `filteredAndSorted`. */
  exportedRows?: 'all' | 'filteredAndSorted';
}

/** Export grid data to Excel preserving display formatters and style-rule colours. */
export function exportVisualExcel(
  api: MarketsGridApi,
  settings: VisualExcelState['settings'],
  options: VisualExcelExportOptions = {},
): void {
  const fileName = options.fileName
    ?? defaultVisualExcelFileName(settings.fileNamePrefix);

  api.exportDataAsExcel({
    fileName,
    author: 'MarketsGrid',
    exportedRows: options.exportedRows ?? 'filteredAndSorted',
    onlySelected: options.onlySelected ?? false,
    processCellCallback: (params: { value: unknown; formatValue: (v: unknown) => string }) => params.formatValue(params.value),
  });
}
