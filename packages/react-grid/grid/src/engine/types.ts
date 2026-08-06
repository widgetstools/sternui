/**
 * Which row engine MarketsGrid is running.
 *
 * `'ssrm'` is the hand-rolled `CustomSSRMGrid`; `'perspective'` is the
 * worker-held Table; `'ssrm-engine'` is `@starui/ssrm-engine`'s worker-held
 * columnar book, which is the engine that SHIPS. All three are SERVER-side row
 * models, and most code that used to ask `=== 'ssrm'` actually meant "the
 * client does not hold the book" — use {@link isServerSideEngine} for that
 * question, so a pull path is not silently treated as CSRM.
 *
 * **`'ssrm-engine'` was missing here until session 9, and that is what made it
 * a defect rather than a tidy-up.** `MarketsGrid` computed
 * `perspective ? 'perspective' : useSSRM ? 'ssrm' : 'csrm'` and nothing
 * consulted `resolveSsrmEngine`, so `rowModel: 'ssrm-engine'` — the product
 * surface — reported `'csrm'`: a grid holding ~100 rows of a 50,000-row book,
 * declaring that it held the whole thing. The measurable consequence is in
 * `useFilterModel`, where a saved-filter badge then counted the loaded blocks.
 */
export type GridEngineKind = 'csrm' | 'ssrm' | 'perspective' | 'ssrm-engine';

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
