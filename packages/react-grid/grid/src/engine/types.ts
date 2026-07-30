/**
 * Which row engine MarketsGrid is running.
 *
 * `'ssrm'` is the hand-rolled `CustomSSRMGrid`; `'perspective'` is the
 * worker-held Table. Both are SERVER-side row models, and most code that used
 * to ask `=== 'ssrm'` actually meant "the client does not hold the book" —
 * use {@link isServerSideEngine} for that question, so the pull path is not
 * silently treated as CSRM.
 */
export type GridEngineKind = 'csrm' | 'ssrm' | 'perspective';

/** True when the window holds blocks rather than the whole book. */
export function isServerSideEngine(kind: GridEngineKind): boolean {
  return kind !== 'csrm';
}

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
