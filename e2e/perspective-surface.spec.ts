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

/** Open the pinned EditingToolbar via the View menu. Idempotent. */
async function openEditingToolbar(page: Page): Promise<void> {
  const toolbar = page.locator('[data-testid="editing-toolbar-pinned"]');
  if (await toolbar.isVisible().catch(() => false)) return;
  await openViewMenu(page);
  await page.locator('[data-testid="editing-toolbar-toggle"]').click();
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

/**
 * The rendered text of a cell, addressed by its ROW KEY rather than its index.
 *
 * Index addressing is not safe across a reload on this surface: the row model
 * is rebuilt from the worker-held Table and nothing promises the same row lands
 * at the same index. `positionId` is the Table's index column, so it is the one
 * handle that means the same row before and after.
 */
async function cellTextByKey(page: Page, key: string, colId: string): Promise<string | null> {
  return page.evaluate(
    ({ k, id }) => {
      for (const row of document.querySelectorAll('.ag-row')) {
        const keyCell = row.querySelector('.ag-cell[col-id="positionId"]');
        if (keyCell?.textContent?.trim() !== k) continue;
        // The row is split across pinned/centre containers, so the key and the
        // target column can live in DIFFERENT `.ag-row` elements sharing a
        // row-index. Fall back to the index once the key has identified it.
        const inSameRow = row.querySelector(`.ag-cell[col-id="${id}"]`);
        if (inSameRow) return inSameRow.textContent?.trim() ?? '';
        const rowIndex = row.getAttribute('row-index');
        const cell = document.querySelector(
          `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${id}"]`,
        );
        return cell?.textContent?.trim() ?? '';
      }
      return null;
    },
    { k: key, id: colId },
  );
}

/**
 * Widen until `colId` is actually in the DOM.
 *
 * AG virtualises columns, so at the default viewport only the leading TEXT
 * columns render and a numeric one is not queryable at all. Resizing starts a
 * re-virtualisation that a fixed wait sometimes loses to — waiting on the cell
 * itself is the only form of this that does not flake.
 */
async function widenUntilRendered(page: Page, colId: string): Promise<void> {
  // 5,200px clears the grid's full 5,050px scrollWidth on this demo.
  await page.setViewportSize({ width: 5200, height: 900 });
  await page
    .locator(`.ag-row .ag-cell[col-id="${colId}"]`)
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 });
}

/**
 * The key AND the value at `rowIndex`, read in ONE pass over the DOM.
 *
 * Two separate reads are not equivalent and did flake: widening the viewport
 * re-virtualises, and a row sampled between the two reads can be gone by the
 * second — the key came back fine and the value came back null. One evaluate is
 * one snapshot, so the pair is always consistent or absent together.
 */
async function readRowAt(
  page: Page,
  rowIndex: number,
  colId: string,
): Promise<{ key: string; text: string } | null> {
  return page.evaluate(
    ({ row, id }) => {
      const sel = `.ag-row[row-index="${row}"]`;
      const key = document.querySelector(`${sel} .ag-cell[col-id="positionId"]`)?.textContent?.trim();
      const text = document.querySelector(`${sel} .ag-cell[col-id="${id}"]`)?.textContent?.trim();
      return key && text ? { key, text } : null;
    },
    { row: rowIndex, id: colId },
  );
}

/** Poll `readRowAt` until the grid holds still long enough to answer both. */
async function pickRow(
  page: Page,
  rowIndex: number,
  colId: string,
): Promise<{ key: string; text: string }> {
  // Keep what the poll SAW. Re-reading after it succeeds is another sample of a
  // grid that is still repainting under the feed, and it can miss — which is
  // the same mistake as reading the key and the value separately, one level up.
  let seen: { key: string; text: string } | null = null;
  await expect
    .poll(
      async () => {
        seen = await readRowAt(page, rowIndex, colId);
        return seen;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  expect(seen, `no ${colId} rendered at row ${rowIndex}`).not.toBeNull();
  return seen!;
}

/**
 * Unlock a column for editing through the formatting toolbar's own pill.
 *
 * NEITHER demo ships an editable column — MEASURED on both, every colDef in
 * this app and in the CSRM twin carries `editable: false`. So the editing
 * toolbars have nothing to target until something unlocks a column, and
 * `collectTargetCells` skips a non-editable one outright. Doing it through the
 * pill rather than by changing demo config keeps this a test of the product's
 * own affordance, and it is the flow a user actually has.
 */
async function unlockColumnForEditing(page: Page, colId: string): Promise<void> {
  await openFormattingToolbar(page);
  await selectCell(page, colId);
  const toggle = page.locator('[data-testid="formatting-toggle-editable"]');
  await expect(toggle).toBeEnabled({ timeout: 10_000 });
  // `Pill` reports its state as `aria-pressed`; it has no `data-active`.
  if ((await toggle.getAttribute('aria-pressed')) === 'true') return;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
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
   * ── Editing toolbar ────────────────────────────────────────────────────
   *
   * The last item the spec did not cover. The write plumbing was already
   * verified (edits reach the worker-held Table, coalesced, flushed on close);
   * what had never been driven is the toolbars themselves — the same class of
   * thing synthetic clicks were wrong about for the formatting toolbar.
   *
   * Three properties of this path make the reload assertion possible at all,
   * and all three are load-bearing:
   *
   *   - **The sweep does not touch `quantity`.** `touchPosition` rewrites
   *     exactly `currentPrice`, `marketValue`, `totalValue`, `pnl` and
   *     `asOfDate` every few seconds. An edit to any of those is erased in
   *     ~6.5 s — a raw `table.update()` bypassing all our code is erased
   *     identically — so a "survives a reload" test on one of them would be
   *     testing the fixture. `quantity` is numeric, which smart edit requires,
   *     and untouched.
   *   - **The Table outlives the window**, so a reload re-attaches to the same
   *     book rather than refetching one.
   *   - **…but only while SOME window holds it.** MEASURED, and the reason
   *     these tests open a peer page: reloading as the *sole* window drops the
   *     provider to zero attachments, and the next attach restarts it and
   *     re-snapshots the book — the edit reverts to the broker's pristine value
   *     (987,654 → 7,154). With a peer page open across the reload it survives
   *     intact. That is provider lifecycle, not the edit path: ANY Table
   *     content goes the same way, including a raw `table.update()`. The peer
   *     is not scaffolding to make a test pass — holding the book open is what
   *     a desk with more than one blotter actually does, and the peer reading
   *     the edit is the stronger claim of the two.
   *
   * Every column in this demo — and in the CSRM twin — ships `editable: false`,
   * so each test unlocks its column through the formatting toolbar first. Both
   * modules' `confirmThreshold` is 50, so the cell counts below apply without a
   * confirmation dialog; a dialog appearing means a default changed.
   */
  test('the editing toolbar offers smart edit and bulk update on this surface', async ({
    page,
  }) => {
    await openEditingToolbar(page);

    await expect(page.locator('[data-testid="smart-edit-toolbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="bulk-update-toolbar"]')).toBeVisible();
    // Smart edit is gated on an SSRM capability phase. If the gate read this
    // surface as under-provisioned it would render a tooltip stub in place of
    // the controls, so the operand input's presence is the assertion.
    await expect(page.locator('[data-testid="se-ssrm-gate-message"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="smart-edit-operand"]')).toBeVisible();
  });

  test('smart edit reaches the shared book, and the edit survives a reload', async ({
    page,
    context,
  }) => {
    const COL = 'quantity';
    await widenUntilRendered(page, COL);

    const { key, text: before } = await pickRow(page, 0, COL);

    await unlockColumnForEditing(page, COL);
    await openEditingToolbar(page);

    // Re-select after opening the toolbar: mounting it shifts the grid, and
    // smart edit acts on the CURRENT selection, not the one that unlocked it.
    await selectCell(page, COL);
    await expect(page.locator('[data-testid="smart-edit-op-multiply"]')).toBeEnabled({
      timeout: 10_000,
    });

    await page.locator('[data-testid="smart-edit-operand"]').fill('2');
    await page.locator('[data-testid="smart-edit-op-multiply"]').click();

    await expect
      .poll(() => cellTextByKey(page, key, COL), { timeout: 20_000 })
      .not.toBe(before);
    const after = await cellTextByKey(page, key, COL);

    // A peer blotter on the same SharedWorker. This is the claim that matters
    // for a shared book: a window that never saw the edit reads the edited
    // value, because there is one Table and this wrote to it. Until the engine
    // applier landed, smart edit changed nothing at all here — it reported the
    // right cell count and ran its handler, silently.
    const peer = await context.newPage();
    await peer.goto('/');
    await waitForPerspectiveGrid(peer);
    await widenUntilRendered(peer, COL);
    await expect.poll(() => cellTextByKey(peer, key, COL), { timeout: 30_000 }).toBe(after);

    // …and survives this window going away and coming back. The peer stays
    // open across the reload deliberately — see the block comment above.
    await page.reload();
    await waitForPerspectiveGrid(page);
    await widenUntilRendered(page, COL);
    await expect.poll(() => cellTextByKey(page, key, COL), { timeout: 30_000 }).toBe(after);

    await peer.close();
  });

  test('bulk update sets a range, and the edit survives a reload', async ({ page, context }) => {
    const COL = 'quantity';
    await widenUntilRendered(page, COL);

    const picked = [
      await pickRow(page, 0, COL),
      await pickRow(page, 1, COL),
      await pickRow(page, 2, COL),
    ];
    const keys = picked.map((r) => r.key);
    const before = picked[0]!.text;

    await unlockColumnForEditing(page, COL);
    await openEditingToolbar(page);

    // A three-row range in ONE column — both modules enforce single-column
    // selection by default, and a multi-column range disables Apply instead of
    // narrowing silently.
    await page.locator(`.ag-row[row-index="0"] .ag-cell[col-id="${COL}"]`).first().click();
    await page
      .locator(`.ag-row[row-index="2"] .ag-cell[col-id="${COL}"]`)
      .first()
      .click({ modifiers: ['Shift'] });
    await expect(page.locator('[data-testid="bulk-update-count"]')).toContainText('3 selected', {
      timeout: 10_000,
    });

    await page.locator('[data-testid="bulk-update-value-input"]').fill('4242');
    const apply = page.locator('[data-testid="bulk-update-apply"]');
    await expect(apply).toBeEnabled({ timeout: 10_000 });
    await apply.click();

    // Asserted as CONVERGENCE rather than against the literal, so the test does
    // not depend on the column's number format: three independently random rows
    // arriving at one identical value is the signal a bulk set leaves, and only
    // a bulk set leaves it.
    await expect
      .poll(() => cellTextByKey(page, keys[0]!, COL), { timeout: 20_000 })
      .not.toBe(before);
    const applied = await cellTextByKey(page, keys[0]!, COL);
    for (const key of keys.slice(1)) {
      await expect.poll(() => cellTextByKey(page, key, COL), { timeout: 20_000 }).toBe(applied);
    }

    const peer = await context.newPage();
    await peer.goto('/');
    await waitForPerspectiveGrid(peer);
    await widenUntilRendered(peer, COL);

    await page.reload();
    await waitForPerspectiveGrid(page);
    await widenUntilRendered(page, COL);

    // All three rows, not just the one that proved the write landed — a bulk
    // update that persisted one cell of three would be worse than none.
    for (const key of keys) {
      await expect.poll(() => cellTextByKey(page, key, COL), { timeout: 30_000 }).toBe(applied);
    }

    await peer.close();
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
