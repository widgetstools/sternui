import type { SsrmGetRowsRequest } from '../ssrm/types';
import { getSchema } from '../schemaRegistry';

/** Default measure fields that need filtered aggregates for share / class rules. */
export const DEFAULT_AGG_FUNCS = ['sum', 'avg', 'min', 'max', 'count'] as const;

export type AggregateSpec = { field: string; aggFunc: string };

function numericFields(providerId: string): string[] {
  const schema = getSchema(providerId);
  return Object.entries(schema)
    .filter(([, t]) => t === 'integer' || t === 'float')
    .map(([k]) => k);
}

export function collectAggregateSpecs(request: SsrmGetRowsRequest): AggregateSpec[] {
  const byKey = new Map<string, AggregateSpec>();
  const add = (field: string, aggFunc: string) => {
    if (!field) return;
    const func = aggFunc || 'sum';
    byKey.set(`${field}::${func}`, { field, aggFunc: func });
  };

  for (const field of numericFields(request.providerId)) {
    for (const aggFunc of DEFAULT_AGG_FUNCS) {
      add(field, aggFunc);
    }
  }

  for (const col of request.valueCols ?? []) {
    if (!col.field) continue;
    add(col.field, col.aggFunc || 'sum');
    add(col.field, 'sum');
  }

  return [...byKey.values()];
}

export function aggregateAlias(field: string, aggFunc: string): string {
  const safe = aggFunc.replace(/[^a-zA-Z0-9]+/g, '_');
  return `__ssrm_agg_${field}_${safe}`;
}
