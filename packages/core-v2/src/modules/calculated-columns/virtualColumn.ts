import type { ColDef, ValueGetterParams, ValueFormatterParams, CellClassParams } from 'ag-grid-community';
import type { ExpressionNode } from '@grid-customizer/core';
import { ExpressionEngine } from '@grid-customizer/core';
import { valueFormatterFromTemplate } from '../column-customization/adapters/valueFormatterFromTemplate';
import { excelFormatColorResolver } from '../column-customization/adapters/excelFormatter';
import type { VirtualColumnDef } from './state';

/**
 * Translate a `VirtualColumnDef` into a ready-to-register AG-Grid `ColDef`.
 *
 * Parses the expression ONCE here — the resulting AST is closed over by the
 * returned `valueGetter`, so per-cell evaluation is just an AST walk. Errors
 * at parse time silently fall back to a `null` AST, which evaluates to null
 * for every row; this avoids crashing the whole grid when one column has a
 * typo. A runtime evaluation failure per row is similarly caught and returned
 * as `null`.
 *
 * Virtual columns are always `editable: false` — the cell's value is derived,
 * so direct edits would be immediately overwritten by the next render.
 *
 * Value formatting dispatches through the shared
 * `valueFormatterFromTemplate` resolver, so every `ValueFormatterTemplate`
 * kind (preset / excelFormat / expression / tick) works uniformly with
 * virtual columns. That's also what the regular
 * column-customization pipeline uses, so a virtual column can carry the
 * same formats a data column can.
 */
export function buildVirtualColDef(v: VirtualColumnDef, engine: ExpressionEngine): ColDef {
  let ast: ExpressionNode | null;
  try {
    ast = engine.parse(v.expression);
  } catch {
    ast = null;
  }

  const formatFn = v.valueFormatterTemplate
    ? valueFormatterFromTemplate(v.valueFormatterTemplate)
    : null;

  // Excel color tags — `[Red]`, `[Green]`, etc. — are parsed by SSF but only
  // affect the returned text, not its color (SSF returns plain strings).
  // Mirror what `column-customization` does for regular columns: when the
  // template is `kind: 'excelFormat'` and contains a color tag, attach a
  // `cellStyle` function that paints the per-value color so formats like
  // `[Green]$#,##0.00;[Red]-$#,##0.00` actually render with colour on the
  // calculated column (e.g. Gross P&L).
  const colorResolver =
    v.valueFormatterTemplate?.kind === 'excelFormat'
      ? excelFormatColorResolver(v.valueFormatterTemplate.format)
      : undefined;

  return {
    colId: v.colId,
    headerName: v.headerName,
    initialWidth: v.initialWidth,
    initialHide: v.initialHide,
    initialPinned: v.initialPinned,
    editable: false,
    sortable: true,
    filter: true,
    valueGetter: (params: ValueGetterParams) => {
      if (!ast || !params.data) return null;
      try {
        return engine.evaluate(ast, {
          x: null,
          value: null,
          data: params.data,
          columns: params.data,
        });
      } catch {
        return null;
      }
    },
    valueFormatter: formatFn
      ? (params: ValueFormatterParams) => formatFn({ value: params.value, data: params.data })
      : undefined,
    cellStyle: colorResolver
      ? (params: CellClassParams) => {
          const color = colorResolver(params.value);
          return color ? { color } : null;
        }
      : undefined,
  };
}
