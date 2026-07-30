import { createGrid, type ColDef, type GridApi } from 'ag-grid-community';
import {
  defaultVisualExcelFileName,
  type VisualExcelState,
} from '@starui/engine';

export interface VisualExcelExportOptions {
  fileName?: string;
  /** When true, export only selected rows. Default false. */
  onlySelected?: boolean;
  /** Default `filteredAndSorted`. */
  exportedRows?: 'all' | 'filteredAndSorted';
  /** Reported instead of throwing — the caller owns how a failure is surfaced. */
  onError?: (message: string) => void;
}

/** What the Perspective surface puts on the grid `context`. Structural, so this
 *  module takes no dependency on the row engine. */
interface PerspectiveExportContext {
  perspectiveEngineHolder?: {
    get(): { readAllRows(): Promise<Record<string, unknown>[] | null> } | null;
  };
}

/** Export grid data to Excel preserving display formatters and style-rule colours. */
export function exportVisualExcel(
  api: GridApi,
  settings: VisualExcelState['settings'],
  options: VisualExcelExportOptions = {},
): void {
  const fileName = options.fileName
    ?? defaultVisualExcelFileName(settings.fileNamePrefix);

  const excelOptions = {
    fileName,
    author: 'MarketsGrid',
    exportedRows: options.exportedRows ?? ('filteredAndSorted' as const),
    onlySelected: options.onlySelected ?? false,
    processCellCallback: (params: { value: unknown; formatValue(v: unknown): unknown }) =>
      params.formatValue(params.value),
  };

  // Under a SERVER row model, `exportDataAsExcel` can only see the rows in the
  // block cache — a few hundred of a 20,000-row book, with nothing to say the
  // file is short. So the Perspective path reads the book from the Table and
  // exports through a detached grid instead. Selection is the exception: it
  // lives on the row nodes this grid holds, so an only-selected export is
  // already correct and complete here.
  const engine = (api.getGridOption('context') as PerspectiveExportContext | undefined)
    ?.perspectiveEngineHolder?.get();
  if (engine && !excelOptions.onlySelected) {
    void exportViaDetachedGrid(api, engine, excelOptions, options.onError);
    return;
  }

  api.exportDataAsExcel(excelOptions as never);
}

/**
 * Write the file from a throwaway grid holding the whole book.
 *
 * AG's Excel writer is what produces the "visual" part — the formatters, the
 * style-rule colours, the column order — so the export goes through a real grid
 * rather than being hand-rolled. Handing that grid the SAME column defs and
 * column state means the file matches what the user is looking at; the only
 * difference is that this one is client-side and holds every row.
 *
 * The grid is created detached (never inserted into the document) so nothing
 * renders, and destroyed in a `finally` — leaking one would leak the book with
 * it.
 */
async function exportViaDetachedGrid(
  source: GridApi,
  engine: { readAllRows(): Promise<Record<string, unknown>[] | null> },
  excelOptions: Record<string, unknown>,
  onError?: (message: string) => void,
): Promise<void> {
  let rows: Record<string, unknown>[] | null;
  try {
    rows = await engine.readAllRows();
  } catch {
    rows = null;
  }
  if (rows === null) {
    onError?.(
      'Export failed: the book could not be read in full. Narrow the filter and try again.',
    );
    return;
  }

  const host = document.createElement('div');
  let exportApi: GridApi | null = null;
  try {
    exportApi = createGrid(host, {
      columnDefs: source.getColumnDefs() as ColDef[],
      rowData: rows,
      // Never paint: this grid exists only to drive the Excel writer.
      suppressColumnVirtualisation: true,
      animateRows: false,
    } as never);
    // Match what the user sees — order, visibility, widths, sort.
    exportApi.applyColumnState({ state: source.getColumnState(), applyOrder: true });
    exportApi.exportDataAsExcel(excelOptions as never);
  } catch (err) {
    onError?.(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    exportApi?.destroy();
    host.remove();
  }
}
