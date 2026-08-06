/**
 * The engine's verdict on an authored expression, shown to its author.
 *
 * ## What these refuse to be satisfied by
 *
 * The thing being tested is a strip that renders NOTHING most of the time —
 * on CSRM, before an engine attaches, and whenever the expression was fine.
 * A test that only asserted "nothing rendered" would therefore pass against a
 * hook that was never called, an import that was deleted, and a seam that was
 * never wired: the failure mode this closes is exactly a silent absence, so
 * every check below either demands text on screen or demands that a DIFFERENT
 * column's diagnostic stays off it.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { GridPlatform } from '@starui/engine';
import type { GridApi } from 'ag-grid-community';
import { GridProvider } from '../../hooks/GridProvider';
import { CalculatedColumnsEditor } from './CalculatedColumnsPanel';
import { calculatedColumnsModule } from './index';
import type { CalculatedColumnsState } from './state';
import type { ServerCalcDiagnostic } from '../../../engine/serverEngineHolder.js';

const COL_ID = 'grossPnl';

function makePlatform(): GridPlatform {
  const platform = new GridPlatform({
    gridId: 'diag-grid',
    modules: [calculatedColumnsModule],
  });
  platform.store.setModuleState<CalculatedColumnsState>('calculated-columns', () => ({
    virtualColumns: [
      {
        colId: COL_ID,
        headerName: 'Gross P&L',
        // Parses cleanly, so the PLANNER has nothing to say about it. That is
        // the whole point: everything below is a refusal only the engine knows.
        expression: 'SUM([price])',
        position: 20,
        initialWidth: 120,
      },
    ],
  }));
  return platform;
}

/**
 * A grid whose `context` answers the seam, and nothing else.
 *
 * `getGridOption` is the only method the hook touches; anything richer here
 * would be a fixture asserting its own shape rather than the code's.
 */
function attachContext(
  platform: GridPlatform,
  context: Record<string, unknown> | undefined,
): void {
  platform.api.attach({
    getGridOption: (key: string) => (key === 'context' ? context : undefined),
  } as unknown as GridApi);
}

function mount(platform: GridPlatform) {
  return render(
    <GridProvider platform={platform}>
      <CalculatedColumnsEditor gridId="diag-grid" selectedId={COL_ID} />
    </GridProvider>,
  );
}

const STRIP = `cc-virtual-engine-diagnostics-${COL_ID}`;

afterEach(cleanup);

describe('server-side calculated-column diagnostics', () => {
  it('tells the author WHY the engine left the column blank', async () => {
    const platform = makePlatform();
    attachContext(platform, {
      ssrmCalcDiagnostics: async (): Promise<ServerCalcDiagnostic[]> => [
        {
          colId: COL_ID,
          phase: 'compile',
          message: 'SUM is a cross-row aggregate and has no per-row value',
          count: 1,
        },
      ],
    });
    mount(platform);

    // The message itself, not merely the presence of a box: a strip that
    // rendered an empty box would satisfy a testid-only assertion, and an
    // empty box explains nothing, which is the state being fixed.
    await screen.findByText(/cross-row aggregate/i);
    const strip = screen.getByTestId(STRIP);
    expect(strip.textContent).toContain('ENGINE REFUSED');
    expect(strip.querySelector('[data-phase="compile"]')).not.toBeNull();
  });

  it('counts a repeated RUNTIME failure instead of reporting it once', async () => {
    const platform = makePlatform();
    attachContext(platform, {
      ssrmCalcDiagnostics: async (): Promise<ServerCalcDiagnostic[]> => [
        { colId: COL_ID, phase: 'runtime', message: 'divide by zero', count: 4_312 },
      ],
    });
    mount(platform);

    const strip = await screen.findByTestId(STRIP);
    expect(strip.textContent).toContain('FAILED WHILE EVALUATING');
    // The count is the difference between "one odd row" and "the column is
    // wrong". Rendered through toLocaleString, so this also pins the format.
    expect(strip.textContent).toContain('4,312');
  });

  it('shows only THIS column, not every diagnostic the engine holds', async () => {
    const platform = makePlatform();
    attachContext(platform, {
      ssrmCalcDiagnostics: async (): Promise<ServerCalcDiagnostic[]> => [
        { colId: 'someOtherColumn', phase: 'compile', message: 'NOW is not supported', count: 1 },
        { colId: COL_ID, phase: 'column', message: 'no field named [pric]', count: 1 },
      ],
    });
    mount(platform);

    const strip = await screen.findByTestId(STRIP);
    expect(strip.textContent).toContain('UNKNOWN FIELD');
    expect(strip.textContent).toContain('[pric]');
    // Dropping the filter would put a stranger's refusal under this editor and
    // send the author to fix an expression that is not on the screen.
    expect(strip.textContent).not.toContain('NOW is not supported');
  });

  it('renders nothing when the grid context has no such seam', async () => {
    const platform = makePlatform();
    attachContext(platform, { serverEngineHolder: { get: () => null } });
    mount(platform);

    // Absence has to be given a chance to become presence, or this passes
    // against a hook that simply had not resolved yet.
    await waitFor(() => expect(screen.getByTestId(`cc-virtual-expr-${COL_ID}`)).toBeTruthy());
    expect(screen.queryByTestId(STRIP)).toBeNull();
  });

  it('survives an engine that throws rather than answers', async () => {
    const platform = makePlatform();
    attachContext(platform, {
      ssrmCalcDiagnostics: async (): Promise<ServerCalcDiagnostic[]> => {
        throw new Error('the worker went away mid-read');
      },
    });
    // A rejected read must not take the editor down with it — the author is
    // most likely to be in this panel precisely when the engine is unhappy.
    expect(() => mount(platform)).not.toThrow();
    await waitFor(() => expect(screen.getByTestId(`cc-virtual-expr-${COL_ID}`)).toBeTruthy());
    expect(screen.queryByTestId(STRIP)).toBeNull();
  });
});
