/**
 * The real MarketsGrid on the pull path.
 *
 * `rowModel="perspective"` plus a worker-held Table is the whole switch. Every
 * other prop is what a CSRM MarketsGrid takes, and the toolbar, formatting,
 * customizer, profiles and column defs are untouched — which is the claim the
 * migration rests on: AG Grid stays the surface and only the row supply moves.
 *
 * `rowData` is deliberately empty. On this path the window never holds the
 * book; it reads the blocks its viewport asks for.
 */
import { useEffect, useMemo, useState } from 'react';
import { MarketsGrid } from '@starui/grid';
import { createHostHandle } from './hostClient';
import { BOOK_TABLE, KEY_COLUMN } from './feedConfig';

const EMPTY: Record<string, unknown>[] = [];

/** Columns that make a group row worth reading when grouping is on. */
const AGGREGATED: Record<string, string> = {
  quantity: 'sum',
  notionalAmount: 'sum',
  marketValue: 'sum',
  totalValue: 'sum',
  pnl: 'sum',
  unrealizedPnl: 'sum',
  dailyPnl: 'sum',
  dv01: 'sum',
  currentPrice: 'avg',
};

interface OpenTable {
  schema(): Promise<Record<string, string>>;
}

export function MarketsGridBlotter() {
  const [table, setTable] = useState<OpenTable | null>(null);
  const [schema, setSchema] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState('connecting to the worker…');

  useEffect(() => {
    let live = true;
    const host = createHostHandle();
    host.onMessage((message) => {
      if (live && message?.type === 'stage') setStatus(`worker: ${String(message.stage)}`);
    });

    void (async () => {
      const client = (await host.client) as { open_table(name: string): Promise<OpenTable> };
      // Resolves only once the worker HAS the Table — opening it earlier
      // throws `Unknown table`, which is what a window arriving during the
      // snapshot would hit.
      const attached = await host.attached;
      if (!live) return;
      const opened = await client.open_table(BOOK_TABLE);
      const cols = await opened.schema();
      if (!live) return;
      setTable(opened);
      setSchema(cols);
      setStatus(
        `window #${String(attached.attached)} · ${Object.keys(cols).length} columns · ` +
          'book held once in the worker',
      );
    })();

    return () => {
      live = false;
    };
  }, []);

  // Column defs come from the Table's own schema — whatever the broker sends
  // is what the grid shows.
  const columnDefs = useMemo(() => {
    if (!schema) return [];
    return Object.entries(schema).map(([field, type]) => {
      const numeric = type === 'float' || type === 'integer';
      return {
        field,
        width: field === KEY_COLUMN ? 210 : 130,
        pinned: field === KEY_COLUMN ? ('left' as const) : undefined,
        filter: numeric ? 'agNumberColumnFilter' : 'agTextColumnFilter',
        ...(numeric
          ? { type: 'numericColumn', enableValue: true, aggFunc: AGGREGATED[field] }
          : { enableRowGroup: true }),
      };
    });
  }, [schema]);

  return (
    // No harness classes here — `bar`/`stat`/`sub` belong to the probe
    // stylesheet, which carries its own palette and would fight the grid.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-status" id="who">
        {status}
      </div>
      {table === null ? (
        <div className="page-waiting">
          Waiting for the worker to load the book from the broker…
        </div>
      ) : (
        // MarketsGrid's root is `height: 100%`, which resolves against THIS
        // box — so it needs a flex child that actually claims the space.
        // `minHeight: 0` stops the grid's own content forcing the flex item
        // taller than the viewport.
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <MarketsGrid
          gridId="perspective-blotter"
          rowModel="perspective"
          perspectiveTable={table}
          perspectiveKeyColumn={KEY_COLUMN}
          rowIdField={KEY_COLUMN}
          rowData={EMPTY}
          columnDefs={columnDefs}
          showToolbar
          showProfileSelector={false}
          showSettingsButton
          showColumnSelector
          style={{ flex: 1, minWidth: 0 }}
          onGridReady={(event) => {
            // Debug handle, same affordance the raw-AG-Grid page has.
            (globalThis as Record<string, unknown>).__mg = { api: event.api };
          }}
        />
        </div>
      )}
    </div>
  );
}
