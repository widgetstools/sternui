/**
 * @starui/perspective-grid — Perspective-backed MarketsGrid engine.
 *
 * Topology (validated by `scripts/viewCostProbe.mjs` against 4.5.2):
 * ONE Table lives in the SharedWorker and is fed by the STOMP provider;
 * each blotter window opens its own View and renders only the rows in
 * its viewport. A window therefore never materializes the full book —
 * the measured cost of a 100-row window read is ~2-6ms regardless of
 * scroll depth, against ~1.3ms per extra live View per tick.
 */
export const PERSPECTIVE_GRID_PACKAGE = '@starui/perspective-grid';
