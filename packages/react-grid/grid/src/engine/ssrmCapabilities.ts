import type { SsrmCapabilityId, SsrmPhase } from './types.js';

export type { SsrmCapabilityId, SsrmPhase } from './types.js';

const PHASE_MIN: Record<SsrmCapabilityId, SsrmPhase> = {
  presentation: 0,
  excelFormat: 0,
  columnGroups: 1,
  namedAgg: 1,
  grouping: 1,
  liveTicks: 1,
  exportAll: 1,
  oldNewDiff: 1,
  calcColumns: 2,
  customJsAgg: 2,
  trafficLightAgg: 2,
  // Alerts unblocked early once the SSRM→RowChangeBus bridge lands; keep
  // smartEdit / externalFilter at phase 3 (do not bump CURRENT_SSRM_PHASE).
  alerts: 2,
  // Smart-edit (and shared editing writer) once host applyDataTransaction is wired.
  smartEdit: 2,
  externalFilter: 3,
};

/** Current shipped SSRM capability floor for MarketsGrid. Bump when a phase lands. */
export const CURRENT_SSRM_PHASE: SsrmPhase = 2;

export function isSsrmCapabilityEnabled(
  id: SsrmCapabilityId,
  phase: SsrmPhase = CURRENT_SSRM_PHASE,
): boolean {
  return PHASE_MIN[id] <= phase;
}

export function ssrmCapabilityTooltip(id: SsrmCapabilityId): string {
  const min = PHASE_MIN[id];
  return `Not available on server row model until SSRM phase ${min}`;
}
