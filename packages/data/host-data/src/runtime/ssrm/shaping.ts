/**
 * Worker-side row shaping — bakes calculated-column values into the rows
 * a block returns, so the grid's colDef is a plain `{ field }` (no
 * `valueGetter`) and the per-cell expression cost never touches the UI
 * thread.
 *
 * Uses the pure `@starui/engine/worker` slice (expression engine only —
 * no DOM), and evaluates each expression with the SAME context shape the
 * main-thread calculated-columns `valueGetter` uses, so a column means
 * the same thing whether shaped here or computed client-side:
 *   `{ x, value, data: row, columns: row, allRows }`.
 *
 * Because the worker holds the full dataset, `allRows` (used by
 * aggregate expressions like `value / SUM([qty])`) is the filtered set —
 * something the main-thread path can only get via `api.forEachNode()`.
 * See docs/SSRM_WORKER_PLAN.md §5.
 */

import { ExpressionEngine, type ExpressionNode } from '@starui/engine/worker';
import type { SsrmShapingSpec } from './types.js';

/** One engine per worker — its parse cache makes repeated rows cheap. */
const engine = new ExpressionEngine();

type Row = Record<string, unknown>;

/**
 * Apply a {@link SsrmShapingSpec} to a block. Returns NEW row objects
 * (the cache rows are never mutated) with each calc column written as a
 * real field. Parse/eval errors fall back to `null` for that cell rather
 * than failing the whole block.
 */
export function shapeRows(
  block: readonly unknown[],
  spec: SsrmShapingSpec,
  allFiltered: readonly unknown[],
): unknown[] {
  const calcColumns = spec.calcColumns ?? [];
  if (calcColumns.length === 0) return block as unknown[];

  // Parse once per block (cached across blocks by the engine too).
  const compiled = calcColumns.map((c) => {
    let ast: ExpressionNode | null;
    try {
      ast = engine.parse(c.expression);
    } catch {
      ast = null;
    }
    return { field: c.field, ast };
  });

  const allRows = allFiltered as ReadonlyArray<Row>;

  return (block as ReadonlyArray<Row>).map((row) => {
    const out: Row = { ...row };
    for (const { field, ast } of compiled) {
      if (!ast) {
        out[field] = null;
        continue;
      }
      try {
        out[field] = engine.evaluate(ast, {
          x: null,
          value: null,
          data: row,
          columns: row,
          allRows,
        });
      } catch {
        out[field] = null;
      }
    }
    return out;
  });
}
