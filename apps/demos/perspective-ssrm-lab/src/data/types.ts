export type LabRow = Record<string, unknown>;

export interface StreamOptions {
  /** Number of rows to seed. Default 500. */
  rowCount?: number;
  /** Tick interval in ms. Default 250. */
  updateIntervalMs?: number;
  /** Toggle live ticking. Default true. */
  enableUpdates?: boolean;
  /**
   * Subscribe at all. Default true.
   *
   * `enableUpdates: false` only stops the TICKS — the snapshot still arrives
   * and the window still holds it. On a tab whose active surface reads from a
   * worker-held Table, that is the whole book materialized in the window for
   * nothing: MEASURED on the 50k x 400 Stress tab, two live arrays of 50,000
   * rows x 256 fields in React hook state (`rows` and `rowsRef`), on a surface
   * that renders none of them. The renderer died with
   * "Aw, Snap! Error code: Out of Memory". Set false and no subscription is
   * made.
   */
  enabled?: boolean;
}
