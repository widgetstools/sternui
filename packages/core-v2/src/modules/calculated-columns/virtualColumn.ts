import type { ColDef, ValueGetterParams, ValueFormatterParams } from 'ag-grid-community';
import type { ExpressionNode } from '@grid-customizer/core';
import { ExpressionEngine } from '@grid-customizer/core';
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
 */
export function buildVirtualColDef(v: VirtualColumnDef, engine: ExpressionEngine): ColDef {
  let ast: ExpressionNode | null;
  try {
    ast = engine.parse(v.expression);
  } catch {
    ast = null;
  }

  let formatAst: ExpressionNode | null = null;
  if (v.valueFormatterTemplate) {
    try { formatAst = engine.parse(v.valueFormatterTemplate); }
    catch { formatAst = null; }
  }

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
    valueFormatter: formatAst
      ? (params: ValueFormatterParams) => {
          try {
            const out = engine.evaluate(formatAst!, {
              x: params.value,
              value: params.value,
              data: params.data ?? {},
              columns: params.data ?? {},
            });
            return out == null ? '' : String(out);
          } catch {
            return params.value == null ? '' : String(params.value);
          }
        }
      : undefined,
  };
}
