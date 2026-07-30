import { test, expect, type Page } from '@playwright/test';
import { openViewMenu, closeViewMenu } from './helpers/viewMenu';

/**
 * The Perspective surface, driven by real user input.
 *
 * This spec exists because of a specific, repeated failure: every "unverified"
 * item on this path failed for the same reason, and it was never the feature.
 * Synthetic `PointerEvent` clicks dispatched from page JavaScript do not drive
 * the formatting-toolbar `Pill` handlers or open a collapsed settings section —
 * **on either surface**, CSRM included. Two "the formatter is broken" findings
 * evaporated when the CSRM twin was checked with the same technique. Playwright
 * dispatches real input, so it is the only thing that can settle them.
 *
 * What is covered, in the order the worklog wanted it:
 *   1. The surface mounts over the whole book (so a later failure is not
 *      ambiguous between "feature broken" and "grid never loaded").
 *   2. Formatting-toolbar actions APPLY and PERSIST across a reload.
 *   3. Auto Format.
 *   4. The alerts "Rescan full book" control — whose settings section would not
 *      even expand under a synthetic click.
 *
 * DOM notes specific to this surface, both of which cost time before they were
 * written down:
 *   - `.ag-body-viewport .ag-row` and `.ag-center-cols-container .ag-cell` do
 *     NOT exist in this AG Grid 36 DOM — both match zero elements. Query
 *     `.ag-row` and `.ag-cell`. The shared demo specs use the longer forms and
 *     would hang here forever.
 *   - Rows arrive long after the grid mounts (the fixture's snapshot is ~18 s),
 *     so readiness is the status bar reporting the book, not the first row.
 */

const GRID_ID = 'perspective-blotter';

/**
 * Ready = the status bar reports a loaded book.
 *
 * Deliberately not "the first row rendered": this window opens against a Table
 * that is still filling, and a grid showing 100 rows of an incoming 20,000 is
 * not yet in a state where a full-book assertion means anything. The status bar
 * reads the worker-held Table, so it is the honest signal — and it is a visible
 * effect, which is what the suite's conventions ask for.
 */
async function waitForPerspectiveGrid(page: Page): Promise<void> {
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 60_000 });
  await expect(page.locator('.ag-status-bar')).toContainText(/[\d,]+ rows/, {
    timeout: 90_000,
  });
  await page.waitForSelector('.ag-row', { timeout: 60_000 });
}

/**
 * Wipe this app's persisted grid state.
 *
 * The provider config is deliberately NOT wiped: the demo seeds it on boot and
 * removing it would make every test pay a re-seed. Only the profile/module
 * state a test might have written is cleared.
 */
async function clearGridState(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('gc-active-profile:') ||
          k.startsWith('gc-state:') ||
          k.startsWith('ds-grid:'),
      )
      .forEach((k) => localStorage.removeItem(k));
  });
}

async function bootClean(page: Page): Promise<void> {
  await page.goto('/');
  await waitForPerspectiveGrid(page);
  await clearGridState(page);
  await page.goto('/');
  await waitForPerspectiveGrid(page);
}

/** Open the pinned FormattingToolbar via the View menu. Idempotent. */
async function openFormattingToolbar(page: Page): Promise<void> {
  const toolbar = page.locator('[data-testid="formatting-toolbar"]');
  if (await toolbar.isVisible().catch(() => false)) return;
  await openViewMenu(page);
  await page.locator('[data-testid="style-toolbar-toggle"]').click();
  await expect(toolbar).toBeVisible({ timeout: 10_000 });
}

/** The column id of the first data cell — whichever column the demo puts first. */
async function firstDataColId(page: Page): Promise<string> {
  const colId = await page.evaluate(() => {
    for (const cell of document.querySelectorAll('.ag-row .ag-cell')) {
      const id = cell.getAttribute('col-id');
      // Skip AG's own selection/expand gutter, which carries no data.
      if (id && !id.startsWith('ag-Grid')) return id;
    }
    return '';
  });
  expect(colId, 'no data column found in the rendered rows').toBeTruthy();
  return colId;
}

async function selectCell(page: Page, colId: string, rowIndex = 0): Promise<void> {
  await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`).click();
  // `useActiveColumns` subscribes through the ApiHub; let React batch.
  await expect(page.getByRole('button', { name: 'Bold' })).toBeEnabled({ timeout: 10_000 });
}

async function cellStyle(
  page: Page,
  colId: string,
  prop: string,
  rowIndex = 0,
): Promise<string> {
  return page.evaluate(
    ({ id, row, p }) => {
      const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
      return cell ? getComputedStyle(cell).getPropertyValue(p) : '';
    },
    { id: colId, row: rowIndex, p: prop },
  );
}

test.describe('Perspective surface', () => {
  test.beforeEach(async ({ page }) => {
    await bootClean(page);
  });

  /**
   * The baseline. Without it, every failure below is ambiguous between the
   * feature being broken and the book never having arrived — which on this
   * path is a real and frequent possibility.
   */
  test('mounts over the whole worker-held book', async ({ page }) => {
    await expect(page.locator('.ag-status-bar')).toContainText('20,000 rows');
    expect(await page.locator('.ag-row').count()).toBeGreaterThan(0);
    // The status bar reads the Table, not the loaded blocks — a stock AG panel
    // would report the ~100 rows this window holds.
    await expect(page.locator('.ag-status-bar')).toContainText('live');
  });

  test('formatting toolbar enables once a cell is selected', async ({ page }) => {
    await openFormattingToolbar(page);
    await expect(page.getByRole('button', { name: 'Bold' })).toBeDisabled();
    await selectCell(page, await firstDataColId(page));
    await expect(page.getByRole('button', { name: 'Bold' })).toBeEnabled();
  });

  /**
   * THE test this spec was written for. That the buttons enable was already
   * known; that clicking one applies was not, on either surface.
   */
  test('Bold applies font-weight to the column', async ({ page }) => {
    await openFormattingToolbar(page);
    const colId = await firstDataColId(page);
    await selectCell(page, colId);

    await page.getByRole('button', { name: 'Bold' }).click();

    await expect
      .poll(() => cellStyle(page, colId, 'font-weight'), { timeout: 10_000 })
      .toMatch(/^(700|bold)$/);
  });

  test('Right applies text-align to the column', async ({ page }) => {
    await openFormattingToolbar(page);
    const colId = await firstDataColId(page);
    await selectCell(page, colId);

    await page.getByRole('button', { name: 'Right' }).click();

    await expect
      .poll(() => cellStyle(page, colId, 'text-align'), { timeout: 10_000 })
      .toBe('right');
  });

  /**
   * Applying and persisting are different claims, and the second is the one
   * that matters for a blotter: a format that survives only until the next
   * refresh is worse than none. This reloads the page, which on this path also
   * re-drives the datasource against the worker-held Table.
   */
  test('a formatting change survives a reload', async ({ page }) => {
    await openFormattingToolbar(page);
    const colId = await firstDataColId(page);
    await selectCell(page, colId);
    await page.getByRole('button', { name: 'Bold' }).click();
    await expect
      .poll(() => cellStyle(page, colId, 'font-weight'), { timeout: 10_000 })
      .toMatch(/^(700|bold)$/);

    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(1_000);

    await page.reload();
    await waitForPerspectiveGrid(page);

    await expect
      .poll(() => cellStyle(page, colId, 'font-weight'), { timeout: 30_000 })
      .toMatch(/^(700|bold)$/);
  });

  /**
   * Auto Format reaches the live grid through the GridPlatform — the seam that
   * was entirely dead on this surface until `resolveGridSurface` landed, and
   * which nothing has driven with a real click since.
   *
   * Asserted as RESTORE rather than apply, which took two wrong premises to
   * arrive at. The demo's numeric columns already carry the catalog's format on
   * load (`quantity` renders `7.2K`, right-aligned), so a bare Auto Format
   * click has nothing to change and no observable effect — the test would pass
   * or fail for reasons unrelated to the button. And AG virtualises columns, so
   * at the default viewport only the seven leading TEXT columns are in the DOM
   * and no numeric column is measurable at all. Hence: widen so every column
   * renders, deliberately break one column's alignment through the formatting
   * toolbar, then require Auto Format to put it back.
   */
  test('Auto Format re-applies the catalog to a column that deviates from it', async ({
    page,
  }) => {
    // 5,050px is the grid's full scrollWidth on this demo — wide enough that
    // AG renders every column, so a numeric one is measurable. Programmatic
    // `scrollLeft` and synthetic wheel events both leave AG's column
    // virtualisation untouched, so widening is the only reliable route.
    await page.setViewportSize({ width: 5200, height: 900 });
    await page.waitForTimeout(1_000);

    const NUMERIC = 'quantity';
    const alignOf = () => cellStyle(page, NUMERIC, 'text-align');
    await expect.poll(alignOf, { timeout: 20_000 }).toBe('right');

    await openFormattingToolbar(page);
    await selectCell(page, NUMERIC);
    await page.getByRole('button', { name: 'Left' }).click();
    await expect.poll(alignOf, { timeout: 10_000 }).toBe('left');

    await openViewMenu(page);
    await page.locator('[data-testid="auto-format-btn"]').click();
    await closeViewMenu(page).catch(() => {});

    await expect.poll(alignOf, { timeout: 20_000 }).toBe('right');
  });

  /**
   * The alerts full-book rescan. Its settings section is collapsed, and a
   * synthetic click would not even expand it — which is exactly why this
   * item sat unverified.
   *
   * The rescan block is gated on the grid running a SERVER-side engine
   * (`isServerSideEngine`), and it was gated on `=== 'ssrm'` until recently,
   * so its mere presence here is half the assertion.
   */
  test('alerts full-book rescan is offered and runs', async ({ page }) => {
    await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await expect(page.locator('.ds-sheet')).toBeVisible({ timeout: 15_000 });

    // The nav is a grouped menubar. `v2-settings-nav-alerts` looks like the
    // item but is a 1x1px opacity-0 shim sitting under the sheet header, so
    // clicking it is intercepted forever; the real path is the group trigger
    // then the menu item it reveals.
    await page.locator('[data-testid="v2-settings-nav-group-styling"]').first().click();
    await page.locator('[data-testid="v2-settings-nav-menu-alerts"]').first().click();
    await expect(page.locator('[data-testid="alerts-panel"]').first()).toBeVisible({ timeout: 15_000 });

    // THE step that could not be taken before: the settings band is collapsed,
    // and a synthetic click does not open it.
    await page.locator('[data-testid="alerts-global-settings"]').first().click();
    await expect(page.locator('[data-testid="alerts-settings-band"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Offered at all = the panel recognised this as a server-side engine. It
    // was gated on `=== 'ssrm'` until recently, which read the Perspective
    // path as CSRM and hid this block entirely, so its presence is half the
    // assertion.
    await expect(page.locator('[data-testid="alerts-ssrm-fullbook"]').first()).toBeVisible({
      timeout: 10_000,
    });

    const rescan = page.locator('[data-testid="alerts-rescan-full-book"]').first();
    await expect(rescan).toBeVisible();
    await rescan.click();

    // What is pinned here is that a real click reaches the handler and the
    // handler answers — the whole reason this item sat unverified.
    //
    // The count is legitimately 0: `seedAlertBaselinesFromRows` returns early
    // when no enabled dataChange/relativeChange rule exists, and this demo
    // seeds no alert rules. Driving it to a non-zero count means creating,
    // configuring and SAVING a rule, which tests the alerts editor rather than
    // this surface; the seeding itself is unit-tested against explicit rows.
    await expect(page.locator('[data-testid="alerts-rescan-full-book-msg"]').first()).toContainText(
      /Seeded baselines for/,
      { timeout: 60_000 },
    );
  });
});
