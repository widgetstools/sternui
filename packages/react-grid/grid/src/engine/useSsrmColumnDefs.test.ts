import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePerspectiveCalcColumns } from './useSsrmColumnDefs.js';
import { CALCULATED_COLUMNS_MODULE_ID } from '../customizer/modules/calculated-columns/index.js';

/** A platform whose store returns one calculated-columns module state. */
function makePlatform(virtualColumns: { colId: string; expression: string }[]) {
  return {
    store: {
      getModuleState: (id: string) =>
        id === CALCULATED_COLUMNS_MODULE_ID ? { virtualColumns } : undefined,
    },
  } as never;
}

const BASE_DEFS = [{ field: 'price' }, { field: 'quantity' }];

describe('usePerspectiveCalcColumns', () => {
  it('compiles a calculated column into a Perspective expression', () => {
    // Without this the pull path had no calculated columns at all: the planner
    // ran only when `useSSRM` was true.
    const { result } = renderHook(() =>
      usePerspectiveCalcColumns(
        makePlatform([{ colId: 'grossPnl', expression: '[price] * [quantity]' }]),
        BASE_DEFS,
        true,
      ),
    );

    expect(result.current.expressions.grossPnl).toContain('"price"');
    expect(result.current.expressions.grossPnl).toContain('"quantity"');
  });

  it('gives the column a field so AG renders the worker-computed value', () => {
    const { result } = renderHook(() =>
      usePerspectiveCalcColumns(
        makePlatform([{ colId: 'grossPnl', expression: '[price] * [quantity]' }]),
        [...BASE_DEFS, { field: 'grossPnl', valueGetter: () => 1 }] as never,
        true,
      ),
    );

    const def = result.current.defs.find((d) => d.field === 'grossPnl')!;
    expect(def).toBeDefined();
    // The client valueGetter must go, or AG recomputes what the worker sent.
    expect(def.valueGetter).toBeUndefined();
  });

  it('omits a column that cannot be compiled to an expression', () => {
    // `.old`/`.new` refs need a client pass over whole rows, and this window
    // holds only the blocks in view — so it stays a client column rather than
    // becoming a broken server one.
    const { result } = renderHook(() =>
      usePerspectiveCalcColumns(
        makePlatform([{ colId: 'pnlDelta', expression: '[pnl.new] - [pnl.old]' }]),
        BASE_DEFS,
        true,
      ),
    );

    expect(result.current.expressions.pnlDelta).toBeUndefined();
  });

  it('does nothing at all when disabled', () => {
    const defs = BASE_DEFS;
    const { result } = renderHook(() =>
      usePerspectiveCalcColumns(
        makePlatform([{ colId: 'grossPnl', expression: '[price] * [quantity]' }]),
        defs,
        false,
      ),
    );

    expect(result.current.defs).toBe(defs);
    expect(result.current.expressions).toEqual({});
  });

  it('is empty when no calculated columns are defined', () => {
    const { result } = renderHook(() =>
      usePerspectiveCalcColumns(makePlatform([]), BASE_DEFS, true),
    );
    expect(result.current.expressions).toEqual({});
  });
});
