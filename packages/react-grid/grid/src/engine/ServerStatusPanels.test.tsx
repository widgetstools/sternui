import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  ServerFilteredRowCountPanel,
  ServerSelectedRowCountPanel,
  ServerTotalAndFilteredRowCountPanel,
  withServerStatusPanels,
} from './ServerStatusPanels.js';
import { createServerEngineHolder } from './serverEngineHolder.js';
import type { PerspectiveGridStatus } from '@starui/perspective-grid';

function makeEngine(initial: Partial<PerspectiveGridStatus> = {}) {
  const status: PerspectiveGridStatus = {
    bookRows: 50_000,
    filteredRows: 50_000,
    filtered: false,
    live: true,
    liveViews: 1,
    failedBlocks: 0,
    ...initial,
  };
  return {
    get status() {
      return status;
    },
    subscribe(listener: (s: PerspectiveGridStatus) => void) {
      listener(status);
      return () => {};
    },
  } as never;
}

function renderPanel(
  Panel: (p: never) => JSX.Element,
  engine: unknown,
  api?: Record<string, unknown>,
) {
  const holder = createServerEngineHolder();
  holder.set(engine as never);
  return render(
    <Panel
      {...({ context: { serverEngineHolder: holder }, api } as never)}
    />,
  );
}

/** A fake AG api with the server-side selection state and an event bus. */
function makeApi(state?: { selectAll: boolean; toggledNodes: string[] } | null) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    api: {
      getSelectedNodes: () => [],
      getServerSideSelectionState: () => state ?? null,
      addEventListener(type: string, listener: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
    } as Record<string, unknown>,
    fire(type: string) {
      for (const l of listeners.get(type) ?? []) l();
    },
  };
}

describe('ServerStatusPanels — row counts AG cannot answer here', () => {
  it('reports the book total from the Table, where AG renders nothing at all', () => {
    // MEASURED on both labs: AG's own row-count components render NOTHING under
    // the server row model.
    renderPanel(ServerTotalAndFilteredRowCountPanel, makeEngine());
    expect(screen.getByText('50,000')).toBeTruthy();
    expect(screen.getByText('Rows')).toBeTruthy();
  });

  it('reads "N of M" while a server-side filter narrows the book', () => {
    renderPanel(
      ServerTotalAndFilteredRowCountPanel,
      makeEngine({ filteredRows: 12_585, filtered: true }),
    );
    expect(screen.getByText('12,585 of 50,000')).toBeTruthy();
  });

  it('hides rather than omits the panel before the first View exists', () => {
    const { container } = renderPanel(
      ServerTotalAndFilteredRowCountPanel,
      makeEngine({ filteredRows: null, bookRows: null }),
    );
    const panel = container.querySelector('.ag-status-panel-total-and-filtered-row-count');
    expect(panel).toBeTruthy();
    expect(panel?.classList.contains('ag-hidden')).toBe(true);
  });

  it('shows Filtered only while a filter is on, as AG does', () => {
    const off = renderPanel(ServerFilteredRowCountPanel, makeEngine());
    expect(
      off.container.querySelector('.ag-status-panel-filtered-row-count')?.classList.contains('ag-hidden'),
    ).toBe(true);

    const on = renderPanel(
      ServerFilteredRowCountPanel,
      makeEngine({ filteredRows: 6_669, filtered: true }),
    );
    expect(on.getByText('6,669')).toBeTruthy();
  });
});

describe('ServerStatusPanels — selection', () => {
  it('answers select-all with a number, where AG answers "?"', async () => {
    // MEASURED: `Selected : ?` on the pull path after the header checkbox,
    // because the rows it would count were never sent to this window. The
    // server-side selection state says "everything except these"; the engine's
    // filtered count turns that into a number.
    const { api, fire } = makeApi({ selectAll: true, toggledNodes: ['a', 'b'] });
    renderPanel(
      ServerSelectedRowCountPanel,
      makeEngine({ filteredRows: 50_000, filtered: false }),
      api,
    );
    fire('selectionChanged');
    await waitFor(() => expect(screen.getByText('49,998')).toBeTruthy());
  });

  it('counts the toggled rows when the user has not selected everything', async () => {
    const { api, fire } = makeApi({ selectAll: false, toggledNodes: ['a', 'b', 'c'] });
    renderPanel(ServerSelectedRowCountPanel, makeEngine(), api);
    fire('selectionChanged');
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
  });

  it('hides itself with nothing selected', () => {
    const { api } = makeApi({ selectAll: false, toggledNodes: [] });
    const { container } = renderPanel(ServerSelectedRowCountPanel, makeEngine(), api);
    expect(
      container.querySelector('.ag-status-panel-selected-row-count')?.classList.contains('ag-hidden'),
    ).toBe(true);
  });
});

describe('withServerStatusPanels', () => {
  it('rewrites the stock row-count panels and leaves aggregation alone', () => {
    // A `statusBar` written for the CSRM grid has to mean the same thing here,
    // which is why the names are rewritten rather than the hosts changed.
    const out = withServerStatusPanels({
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
        { statusPanel: 'agAggregationComponent', align: 'right' },
      ],
    }) as { statusPanels: { statusPanel: string; align: string }[] };

    expect(out.statusPanels.map((p) => p.statusPanel)).toEqual([
      'serverTotalAndFilteredRowCount',
      'serverFilteredRowCount',
      'serverSelectedRowCount',
      // Untouched: it aggregates the selected cell RANGE, which this window
      // holds.
      'agAggregationComponent',
    ]);
    // Alignment and order are the host's and stay the host's.
    expect(out.statusPanels.map((p) => p.align)).toEqual(['left', 'left', 'center', 'right']);
  });

  it('passes through anything it has no answer for', () => {
    const custom = { statusPanels: [{ statusPanel: 'myOwnPanel' }] };
    expect(withServerStatusPanels(custom)).toBe(custom);
    expect(withServerStatusPanels(undefined)).toBeUndefined();
  });
});
