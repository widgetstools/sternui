import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ServerStatusPanel } from './ServerStatusPanel.js';
import { createServerEngineHolder } from './serverEngineHolder.js';
import type { PerspectiveGridStatus } from '@starui/perspective-grid';

function makeEngine(initial: Partial<PerspectiveGridStatus> = {}) {
  let status: PerspectiveGridStatus = {
    bookRows: 20_000,
    filteredRows: 20_000,
    filtered: false,
    live: true,
    liveViews: 1,
    failedBlocks: 0,
    ...initial,
  };
  const listeners = new Set<(s: PerspectiveGridStatus) => void>();
  return {
    engine: {
      get status() {
        return status;
      },
      subscribe(listener: (s: PerspectiveGridStatus) => void) {
        listeners.add(listener);
        listener(status);
        return () => listeners.delete(listener);
      },
    } as never,
    push(next: Partial<PerspectiveGridStatus>) {
      status = { ...status, ...next };
      for (const l of listeners) l(status);
    },
  };
}

function renderPanel(engine: unknown, api?: Record<string, unknown>) {
  const holder = createServerEngineHolder();
  holder.set(engine as never);
  return {
    holder,
    ...render(
      <ServerStatusPanel
        context={{ serverEngineHolder: holder }}
        api={api as never}
      />,
    ),
  };
}

describe('ServerStatusPanel', () => {
  it('shows the book total from the Table, not the loaded blocks', () => {
    // AG's own panels would say "100" here — the rows the client holds.
    const { engine } = makeEngine({ bookRows: 20_000, filteredRows: 20_000 });
    renderPanel(engine);
    expect(screen.getByText('20,000')).toBeTruthy();
  });

  it('shows filtered-of-book when a server-side filter is narrowing it', () => {
    const { engine } = makeEngine({ bookRows: 20_000, filteredRows: 3_333, filtered: true });
    renderPanel(engine);
    expect(screen.getByText('3,333')).toBeTruthy();
    expect(screen.getByText(/of 20,000 rows/)).toBeTruthy();
  });

  it('says "counting" rather than 0 before the first View exists', () => {
    // Rendering a 0 here reads as a real, alarming number.
    const { engine } = makeEngine({ filteredRows: null, bookRows: null });
    renderPanel(engine);
    expect(screen.getByText('counting…')).toBeTruthy();
  });

  it('updates when the engine pushes a new status', async () => {
    const { engine, push } = makeEngine({ bookRows: 20_000, filteredRows: 20_000 });
    renderPanel(engine);
    push({ filteredRows: 512, filtered: true });
    await waitFor(() => expect(screen.getByText('512')).toBeTruthy());
  });

  it('distinguishes a paused feed from a quiet one', () => {
    const { engine } = makeEngine({ live: false });
    renderPanel(engine);
    expect(screen.getByText('paused')).toBeTruthy();
  });

  it('surfaces failed blocks, which AG never retries on its own', () => {
    const { engine } = makeEngine({ failedBlocks: 2 });
    renderPanel(engine);
    expect(screen.getByText('2 failed blocks')).toBeTruthy();
  });

  it('reports selection from the GRID — the one genuinely client-side number', async () => {
    const { engine } = makeEngine();
    let handler: (() => void) | null = null;
    const api = {
      getSelectedNodes: () => [{}, {}, {}],
      addEventListener: (_t: string, l: () => void) => {
        handler = l;
      },
      removeEventListener: () => {},
    };
    renderPanel(engine, api);
    handler?.();
    await waitFor(() => expect(screen.getByText('3 selected')).toBeTruthy());
  });

  it('renders nothing without an engine rather than throwing', () => {
    const { container } = render(<ServerStatusPanel context={{}} />);
    expect(container.textContent).toBe('');
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    const engine = { status: null, subscribe: () => unsubscribe } as never;
    const { unmount } = renderPanel(engine);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

/**
 * The engine is not stable — a provider restart hands over a new Table and the
 * surface rebuilds around it. AG hands this panel the context object the grid
 * was CREATED with, so the swap has to reach it through that object or the bar
 * spends the rest of the session reporting a closed engine.
 */
describe('ServerStatusPanel — engine swaps', () => {
  it('follows the engine when the holder swaps it', async () => {
    const first = makeEngine({ bookRows: 20_000, filteredRows: 20_000 });
    const { holder } = renderPanel(first.engine);
    expect(screen.getByText('20,000')).toBeTruthy();

    const second = makeEngine({ bookRows: 512, filteredRows: 512 });
    holder.set(second.engine as never);

    await waitFor(() => expect(screen.getByText('512')).toBeTruthy());
  });

  it('drops the old subscription when the engine is swapped', async () => {
    const first = makeEngine();
    const { holder } = renderPanel(first.engine);
    const second = makeEngine({ bookRows: 7, filteredRows: 7 });
    holder.set(second.engine as never);
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());

    // A closed engine must not be able to repaint the bar.
    first.push({ filteredRows: 999, bookRows: 999 });
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
    expect(screen.queryByText('999')).toBeNull();
  });
});
