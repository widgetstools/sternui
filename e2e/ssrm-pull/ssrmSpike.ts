/**
 * Shared harness for the SSRM pull-plane e2e suite
 * (`playwright.ssrm.config.ts`).
 *
 * Every spec drives the lab grid spike (`/spikes/ssrmGrid.html`) through
 * its deliberate probe surface `window.__ssrmGridSpike` — DatasetState
 * timeline, mount counter, displayed-row readers, control-table reads —
 * so assertions are about the published dataset lifecycle and the real
 * grid DOM, never about timers.
 *
 * Determinism conventions:
 * • Row counts / tick rates ride the spike's URL knobs; the feed server
 *   clamps snapshot rows to [1000, 20000].
 * • Exactness assertions against a live feed use a QUIET-WINDOW
 *   SANDWICH (`sandwichedControlCount`): control-read → probe-read →
 *   control-read, retried until the two control reads agree, so a tick
 *   landing mid-assertion can never fail the spec.
 */

import { expect, type Page } from '@playwright/test';

// Group-row stamps (values mirror `@starui/ssrm-grid/pull` groupRows.ts —
// asserted against row DATA the spike returns, so literals keep this
// harness free of package imports the e2e tsconfig doesn't resolve).
export const CHILD_COUNT_FIELD = '__ssrmChildCount';
export const GROUP_KEY_FIELD = '__ssrmGroupKey';

export interface DatasetState {
  phase: 'connecting' | 'seeding' | 'live' | 'empty' | 'error';
  rowCount: number;
  generation: number;
  error?: string;
}

export interface TimelineEntry extends DatasetState {
  at: number;
}

export interface SpikeOpts {
  rows: number;
  /** Live ticks per second. Default 5. */
  rate?: number;
  /** Rows mutated per tick. Default 500. */
  upt?: number;
  /** Serve the config's treePathFields as a serverSide tree. */
  tree?: boolean;
  /**
   * Column set. Defaults to the curated 8 (`basic`) so specs stay
   * deterministic: the spike's interactive default is `all`, which
   * declares no columns and lets the worker discover the feed's whole
   * record (~40 fields slim, ~160 wide). At that width AG virtualizes
   * columns horizontally, so a cell read for an off-screen column
   * silently finds nothing. Pass 'all' deliberately when that is the
   * thing under test.
   */
  cols?: 'basic' | 'all';
}

export function spikeUrl(opts: SpikeOpts): string {
  const q = new URLSearchParams({
    rows: String(opts.rows),
    rate: String(opts.rate ?? 5),
    upt: String(opts.upt ?? 500),
    cols: opts.cols ?? 'basic',
  });
  if (opts.tree) q.set('tree', '1');
  return `/spikes/ssrmGrid.html?${q.toString()}`;
}

/** Navigate to the spike and wait for the probe surface to exist. */
export async function openSpike(page: Page, opts: SpikeOpts): Promise<void> {
  await page.goto(spikeUrl(opts));
  await page.waitForFunction(
    () => (window as never as SpikeWindow).__ssrmGridSpike !== undefined,
    undefined,
    { timeout: 60_000 },
  );
}

/**
 * Wait until DatasetState is `live` at exactly `rows` for `generation`,
 * then return the snapshot. This is the worker-owned lifecycle — the
 * grid mounts off it, so it is THE "seed finished" signal.
 */
export async function waitForLive(
  page: Page,
  rows: number,
  o: { generation?: number; timeoutMs?: number } = {},
): Promise<DatasetState> {
  const generation = o.generation ?? 1;
  await page.waitForFunction(
    ({ rows: r, generation: g }) => {
      const s = (window as never as SpikeWindow).__ssrmGridSpike.state();
      return s !== null && s.phase === 'live' && s.rowCount === r && s.generation === g;
    },
    { rows, generation },
    { timeout: o.timeoutMs ?? 90_000, polling: 100 },
  );
  return (await state(page))!;
}

/** Wait until the grid has actually mounted and shows ≥ `rows` rows. */
export async function waitForGridRows(
  page: Page,
  rows: number,
  timeoutMs = 60_000,
): Promise<void> {
  await page.waitForFunction(
    (r) => (window as never as SpikeWindow).__ssrmGridSpike.displayedRowCount() >= r,
    rows,
    { timeout: timeoutMs, polling: 100 },
  );
}

// ─── thin probe wrappers ────────────────────────────────────────────

interface SpikeProbes {
  timeline: TimelineEntry[];
  mounts: number;
  state(): DatasetState | null;
  displayedRowCount(): number;
  viewportColumn(colId: string, n?: number): unknown[];
  sortBy(colId: string, dir: 'asc' | 'desc' | null): void;
  groupBy(colId: string | null): void;
  groupByLevels(colIds: string[], valueCols: Array<{ colId: string; aggFunc: string }>): void;
  scrollToIndex(i: number): void;
  renderedCell(rowIndex: number, colId: string): string | null;
  renderedRowCount(): number;
  displayedRow(i: number): Record<string, unknown> | null;
  expandDisplayedRow(i: number, expanded: boolean): void;
  grandTotalData(): Record<string, unknown> | null;
  setQuickFilter(text: string | null): void;
  getDistinctValues(field: string): Promise<unknown[]>;
  countRows(filter: Array<[string, string, unknown]>): Promise<number>;
  loadingRowCount(): number;
  loadingOverlayVisible(): boolean;
  restart(): Promise<DatasetState>;
  setCellValue(i: number, field: string, value: unknown): boolean;
  queryAllRows(columns?: string[]): Promise<Record<string, unknown>[]>;
  readRowByKey(key: unknown): Promise<Record<string, unknown> | null>;
}

interface SpikeWindow {
  __ssrmGridSpike: SpikeProbes;
}

export function state(page: Page): Promise<DatasetState | null> {
  return page.evaluate(() => (window as never as SpikeWindow).__ssrmGridSpike.state());
}

export function timeline(page: Page): Promise<TimelineEntry[]> {
  return page.evaluate(() => (window as never as SpikeWindow).__ssrmGridSpike.timeline);
}

export function mounts(page: Page): Promise<number> {
  return page.evaluate(() => (window as never as SpikeWindow).__ssrmGridSpike.mounts);
}

export function displayedRowCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as never as SpikeWindow).__ssrmGridSpike.displayedRowCount(),
  );
}

export function displayedRow(page: Page, i: number): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    (idx) => (window as never as SpikeWindow).__ssrmGridSpike.displayedRow(idx),
    i,
  );
}

export function viewportColumn(page: Page, colId: string, n = 10): Promise<unknown[]> {
  return page.evaluate(
    (a: { colId: string; n: number }) =>
      (window as never as SpikeWindow).__ssrmGridSpike.viewportColumn(a.colId, a.n),
    { colId, n },
  );
}

export function loadingRowCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as never as SpikeWindow).__ssrmGridSpike.loadingRowCount(),
  );
}

export function loadingOverlayVisible(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as never as SpikeWindow).__ssrmGridSpike.loadingOverlayVisible(),
  );
}

export function groupBy(page: Page, colId: string | null): Promise<void> {
  return page.evaluate(
    (c) => (window as never as SpikeWindow).__ssrmGridSpike.groupBy(c),
    colId,
  );
}

/** Multi-level grouping with explicit aggregations; level order is fixed. */
export function groupByLevels(
  page: Page,
  colIds: string[],
  valueCols: Array<{ colId: string; aggFunc: string }>,
): Promise<void> {
  return page.evaluate(
    (a: { colIds: string[]; valueCols: Array<{ colId: string; aggFunc: string }> }) =>
      (window as never as SpikeWindow).__ssrmGridSpike.groupByLevels(a.colIds, a.valueCols),
    { colIds, valueCols },
  );
}

/**
 * Rendered cell TEXT at a displayed row index.
 *
 * Deliberately the DOM and not `getDisplayedRowAtIndex().data`: this repo
 * has been burned by a row MODEL that read correctly while the screen
 * painted stale values, so a ticking assertion is only worth anything if
 * it reads what the user sees.
 */
export function renderedCell(
  page: Page,
  rowIndex: number,
  colId: string,
): Promise<string | null> {
  return page.evaluate(
    (a: { rowIndex: number; colId: string }) =>
      (window as never as SpikeWindow).__ssrmGridSpike.renderedCell(a.rowIndex, a.colId),
    { rowIndex, colId },
  );
}

/**
 * Churn leaf blocks by jumping the viewport around.
 *
 * This is the PRECONDITION for the group-level starvation bug, not
 * decoration: the tick sweep refetches only the most-recently-used
 * blocks, so a group level only falls out of that window once enough
 * leaf blocks have been loaded. Without this a spec passes even with the
 * bug reintroduced — verified.
 */
export async function churnLeafBlocks(
  page: Page,
  indices: number[],
  settleMs = 350,
): Promise<void> {
  for (const index of indices) {
    await page.evaluate(
      (i) => (window as never as SpikeWindow).__ssrmGridSpike.scrollToIndex(i),
      index,
    );
    await page.waitForTimeout(settleMs);
  }
}

export function renderedRowCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as never as SpikeWindow).__ssrmGridSpike.renderedRowCount(),
  );
}

/**
 * Wait until a rendered cell has non-empty text, and return it.
 *
 * A group row is painted before its aggregate arrives, so reading the
 * cell the moment the row exists yields "". Waiting for a real value
 * also makes the tick assertion below meaningful — "" -> "123" is a
 * first paint, not a tick.
 */
export async function waitForCellText(
  page: Page,
  rowIndex: number,
  colId: string,
  opts: { timeoutMs?: number; label?: string } = {},
): Promise<string> {
  return pollUntil(
    async () => {
      const text = await renderedCell(page, rowIndex, colId);
      return text !== null && text.trim() !== '' ? text : null;
    },
    {
      timeoutMs: opts.timeoutMs ?? 60_000,
      intervalMs: 200,
      label: opts.label ?? `cell(${rowIndex}, ${colId}) never painted a value`,
    },
  );
}

/**
 * Wait until a rendered cell's text CHANGES from what it is now, and
 * return both values. This is the live-ticking assertion: it proves the
 * painted aggregate moved, not merely that a transaction was issued.
 */
export async function waitForCellToTick(
  page: Page,
  rowIndex: number,
  colId: string,
  opts: { timeoutMs?: number; label?: string } = {},
): Promise<{ before: string; after: string }> {
  // Anchor on a REAL value, so a first paint cannot be mistaken for a tick.
  const before = await waitForCellText(page, rowIndex, colId, {
    timeoutMs: opts.timeoutMs ?? 45_000,
  });
  const after = await pollUntil(
    async () => {
      const now = await renderedCell(page, rowIndex, colId);
      return now !== null && now !== before ? now : null;
    },
    {
      timeoutMs: opts.timeoutMs ?? 45_000,
      intervalMs: 250,
      label: opts.label ?? `cell(${rowIndex}, ${colId}) never changed from "${before}"`,
    },
  );
  return { before, after };
}

export function expandDisplayedRow(page: Page, i: number, expanded: boolean): Promise<void> {
  return page.evaluate(
    (a: { i: number; expanded: boolean }) =>
      (window as never as SpikeWindow).__ssrmGridSpike.expandDisplayedRow(a.i, a.expanded),
    { i, expanded },
  );
}

export function grandTotalData(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() =>
    (window as never as SpikeWindow).__ssrmGridSpike.grandTotalData(),
  );
}

export function getDistinctValues(page: Page, field: string): Promise<unknown[]> {
  return page.evaluate(
    (f) => (window as never as SpikeWindow).__ssrmGridSpike.getDistinctValues(f),
    field,
  );
}

/** CONTROL read: count rows of the hosted table under native clauses. */
export function countRows(
  page: Page,
  filter: Array<[string, string, unknown]>,
): Promise<number> {
  return page.evaluate(
    (f) => (window as never as SpikeWindow).__ssrmGridSpike.countRows(f),
    filter,
  );
}

export function restart(page: Page): Promise<DatasetState> {
  return page.evaluate(() => (window as never as SpikeWindow).__ssrmGridSpike.restart());
}

export function setCellValue(
  page: Page,
  i: number,
  field: string,
  value: unknown,
): Promise<boolean> {
  return page.evaluate(
    (a: { i: number; field: string; value: unknown }) =>
      (window as never as SpikeWindow).__ssrmGridSpike.setCellValue(a.i, a.field, a.value),
    { i, field, value },
  );
}

export function readRowByKey(
  page: Page,
  key: unknown,
): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    (k) => (window as never as SpikeWindow).__ssrmGridSpike.readRowByKey(k),
    key,
  );
}

export function queryAllRows(
  page: Page,
  columns?: string[],
): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (cols) => (window as never as SpikeWindow).__ssrmGridSpike.queryAllRows(cols ?? undefined),
    columns ?? null,
  );
}

// ─── quiet-window sandwich ──────────────────────────────────────────

/**
 * Read an exact expected value from the CONTROL plane while the feed is
 * live: control-count → probe → control-count, retried until both
 * control reads agree (no tick moved the ground truth mid-assertion).
 * Returns the agreed control count and the probe value captured inside
 * the quiet window.
 */
export async function sandwichedControlCount<T>(
  page: Page,
  filter: Array<[string, string, unknown]>,
  probe: () => Promise<T>,
  attempts = 5,
): Promise<{ control: number; probed: T }> {
  let last: { c1: number; c2: number } | null = null;
  for (let i = 0; i < attempts; i += 1) {
    const c1 = await countRows(page, filter);
    const probed = await probe();
    const c2 = await countRows(page, filter);
    if (c1 === c2) return { control: c1, probed };
    last = { c1, c2 };
  }
  throw new Error(
    `no quiet window after ${attempts} attempts (last control reads ${last?.c1} vs ${last?.c2})`,
  );
}

/**
 * Collect the displayed GROUP rows from the top of the grid. Row
 * grouping marks nodes with AG's `node.group`; TREE data does not, so
 * tree specs pass the plane's stamp (`GROUP_KEY_FIELD` presence) as
 * the predicate instead.
 */
export async function displayedGroupRows(
  page: Page,
  isGroup: (row: Record<string, unknown>) => boolean = (row) => row.__group === true,
  max = 50,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < max; i += 1) {
    const row = await displayedRow(page, i);
    if (!row || !isGroup(row)) break;
    rows.push(row);
  }
  return rows;
}

/**
 * Poll until the top-of-grid group rows are LOADED and stable: at
 * least `min` of them, every one carrying its child-count stamp, and
 * two consecutive reads agreeing on the length (block loads settle
 * asynchronously after a group/tree mode flips on).
 */
export async function stableGroupRows(
  page: Page,
  o: {
    min?: number;
    isGroup?: (row: Record<string, unknown>) => boolean;
    timeoutMs?: number;
  } = {},
): Promise<Array<Record<string, unknown>>> {
  return pollUntil(
    async () => {
      const first = await displayedGroupRows(page, o.isGroup);
      if (first.length < (o.min ?? 2)) return null;
      if (first.some((row) => row[CHILD_COUNT_FIELD] == null)) return null;
      const second = await displayedGroupRows(page, o.isGroup);
      return second.length === first.length ? first : null;
    },
    { timeoutMs: o.timeoutMs ?? 30_000, label: 'group rows to load and stabilize' },
  );
}

/** Poll until `probe` returns a truthy value; return it. */
export async function pollUntil<T>(
  probe: () => Promise<T | null | undefined | false>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 200;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value as T;
    if (Date.now() > deadline) {
      throw new Error(`pollUntil timed out after ${timeoutMs}ms${opts.label ? `: ${opts.label}` : ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Assert a timeline never entered `seeding`/`empty`/`error` (pure attach). */
export function expectAttachedWithoutReseed(entries: TimelineEntry[], generation = 1): void {
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry.phase, `timeline entry ${JSON.stringify(entry)}`).toBe('live');
    expect(entry.generation).toBe(generation);
  }
}
