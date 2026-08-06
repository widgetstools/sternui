import { test, expect, type Page } from '@playwright/test';

/**
 * Column-window fetching, driven against the wide-book lab.
 *
 * This spec exists because every failure mode of this feature is SILENT. A
 * column the window forgot renders BLANK, a value getter reading a forgotten
 * field gets `undefined` and draws a flat line, an aggregate on a forgotten
 * column empties the totals row — and nothing logs, throws, or turns red. The
 * only way to know it is right is to look at what the grid paints after the
 * user has scrolled the columns out of the loaded band and back.
 *
 * It runs against `perspective-ssrm-lab` on **5301**, not the 5273 demo the
 * rest of `perspective-*.spec.ts` uses: the window only means anything over a
 * wide book, and the lab's Stress tab is the only wide one that needs no broker.
 *
 * That tab is now a SINGLE surface — 20,000 rows x 120 columns, every one of
 * them bound to a real Table field (VERIFIED by `columnPayloadProbe.mjs`: 124
 * columns in a returned row, 0 computed in the window). The column window ships
 * off, so the spec enables it with `?columnWindow=1`, which is a run-time flag
 * on the same test rather than a second variant that could drift from it.
 *
 * DOM notes for this AG Grid 36 surface, both of which cost time before they
 * were written down:
 *   - `.ag-body-viewport .ag-row` and `.ag-center-cols-container .ag-cell`
 *     match ZERO elements here. Query `.ag-row` / `.ag-cell`.
 *   - AG virtualises columns, so a cell is only in the DOM while its column is
 *     on screen. Every assertion below scrolls its column into view first.
 */

/** The Stress tab with column-window fetching switched on for this run. */
const LAB_URL = 'http://localhost:5301/?columnWindow=1';

/**
 * A column far to the RIGHT of the leading band — 100+ columns along, so a
 * 25-column pad cannot reach it and the band really is replaced.
 */
const FAR_RIGHT_COLUMN = 'distanceToDefault';

/**
 * Reach the grid api the way every probe on this path does: walk `__reactFiber$`
 * up from `.ag-root-wrapper`, installed once per page as `window.__labApi()`.
 *
 * Not a shortcut around the UI — it is how a test drives grouping and column
 * scrolling deterministically on a 120-column grid, where the equivalent user
 * gestures are a drag into the row-group panel and an unbounded number of wheel
 * notches. Everything ASSERTED below is read from the painted DOM.
 */
async function installApiBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__labApi = () => {
      const el = document.querySelector('.ag-root-wrapper') as unknown as Record<string, unknown>;
      const key = Object.keys(el).find((x) => x.startsWith('__reactFiber$'))!;
      let fiber = el[key] as Record<string, unknown> | null;
      let api: Record<string, unknown> | null = null;
      while (fiber && !api) {
        const props = fiber.memoizedProps as Record<string, unknown> | undefined;
        const candidate = props?.api as Record<string, unknown> | undefined;
        if (typeof candidate?.getColumns === 'function') api = candidate;
        let hook = fiber.memoizedState as Record<string, unknown> | null;
        while (hook && !api) {
          const state = hook.memoizedState as Record<string, unknown> | undefined;
          if (typeof state?.getColumns === 'function') api = state;
          hook = hook.next as Record<string, unknown> | null;
        }
        fiber = fiber.return as Record<string, unknown> | null;
      }
      return api;
    };
  });
}

async function openWindowVariant(page: Page): Promise<void> {
  await installApiBridge(page);
  await page.goto(LAB_URL, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  // The book is generated in the worker; first rows take ~12-15 s on a cold
  // profile.
  await page.waitForSelector('.ag-row', { timeout: 180_000 });

  /**
   * Ungroup first, and this is not a convenience.
   *
   * The Stress tab restores a seeded profile that opens GROUPED by asset class,
   * so the rows on screen are nine group rows whose `cusip` cell is correctly
   * blank — a non-numeric column with no `aggFunc` is empty in a group row on
   * every surface. Asserting a leaf value against that reads as "the column
   * window blanked the grid" and is nothing of the kind; it cost a full run to
   * find out. The grouping test below puts the group columns back itself.
   */
  await page.evaluate(() => {
    (window as unknown as { __labApi(): { setRowGroupColumns(c: string[]): void } })
      .__labApi()
      .setRowGroupColumns([]);
  });

  /**
   * Scroll it into view before asserting on it — the trap named at the top of
   * this file, which the readiness check itself walked into.
   *
   * AG virtualises COLUMNS, so `.ag-cell[col-id="cusip"]` does not exist unless
   * `cusip` is on screen. On a 120-column book it sits around the tenth
   * displayed column, which at this viewport is just outside the rendered run —
   * so the assertion failed with "element(s) not found", which reads exactly
   * like the column window having blanked the grid and is nothing of the kind.
   */
  await scrollToColumn(page, 'cusip');
  await expect(page.locator('.ag-cell[col-id="cusip"]').first()).not.toHaveText('', {
    timeout: 120_000,
  });
}

async function scrollToColumn(page: Page, colId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as unknown as { __labApi(): { ensureColumnVisible(c: string): void } })
      .__labApi()
      .ensureColumnVisible(id);
  }, colId);
  // A band change is debounced 150 ms and then re-reads the loaded blocks.
  await page.waitForTimeout(2500);
}

test.describe('Perspective column window', () => {
  test.slow();

  test('columns scrolled out of the band and back still carry values', async ({ page }) => {
    await openWindowVariant(page);

    // Retrying, not a one-shot read. Under a live feed a row can drop back to
    // a stub at any moment — a refresh invalidates loaded blocks — so reading
    // `textContent()` once races the very thing this surface does continuously.
    await expect(page.locator('.ag-cell[col-id="cusip"]').first()).not.toHaveText('', {
      timeout: 60_000,
    });

    // Far right — well past a 25-column pad, so the band is replaced and the
    // leading columns are no longer fetched.
    await scrollToColumn(page, FAR_RIGHT_COLUMN);
    await expect(
      page.locator(`.ag-cell[col-id="${FAR_RIGHT_COLUMN}"]`).first(),
    ).not.toHaveText('', { timeout: 60_000 });

    // Back. This is the assertion the whole feature turns on: a column the
    // window dropped must come back with REAL values, not blanks.
    await scrollToColumn(page, 'cusip');
    await expect(page.locator('.ag-cell[col-id="cusip"]').first()).not.toHaveText('', {
      timeout: 60_000,
    });
    // A second leading column, and deliberately NOT `assetClass`: the seeded
    // profile groups by it, and AG hides a column it is grouping on — so an
    // assertion there fails with "element not found" for a reason that has
    // nothing to do with the window.
    await expect(page.locator('.ag-cell[col-id="ticker"]').first()).not.toHaveText('', {
      timeout: 60_000,
    });
  });

  test('a far-right column reads a real number, not a blank', async ({ page }) => {
    await openWindowVariant(page);

    // Every column on this tab is a column of the BOOK, so a value here can only
    // have come from a fetch that included it. A window that failed to widen
    // would paint an empty cell with nothing logged anywhere.
    //
    // WAIT for it rather than reading once: a widen re-reads the loaded blocks,
    // and the cell is legitimately blank until they land. Reading immediately
    // after the scroll made this fail intermittently while the assertion in the
    // test above — which retries — passed on the same behaviour.
    const cell = page.locator(`.ag-cell[col-id="${FAR_RIGHT_COLUMN}"]`).first();
    await scrollToColumn(page, FAR_RIGHT_COLUMN);
    await expect(cell).not.toHaveText('', { timeout: 60_000 });
    const value = await cell.textContent();
    expect((value ?? '').trim()).not.toBe('');
    expect(Number((value ?? '').trim().replace(/,/g, ''))).not.toBeNaN();
  });

  test('grouping still aggregates, with the band far from the grouped column', async ({
    page,
  }) => {
    await openWindowVariant(page);

    await page.evaluate(() => {
      const api = (
        window as unknown as { __labApi(): Record<string, (...a: unknown[]) => void> }
      ).__labApi();
      api.setRowGroupColumns(['assetClass']);
      api.setValueColumns(['marketValue']);
      api.setColumnAggFunc('marketValue', 'sum');
    });
    await page.waitForTimeout(6000);

    // Back to the left edge. `openWindowVariant` scrolled `cusip` into view, so
    // the auto-group column — which AG inserts at display index 0 — is off
    // screen and its cells are not in the DOM at all. Same virtualisation trap
    // as the readiness check.
    await scrollToColumn(page, 'ag-Grid-AutoColumn');

    // The group key comes from `__ROW_PATH__`, which a narrowed View still
    // returns (measured in `columnWindowProbe.mjs`) — but only the painted cell
    // proves the remap survived the window.
    await expect(page.locator('.ag-cell[col-id="ag-Grid-AutoColumn"]').first()).not.toHaveText(
      '',
      { timeout: 60_000 },
    );

    // The totals. An aggregate is present in the output ONLY when its column is
    // listed in the window, so this is the assertion that catches the union of
    // value columns being dropped.
    await scrollToColumn(page, 'marketValue');
    await expect(page.locator('.ag-cell[col-id="marketValue"]').first()).not.toHaveText('', {
      timeout: 60_000,
    });
  });

  test('an export still carries every column the book has', async ({ page }) => {
    await openWindowVariant(page);

    // Narrow the book to one instrument first: the export path materializes
    // every row it is given, and 50,000 x 50 in a test would measure the
    // harness rather than the feature.
    const cusip = (
      await page.locator('.ag-cell[col-id="cusip"]').first().textContent()
    )?.trim();
    expect(cusip).toBeTruthy();

    const width = await page.evaluate(async (id) => {
      const api = (
        window as unknown as {
          __labApi(): {
            setFilterModel(m: unknown): void;
            getGridOption(k: string): {
              serverEngineHolder?: {
                get(): { readAllRows(): Promise<Record<string, unknown>[] | null> } | null;
              };
            };
          };
        }
      ).__labApi();
      api.setFilterModel({ cusip: { filterType: 'text', type: 'equals', filter: id } });
      await new Promise((r) => setTimeout(r, 4000));
      const engine = api.getGridOption('context')?.serverEngineHolder?.get?.();
      const rows = await engine?.readAllRows();
      return rows && rows.length > 0 ? Object.keys(rows[0]).length : 0;
    }, cusip);

    // Every field the Table declares — 121 for this book, plus the calculated
    // columns the seeded profile publishes as expression columns. The window at
    // this scroll position is a fraction of that, so an export narrowed to it
    // would come back around 30.
    expect(width).toBeGreaterThan(100);
  });
});
