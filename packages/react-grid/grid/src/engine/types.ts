export type GridEngineKind = 'csrm' | 'ssrm';

/** Engine-neutral data transaction shape used by both CSRM and SSRM handles. */
export type GridDataTransaction = {
  add?: unknown[];
  update?: unknown[];
  remove?: unknown[];
};
