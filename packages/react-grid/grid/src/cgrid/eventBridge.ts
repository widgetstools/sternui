/**
 * MarketsCgrid — AG event names → cgrid events.
 *
 * StarUI subscribes exclusively through `ApiHub.on(name, cb)` →
 * `api.addEventListener(name, cb)`. cgrid emits 14 of the 16 names
 * natively; the two composites are synthesized here. Payloads: cgrid
 * event objects carry AG-compatible field names for the fields StarUI
 * actually reads (verified per call site); callers that need more get
 * them as M3 fills in module support.
 */

type Handler = (event: unknown) => void;
type CgridEventTarget = {
  on(type: string, handler: Handler): () => void;
};

/** AG name → cgrid name(s). Identity where cgrid matches natively. */
const NAME_MAP: Record<string, readonly string[]> = {
  cellFocused: ['cellFocused'],
  cellKeyDown: ['cellKeyDown'],
  cellClicked: ['cellClicked'],
  cellSelectionChanged: ['cellSelectionChanged'],
  cellValueChanged: ['cellValueChanged'],
  columnGroupOpened: ['columnGroupOpened'],
  columnPinned: ['columnPinned'],
  columnResized: ['columnResized'],
  columnVisible: ['columnVisible'],
  displayedColumnsChanged: ['displayedColumnsChanged'],
  filterChanged: ['filterChanged'],
  firstDataRendered: ['firstDataRendered'],
  modelUpdated: ['modelUpdated'],
  asyncTransactionsFlushed: ['asyncTransactionsFlushed'],
  rowValueChanged: ['rowValueChanged'],
  sortChanged: ['sortChanged'],
  gridPreDestroyed: ['gridPreDestroyed'],
  // Composites:
  rowDataUpdated: ['rowsChanged', 'modelUpdated'],
  columnEverythingChanged: ['columnDefsChanged', 'columnsReset'],
};

const warned = new Set<string>();

/** Subscribe an AG-named handler on a cgrid event target. Returns an
 *  unsubscribe covering every underlying cgrid subscription. */
export function subscribeAgEvent(
  target: CgridEventTarget,
  agName: string,
  handler: Handler,
): () => void {
  const cgridNames = NAME_MAP[agName];
  if (!cgridNames) {
    if (!warned.has(agName)) {
      warned.add(agName);
      // eslint-disable-next-line no-console
      console.warn(`[MarketsCgrid] event '${agName}' is not available on the cgrid surface — handler never fires`);
    }
    return () => {};
  }
  const offs = cgridNames.map((name) =>
    target.on(name, (event) => handler({ ...(event as Record<string, unknown>), type: agName })),
  );
  return () => { for (const off of offs) off(); };
}
