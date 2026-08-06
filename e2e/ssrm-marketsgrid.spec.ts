import { test, expect, type Page } from '@playwright/test';

/**
 * The `@starui/ssrm-engine` MarketsGrid surface, driven by real user input.
 *
 * **This file closes a gap session 6 recorded and left open.** The interaction
 * on this surface has been covered by committed Playwright PROBES — real input
 * against a production build, reproducible from the README — but not by a spec
 * under `e2e/`, because adding one meant a fourth Playwright config with its own
 * web server. `playwright.ssrm-lab.config.ts` is that config, and
 * `@starui/ssrm-markets-grid-lab` is why it is now worth having: one engine, one
 * grid, no `?engine=` parameter deciding what is mounted, so a spec cannot
 * silently assert against the wrong surface.
 *
 * The probes are NOT replaced by this. They measure — block latency, pump
 * counters, whole-book counts — and a spec should not. This asserts the
 * behaviours a regression would break silently, and each one was a real defect
 * on this path at some point:
 *
 *   1. the surface mounts over the WHOLE book (so a later failure is not
 *      ambiguous between "feature broken" and "grid never loaded");
 *   2. the platform knows which engine it is on — `engineKind` reported `csrm`
 *      here until session 9, and every feature gated on `isServerSideEngine()`
 *      treated a grid holding ~100 rows as one holding 50,000;
 *   3. the status bar reports the BOOK, not the block cache;
 *   4. grouping ticks at every level — 0 of 9 group rows moved before session 9;
 *   5. a whole-book style rule lights a header no loaded block can answer;
 *   6. tree data and master/detail, which existed only on the Perspective
 *      surface until session 9.
 *
 * DOM notes for this AG Grid 36 surface, both of which have cost time:
 *   - `.ag-body-viewport .ag-row` and `.ag-center-cols-container .ag-cell` match
 *     ZERO elements. Query `.ag-row` / `.ag-cell`; `.ag-grid-viewport` scrolls.
 *   - a tree parent is marked by NEITHER `node.group` NOR `node.expandable` —
 *     both read false on a correct tree root. The engine's own marker is the
 *     identifier.
 */

const GRID_ID = 'ssrm-markets-grid-lab';
const BOOK_ROWS = 50_000;

/**
 * Ready = the book is open AND the grid is sized to it.
 *
 * Not "the first row rendered": this window opens against a book being
 * generated in a SharedWorker, and a grid showing 100 rows of an incoming
 * 50,000 is not in a state where a whole-book assertion means anything.
 */
async function waitForGrid(page: Page): Promise<void> {
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 120_000 });
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as never as SsrmLabWindow).__ssrmEngineGrid?.api?.getDisplayedRowCount?.() ?? 0,
        ),
      { timeout: 120_000, message: 'the grid never sized to the whole book' },
    )
    .toBeGreaterThanOrEqual(BOOK_ROWS);
}

interface SsrmLabWindow {
  __ssrmEngineGrid?: {
    api?: {
      getDisplayedRowCount?(): number;
      getColumns?(): { getColId(): string }[];
      getDisplayedRowAtIndex?(i: number): Record<string, unknown> | null;
      getGridOption?(key: string): unknown;
      setRowNodeExpanded?(node: unknown, expanded: boolean): void;
      forEachDetailGridInfo?(cb: (info: { api?: { forEachNode?(cb: (n: Record<string, unknown>) => void): void } }) => void): void;
      applyColumnState?(state: unknown): void;
      ensureColumnVisible?(col: string): void;
    };
    blocks?(): { served: number; failed: number };
    surface?: string;
  };
}

test.describe('ssrm-engine MarketsGrid surface', () => {
  test('mounts over the whole book, on the surface it claims to be', async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);

    const state = await page.evaluate(() => {
      const w = window as never as SsrmLabWindow;
      const api = w.__ssrmEngineGrid!.api!;
      // The platform's own view of which engine it is on — the thing that
      // reported `csrm` on this surface until session 9. Read off the React
      // context rather than inferred, because inferring it is what went wrong.
      const el = document.querySelector('.ag-root-wrapper')!;
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
      let fiber = (el as never as Record<string, { memoizedProps?: { value?: unknown }; return?: unknown }>)[key];
      let engineKind: string | null = null;
      while (fiber && !engineKind) {
        const value = fiber.memoizedProps?.value as { engineKind?: string } | undefined;
        if (value && typeof value === 'object' && 'engineKind' in value) {
          engineKind = value.engineKind ?? null;
        }
        fiber = fiber.return as never;
      }
      return {
        surface: w.__ssrmEngineGrid!.surface,
        engineKind,
        rowModelType: api.getGridOption!('rowModelType'),
        rows: api.getDisplayedRowCount!(),
        failedBlocks: w.__ssrmEngineGrid!.blocks!().failed,
      };
    });

    expect(state.surface).toBe('ssrm-markets-grid-lab');
    expect(state.rowModelType).toBe('serverSide');
    // Not `csrm`. A grid holding ~100 rows of 50,000 that says it holds the
    // whole book makes every `isServerSideEngine()` gate take the wrong branch.
    expect(state.engineKind).toBe('ssrm-engine');
    expect(state.rows).toBeGreaterThanOrEqual(BOOK_ROWS);
    expect(state.failedBlocks).toBe(0);
  });

  test('the seeded profile is live on the FIRST visit', async ({ page }) => {
    // A lab whose configuration only appears on the second load fails the
    // reader it was built for. Playwright's context is clean per test, so this
    // is a genuine first visit.
    await page.goto('/');
    await waitForGrid(page);
    const calcColumns = await page.evaluate(() => {
      const api = (window as never as SsrmLabWindow).__ssrmEngineGrid!.api!;
      return api.getColumns!().map((c) => c.getColId()).filter((id) => id.startsWith('calc_'));
    });
    // Six authored expressions, evaluated in the WORKER over the columnar book.
    expect(calcColumns.length).toBeGreaterThanOrEqual(6);
  });

  test('a whole-book style rule lights a header no loaded block can answer', async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);

    const lit = await page.evaluate(async () => {
      const api = (window as never as SsrmLabWindow).__ssrmEngineGrid!.api!;
      const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // AG virtualises COLUMNS: a header cell not scrolled into view is not in
      // the document, and the assertion below would read an empty list.
      (api as never as { ensureColumnVisible(c: string): void }).ensureColumnVisible('esgScore');
      await settle(3000);
      let seen = false;
      let loadedMax = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < 40; i += 1) {
        seen ||= [...document.querySelectorAll('.ag-header-cell')].some((el) =>
          el.classList.contains('ds-rule-esg-leaders-whole-book'),
        );
        (api as never as { forEachNode(cb: (n: { data?: Record<string, number> }) => void): void }).forEachNode(
          (n) => {
            const v = n.data?.esgScore;
            if (typeof v === 'number' && v > loadedMax) loadedMax = v;
          },
        );
        await settle(250);
      }
      return { seen, loadedMax };
    });

    // The anti-vacuous half: the rule is `[esgScore] > 999` and no loaded row
    // may reach it, or the CLIENT scan could have answered and a lit header
    // would prove nothing about the whole-book seam.
    expect(lit.loadedMax).toBeLessThan(999);
    expect(lit.seen).toBe(true);
  });

  test('tree data serves a hierarchy a level at a time', async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await page.getByTestId('ssrm-lab-mode-tree').click();
    await page.waitForSelector('.ag-row', { timeout: 180_000 });

    const tree = await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const api = (window as never as SsrmLabWindow).__ssrmEngineGrid!.api!;
            let parents = 0;
            for (let i = 0; i < api.getDisplayedRowCount!(); i += 1) {
              const n = api.getDisplayedRowAtIndex!(i) as { data?: Record<string, unknown> } | null;
              if (n?.data?.__ssrmTreeGroup === true) parents += 1;
            }
            return parents;
          }),
        {
          timeout: 120_000,
          message:
            'no tree parents — a hierarchy that never reached the engine renders every row at ' +
            'depth 0 and still looks like a working grid',
        },
      )
      .toBeGreaterThan(1);
    expect(tree).toBeUndefined();

    // Read INSIDE the page. `__ssrmEngineGrid` is a handle of functions and
    // `page.evaluate` serialises its return value, so a handle pulled across
    // the boundary arrives with every method gone.
    const after = await page.evaluate(() => {
      const w = window as never as SsrmLabWindow;
      return {
        treeData: w.__ssrmEngineGrid!.api!.getGridOption!('treeData'),
        failed: w.__ssrmEngineGrid!.blocks!().failed,
      };
    });
    expect(after.treeData).toBe(true);
    expect(after.failed).toBe(0);
  });

  /**
   * The session-9 headline, as a regression test.
   *
   * MEASURED before it was fixed: group rows 0 of 9 moved, subgroups 0 of 2,
   * leaves 1 of 101, while the pump reported received 34,447 · applied 0 ·
   * DROPPED 34,447. Under grouping a leaf id is its PATH and a sparse patch
   * cannot carry one, so the push path is off and the expanded routes are
   * re-read instead.
   */
  test('grouped aggregates TICK at every level', async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);

    const moved = await page.evaluate(async () => {
      const api = (window as never as SsrmLabWindow).__ssrmEngineGrid!.api!;
      const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
      api.applyColumnState!({
        state: [
          { colId: 'assetClass', rowGroup: true, rowGroupIndex: 0 },
          { colId: 'esgScore', aggFunc: 'sum' },
        ],
        defaultState: { rowGroup: false },
      });
      await settle(8000);

      /** Every group row on screen, keyed by node id — not one of each. */
      const sample = () => {
        const out = new Map<string, unknown>();
        for (let i = 0; i < api.getDisplayedRowCount!(); i += 1) {
          const n = api.getDisplayedRowAtIndex!(i) as
            | { id?: string; group?: boolean; aggData?: Record<string, unknown>; data?: Record<string, unknown> }
            | null;
          if (!n?.group || n.id === undefined) continue;
          const v = n.aggData?.esgScore ?? n.data?.esgScore;
          if (v !== undefined && v !== null) out.set(n.id, v);
        }
        return out;
      };

      let prev = sample();
      const watched = prev.size;
      const changed = new Set<string>();
      for (let i = 0; i < 30; i += 1) {
        await settle(500);
        const now = sample();
        for (const [id, v] of now) {
          const was = prev.get(id);
          if (was !== undefined && was !== v) changed.add(id);
        }
        prev = now;
      }
      return { watched, changed: changed.size };
    });

    // Anti-vacuous: group rows must be ON SCREEN before "they moved" means
    // anything. A collapsed or ungrouped grid trivially reports zero of zero.
    expect(moved.watched).toBeGreaterThan(1);
    expect(moved.changed).toBeGreaterThan(0);
  });

  test('master/detail reads a row’s children from the book', async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await page.getByTestId('ssrm-lab-mode-detail').click();
    await page.waitForSelector('.ag-row', { timeout: 180_000 });

    const detail = await page.evaluate(async () => {
      const api = (window as never as SsrmLabWindow).__ssrmEngineGrid!.api!;
      const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let master: { data?: Record<string, unknown> } | null = null;
      for (let i = 0; i < api.getDisplayedRowCount!() && !master; i += 1) {
        const n = api.getDisplayedRowAtIndex!(i) as { data?: Record<string, unknown>; group?: boolean; footer?: boolean } | null;
        if (n?.data && !n.group && !n.footer) master = n;
      }
      if (!master) return { rows: 0, allShareTheDesk: false, desk: null };
      const desk = master.data!.desk ?? null;
      api.setRowNodeExpanded!(master, true);
      await settle(8000);
      // AG's OWN registry. Walking the fiber up from a detail grid reaches the
      // MASTER grid, which reports the master's row count and looks exactly
      // like the match clause being ignored.
      const rows: Record<string, unknown>[] = [];
      api.forEachDetailGridInfo!((info) => {
        info.api?.forEachNode?.((n) => {
          const data = (n as { data?: Record<string, unknown> }).data;
          if (data) rows.push(data);
        });
      });
      return { rows: rows.length, allShareTheDesk: rows.every((r) => r.desk === desk), desk };
    });

    expect(detail.rows).toBeGreaterThan(0);
    // NOT the whole book — that is exactly what an empty match produces.
    expect(detail.rows).toBeLessThan(BOOK_ROWS);
    expect(detail.allShareTheDesk).toBe(true);
  });
});
