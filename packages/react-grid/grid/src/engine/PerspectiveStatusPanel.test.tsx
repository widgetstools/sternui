import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PerspectiveStatusPanel } from './PerspectiveStatusPanel.js';
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

const renderPanel = (engine: unknown, api?: Record<string, unknown>) =>
  render(<PerspectiveStatusPanel context={{ perspectiveEngine: engine as never }} api={api as never} />);

describe('PerspectiveStatusPanel', () => {
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
    const { container } = render(<PerspectiveStatusPanel context={{}} />);
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
