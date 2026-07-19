import { shareOfAggregate } from '@wellsfargo-starui/ssrm-grid/aggregations';

export type SsrmShareOfTotalParams = {
  value: unknown;
  field: string;
  data?: Record<string, unknown>;
  context?: {
    aggregates?: Record<string, Record<string, unknown>>;
    totals?: Record<string, unknown>;
  };
  aggFunc?: string;
};

/**
 * SSRM share-of-total / share-of-aggregate using row `__ssrm_aggs` or
 * grid context aggregates — no full-book forEachNode scans.
 */
export function getSsrmShareOfTotal(params: SsrmShareOfTotalParams): number | null {
  const { value, field, data, context, aggFunc = 'sum' } = params;
  return shareOfAggregate(value, field, aggFunc, data, context);
}
