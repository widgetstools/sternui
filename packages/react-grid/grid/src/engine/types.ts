export type GridEngineKind = 'csrm' | 'ssrm';

export type SsrmPhase = 0 | 1 | 2 | 3 | 4;

export type SsrmCapabilityId =
  | 'presentation'
  | 'excelFormat'
  | 'columnGroups'
  | 'namedAgg'
  | 'grouping'
  | 'liveTicks'
  | 'exportAll'
  | 'oldNewDiff'
  | 'calcColumns'
  | 'customJsAgg'
  | 'trafficLightAgg'
  | 'alerts'
  | 'smartEdit'
  | 'externalFilter';

/** Engine-neutral data transaction shape used by both CSRM and SSRM handles. */
export type GridDataTransaction = {
  add?: unknown[];
  update?: unknown[];
  remove?: unknown[];
};
