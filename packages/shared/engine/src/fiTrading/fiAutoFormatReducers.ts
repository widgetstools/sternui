import type { ColumnAssignment, ColumnCustomizationState } from '../customizer/modules/column-customization/state.js';
import {
  INITIAL_CONDITIONAL_STYLING,
  type ConditionalStylingState,
} from '../customizer/modules/conditional-styling/state.js';
import { buildFiAutoFormatAssignments } from './fiAutoFormat.js';
import {
  buildFiConditionalStylingRules,
  FI_STATIC_CONDITIONAL_RULES,
} from './fiConditionalStylingPreset.js';
import { buildFiPriceTickRules } from './fiPriceTickRules.js';

function mergeThemedOverrides(
  existing: ColumnAssignment['cellStyleOverrides'],
  patch: ColumnAssignment['cellStyleOverrides'],
): ColumnAssignment['cellStyleOverrides'] {
  const out = { ...(existing ?? {}) };
  for (const slot of ['dark', 'light'] as const) {
    const p = patch?.[slot];
    if (!p) continue;
    const e = out[slot] ?? {};
    out[slot] = {
      ...e,
      ...p,
      alignment: p.alignment ?? e.alignment,
      typography: { ...e.typography, ...p.typography },
    };
  }
  return out;
}

function mergeAssignment(existing: ColumnAssignment, patch: ColumnAssignment): ColumnAssignment {
  const next: ColumnAssignment = { ...existing, colId: existing.colId };
  if (patch.valueFormatterTemplate) next.valueFormatterTemplate = patch.valueFormatterTemplate;
  if (patch.headerName) next.headerName = patch.headerName;
  if (patch.cellStyleOverrides) {
    next.cellStyleOverrides = mergeThemedOverrides(existing.cellStyleOverrides, patch.cellStyleOverrides);
  }
  if (patch.headerStyleOverrides) {
    next.headerStyleOverrides = mergeThemedOverrides(
      existing.headerStyleOverrides,
      patch.headerStyleOverrides,
    );
  }
  return next;
}

/**
 * Apply FI vendor-style formatters + alignment to every listed column.
 */
export function applyFiAutoFormatReducer(
  colIds: readonly string[],
  cellDataTypes?: Readonly<Record<string, string | undefined>>,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    const patches = buildFiAutoFormatAssignments(colIds, cellDataTypes);
    if (Object.keys(patches).length === 0) return base;

    const assignments = { ...base.assignments };
    for (const [colId, patch] of Object.entries(patches)) {
      const existing = assignments[colId] ?? { colId };
      assignments[colId] = mergeAssignment(existing, patch);
    }
    return { ...base, assignments };
  };
}

/**
 * Upsert FI conditional-styling rules (price tick arrows + static highlights).
 * When `priceColumnIds` is provided, tick rules are generated for every
 * price-classified column on the live grid (in addition to the defaults).
 */
export function mergeFiConditionalStylingReducer(
  priceColumnIds?: readonly string[],
): (prev: ConditionalStylingState | undefined) => ConditionalStylingState {
  return (prev) => {
    const base = prev ?? { ...INITIAL_CONDITIONAL_STYLING };
    const byId = new Map((base.rules ?? []).map((r) => [r.id, r]));
    const rules = priceColumnIds?.length
      ? [...buildFiPriceTickRules(priceColumnIds), ...FI_STATIC_CONDITIONAL_RULES]
      : buildFiConditionalStylingRules();
    for (const rule of rules) {
      byId.set(rule.id, rule);
    }
    return { ...base, rules: [...byId.values()] };
  };
}
