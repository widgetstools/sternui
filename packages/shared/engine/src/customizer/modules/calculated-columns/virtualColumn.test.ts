import { describe, expect, it } from 'vitest';
import type { ValueGetterParams } from 'ag-grid-community';
import { ExpressionEngine } from '../../../expression/index.js';
import { buildVirtualColDef } from './virtualColumn.js';

describe('buildVirtualColDef valueGetter — group / footer aggregates', () => {
  const engine = new ExpressionEngine();

  it('returns aggData on group rows even when data is an empty object', () => {
    const def = buildVirtualColDef(
      {
        colId: 'trafficlight',
        headerName: 'Traffic Light',
        expression: 'IFS([midPrice] >= 105, 1, [midPrice] >= 95, 2, 3)',
        cellDataType: 'number',
      },
      engine,
      new WeakMap(),
    );

    const value = def.valueGetter?.({
      data: {},
      node: { group: true, aggData: { trafficlight: 2 } },
      api: {},
    } as unknown as ValueGetterParams);

    expect(value).toBe(2);
  });

  it('returns aggData on footer / grand-total rows', () => {
    const def = buildVirtualColDef(
      {
        colId: 'trafficlight',
        headerName: 'Traffic Light',
        expression: 'IFS([midPrice] >= 105, 1, [midPrice] >= 95, 2, 3)',
        cellDataType: 'number',
      },
      engine,
      new WeakMap(),
    );

    expect(
      def.valueGetter?.({
        data: {},
        node: { footer: true, level: -1, aggData: { trafficlight: 1 } },
        api: {},
      } as unknown as ValueGetterParams),
    ).toBe(1);

    expect(
      def.valueGetter?.({
        data: { trafficlight: 3 },
        node: { group: true, footer: true },
        api: {},
      } as unknown as ValueGetterParams),
    ).toBe(3);
  });

  it('evaluates the leaf expression for normal data rows', () => {
    const def = buildVirtualColDef(
      {
        colId: 'trafficlight',
        headerName: 'Traffic Light',
        expression: 'IFS([midPrice] >= 105, 1, [midPrice] >= 95, 2, 3)',
        cellDataType: 'number',
      },
      engine,
      new WeakMap(),
    );

    expect(
      def.valueGetter?.({
        data: { midPrice: 110 },
        node: { group: false },
        api: {},
      } as unknown as ValueGetterParams),
    ).toBe(1);
  });
});
