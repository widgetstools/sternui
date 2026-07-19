import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { foldTrafficLight } from '@wellsfargo-starui/ssrm-grid/aggregations';

/** Canonical RAG IFS group roll-up recipe (whitespace-stripped). */
const TRAFFIC_LIGHT_RAG_PATTERN =
  'IFS(MIN([value])=1ANDMAX([value])=1,1,MIN([value])=3ANDMAX([value])=3,3,2)';

export function normalizeAggExpression(expr: string): string {
  return expr.replace(/\s+/g, '');
}

export function isTrafficLightRagCustomAgg(expr: string | undefined): boolean {
  if (!expr?.trim()) return false;
  // Uppercase keywords only — `[value]` must stay lowercase per the recipe.
  const norm = normalizeAggExpression(expr)
    .toUpperCase()
    .replace(/\[VALUE\]/g, '[value]');
  return norm === TRAFFIC_LIGHT_RAG_PATTERN;
}

export function resolveSsrmAggFunc(cfg: {
  aggFunc?: string;
  customAggExpression?: string;
}): string | undefined {
  if (cfg.aggFunc === 'trafficLight' || cfg.aggFunc === 'rag') {
    return 'trafficLight';
  }
  if (cfg.aggFunc === 'custom' && isTrafficLightRagCustomAgg(cfg.customAggExpression)) {
    return 'trafficLight';
  }
  return cfg.aggFunc;
}

export function foldTrafficLightFromAggs(
  field: string,
  aggregates: Record<string, Record<string, unknown>> | undefined,
): number | null {
  const bucket = aggregates?.[field];
  if (!bucket) return null;
  return foldTrafficLight(bucket.min, bucket.max);
}

/** Register on AgGridReact so Values panel keeps `trafficLight` / `rag`. */
export function trafficLightClientAggFunc(params: { values: unknown[] }): number | null {
  const nums = params.values
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n): n is number => Number.isFinite(n));
  if (nums.length === 0) return null;
  return foldTrafficLight(Math.min(...nums), Math.max(...nums));
}

export const TRAFFIC_LIGHT_AGG_FUNCS = {
  trafficLight: trafficLightClientAggFunc,
  rag: trafficLightClientAggFunc,
} as const;

type AssignmentLike = {
  colId: string;
  rowGrouping?: {
    aggFunc?: string;
    customAggExpression?: string;
  };
};

function fieldKey(colDef: ColDef): string | undefined {
  return colDef.colId ?? colDef.field ?? undefined;
}

function buildTrafficLightValueGetter(field: string) {
  return (params: ValueGetterParams): unknown => {
    const data = params.data as Record<string, unknown> | undefined;
    if (!data) return undefined;
    const direct = data[field];
    if (direct != null && direct !== '') return direct;
    if (!params.node?.group) return direct;
    const aggs = data.__ssrm_aggs;
    if (!aggs || typeof aggs !== 'object') return direct;
    return foldTrafficLightFromAggs(
      field,
      aggs as Record<string, Record<string, unknown>>,
    );
  };
}

function applyToColDef(colDef: ColDef, assignment: AssignmentLike | undefined): ColDef {
  const rg = assignment?.rowGrouping;
  if (!rg) return colDef;

  const resolved = resolveSsrmAggFunc(rg);
  if (resolved !== 'trafficLight') return colDef;

  const field = fieldKey(colDef) ?? assignment?.colId;
  if (!field) return { ...colDef, aggFunc: 'trafficLight' };

  return {
    ...colDef,
    aggFunc: 'trafficLight',
    // Keep the name in the Columns → Values panel (unknown names fall back to avg/sum).
    defaultAggFunc: 'trafficLight',
    valueGetter: buildTrafficLightValueGetter(field),
  };
}

/**
 * SSRM-only ColDef prep: map documented RAG IFS custom agg to named
 * `trafficLight` and attach a thin client fallback valueGetter for
 * legacy layouts that still store the IFS string.
 */
export function applySsrmTrafficLightToColumnDefs<T extends ColDef>(
  defs: readonly T[],
  assignments: Record<string, AssignmentLike | undefined> | undefined,
): T[] {
  if (!assignments || Object.keys(assignments).length === 0) return [...defs];

  return defs.map((def) => {
    const key = fieldKey(def);
    const assignment = key ? assignments[key] : undefined;
    const next = applyToColDef(def, assignment);
    const children = (def as ColDef & { children?: T[] }).children;
    if (children?.length) {
      return {
        ...next,
        children: applySsrmTrafficLightToColumnDefs(children, assignments),
      } as unknown as T;
    }
    return next as T;
  });
}
