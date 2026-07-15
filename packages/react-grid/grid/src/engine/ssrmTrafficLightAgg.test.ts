import { describe, expect, it } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import {
  applySsrmTrafficLightToColumnDefs,
  foldTrafficLightFromAggs,
  isTrafficLightRagCustomAgg,
  normalizeAggExpression,
  resolveSsrmAggFunc,
} from './ssrmTrafficLightAgg.js';

const RECIPE = `IFS(
  MIN([value]) = 1 AND MAX([value]) = 1, 1,
  MIN([value]) = 3 AND MAX([value]) = 3, 3,
  2
)`;

describe('ssrmTrafficLightAgg', () => {
  it('normalizes whitespace in agg expressions', () => {
    expect(normalizeAggExpression(RECIPE)).toBe(
      'IFS(MIN([value])=1ANDMAX([value])=1,1,MIN([value])=3ANDMAX([value])=3,3,2)',
    );
  });

  it('detects documented RAG IFS recipe', () => {
    expect(isTrafficLightRagCustomAgg(RECIPE)).toBe(true);
    expect(isTrafficLightRagCustomAgg('sum([value])')).toBe(false);
    expect(isTrafficLightRagCustomAgg(undefined)).toBe(false);
  });

  it('resolves custom recipe to trafficLight', () => {
    expect(
      resolveSsrmAggFunc({ aggFunc: 'custom', customAggExpression: RECIPE }),
    ).toBe('trafficLight');
    expect(resolveSsrmAggFunc({ aggFunc: 'sum' })).toBe('sum');
    expect(resolveSsrmAggFunc({ aggFunc: 'trafficLight' })).toBe('trafficLight');
    expect(resolveSsrmAggFunc({ aggFunc: 'rag' })).toBe('trafficLight');
  });

  it('folds min/max from __ssrm_aggs when direct value missing', () => {
    expect(
      foldTrafficLightFromAggs('trafficlight', {
        trafficlight: { min: 1, max: 1 },
      }),
    ).toBe(1);
    expect(
      foldTrafficLightFromAggs('trafficlight', {
        trafficlight: { min: 3, max: 3 },
      }),
    ).toBe(3);
    expect(
      foldTrafficLightFromAggs('trafficlight', {
        trafficlight: { min: 1, max: 3 },
      }),
    ).toBe(2);
    expect(foldTrafficLightFromAggs('trafficlight', undefined)).toBe(null);
    expect(foldTrafficLightFromAggs('trafficlight', {})).toBe(null);
  });

  it('maps custom IFS recipe to trafficLight aggFunc on ColDefs', () => {
    const customFn = () => 2;
    const [out] = applySsrmTrafficLightToColumnDefs(
      [{ colId: 'trafficlight', field: 'trafficlight', aggFunc: customFn } as ColDef],
      {
        trafficlight: {
          colId: 'trafficlight',
          rowGrouping: { aggFunc: 'custom', customAggExpression: RECIPE },
        },
      },
    );
    expect(out.aggFunc).toBe('trafficLight');
    expect(typeof out.valueGetter).toBe('function');
  });

  it('leaves non-matching custom agg unchanged', () => {
    const customFn = () => 2;
    const [out] = applySsrmTrafficLightToColumnDefs(
      [{ colId: 'pnl', field: 'pnl', aggFunc: customFn } as ColDef],
      {
        pnl: {
          colId: 'pnl',
          rowGrouping: { aggFunc: 'custom', customAggExpression: 'SUM([value])' },
        },
      },
    );
    expect(out.aggFunc).toBe(customFn);
    expect(out.valueGetter).toBeUndefined();
  });

  it('valueGetter falls back to __ssrm_aggs min/max on group rows', () => {
    const [out] = applySsrmTrafficLightToColumnDefs(
      [{ colId: 'trafficlight', field: 'trafficlight' } as ColDef],
      {
        trafficlight: {
          colId: 'trafficlight',
          rowGrouping: { aggFunc: 'custom', customAggExpression: RECIPE },
        },
      },
    );
    const getter = out.valueGetter as (params: {
      data?: Record<string, unknown>;
      node?: { group?: boolean };
    }) => unknown;
    expect(
      getter({
        data: { __ssrm_aggs: { trafficlight: { min: 1, max: 1 } } },
        node: { group: true },
      }),
    ).toBe(1);
    expect(
      getter({
        data: { trafficlight: 3, __ssrm_aggs: { trafficlight: { min: 1, max: 3 } } },
        node: { group: true },
      }),
    ).toBe(3);
  });
});
