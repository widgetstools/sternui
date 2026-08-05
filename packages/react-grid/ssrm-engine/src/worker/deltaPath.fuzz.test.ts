import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from '../engine.js';
import type { SsrmCalcColumnDef } from '../calcAst.js';
import { makeSsrmGetRowId } from '../datasource.js';
import { createSsrmRowPump, type SsrmRowPump } from '../rowPump.js';
import type { SsrmGetRowsRequest, SsrmRow, SsrmSchema } from '../types.js';
import { createSsrmWorkerHost } from './host.js';
import { SsrmEngineClient } from './SsrmEngineClient.js';

/**
 * Differential fuzz of the DELTA path — the whole of it.
 *
 * `engine.fuzz.test.ts` compares the engine against a brute-force oracle and is
 * the reason the engine's own incremental behaviour is trustworthy. It is also
 * not what this session was for. Sessions 1 and 2 put THREE lossy stages
 * between a write and the screen, and none of them is watched by that fuzz:
 *
 *   1. **the port** — a write applied in the worker reaches a window as a
 *      broadcast patch, not as a re-read;
 *   2. **viewport narrowing** — the host asks `engine.visibleKeys` and sends a
 *      window only the dirty rows inside its declared range;
 *   3. **the pump** — per-frame conflation keyed by row id and a time slice, so
 *      what AG is handed is neither the frames as they arrived nor all of them
 *      at once.
 *
 * A green fuzz that never crossed a port or a pump has not tested any of that.
 * So everything below runs over a real `MessageChannel` (which is what a
 * SharedWorker port is), through the real host, the real client and the real
 * pump, into a grid model built from AG 36's own transaction code.
 *
 * ## What the oracle may and may not assert
 *
 * The pump DROPS a patch for a row AG does not hold, deliberately and counted.
 * So the comparison is over the rows the grid HOLDS, never over the book —
 * getting that wrong makes a correct engine look broken.
 *
 * The viewport is the second honest loss. A row inside AG's block cache but
 * outside the declared viewport is not sent, by design, so it is stale until
 * the block is re-read. `staleByDesign` below tracks exactly those rows and
 * excludes them — and it is computed from the ENGINE's own `visibleKeys`, not
 * from what the host chose to send, so it cannot excuse a row the host should
 * have pushed and did not.
 *
 * ## Session 5: calculated columns are compared too, and one shape SORTS by one
 *
 * A patch is sparse — the two cells that moved — so a calculated column that
 * depends on one of them reached the window with its OLD value and sat there
 * until AG re-read the block. `host.publish` now re-stamps exactly the
 * calculated cells whose inputs the frame names, and the comparison below reads
 * every calculated cell of every held row against the engine, per frame.
 *
 * The `calc-sorted` shape is the reason this belongs here rather than in a unit
 * test. Frame 26 of session 3 found that narrowing a push by the POST-write
 * visible set alone drops the update for a row whose sort key just moved it out
 * of range — and the fix, narrowing by the union of both sides, has to keep
 * holding when the sort key is COMPUTED, where "the row moved" is a
 * consequence of an expression rather than of the cell that was written.
 */

const SCHEMA: SsrmSchema = {
  keyField: 'id',
  fields: [
    { field: 'id', type: 'string' },
    { field: 'desk', type: 'string' },
    { field: 'sector', type: 'string' },
    { field: 'px', type: 'number' },
    { field: 'qty', type: 'number' },
  ],
};

const DESKS = ['Rates', 'Credit', 'FX', null];
const SECTORS = ['Gov', 'IG', 'HY'];

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function makeRow(random: () => number, id: string): SsrmRow {
  return {
    id,
    desk: DESKS[Math.floor(random() * DESKS.length)],
    sector: SECTORS[Math.floor(random() * SECTORS.length)],
    px: random() < 0.15 ? null : Math.round(random() * 20000) / 100,
    qty: random() < 0.1 ? null : Math.floor(random() * 1000),
  };
}

/** Let the port deliver. A push is a message, and a message is a macrotask. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * AG Grid's server-side block cache, modelled from AG 36's own transaction code
 * rather than from what the pump happens to emit.
 *
 * The two behaviours that matter, both read out of
 * `ServerSideStore.applyTransaction`:
 *
 *   - `transaction.remove` entries are ROW DATA and are mapped through the
 *     grid's `getRowId` — `transaction.remove.map((data) => idFunc({ data }))`.
 *     A bare key therefore resolves to whatever `getRowId` makes of a string,
 *     and removes nothing;
 *   - `transaction.update` for an id the store does not hold is ignored, which
 *     is why the pump drops those rather than building them.
 */
function agGrid(keyField: string) {
  const held = new Map<string, SsrmRow>();
  const getRowId = makeSsrmGetRowId(keyField);
  let transactions = 0;

  return {
    held,
    transactions: () => transactions,
    /** A block AG asked for and got. */
    load(rows: readonly SsrmRow[]): void {
      for (const row of rows) held.set(getRowId({ data: row }), { ...row });
    },
    /** A sort, filter or group change purges the store. */
    purge(): void {
      held.clear();
    },
    grid: {
      getRowNode: (id: string) => {
        const data = held.get(id);
        return data === undefined ? null : { data };
      },
      applyServerSideTransaction(tx: { update?: unknown[]; remove?: unknown[] }) {
        transactions += 1;
        for (const data of tx.remove ?? []) held.delete(getRowId({ data: data as SsrmRow }));
        for (const data of tx.update ?? []) {
          const id = getRowId({ data: data as SsrmRow });
          if (!held.has(id)) continue;
          held.set(id, { ...(data as SsrmRow) });
        }
        return null;
      },
    },
  };
}

/** Flushes run when this says so, so a slice can be stopped and resumed. */
function manualSchedule() {
  const queue: Array<() => void> = [];
  return {
    schedule: (run: () => void) => {
      queue.push(run);
    },
    /** Run until nothing is scheduled — the "eventually correct" in the slice. */
    drain(pump: SsrmRowPump): number {
      let passes = 0;
      while (queue.length > 0) {
        const run = queue.shift()!;
        run();
        passes += 1;
        if (passes > 5_000) throw new Error('the pump never drained');
      }
      expect(pump.stats().pending, 'the pump left rows behind with nothing scheduled').toBe(0);
      return passes;
    },
  };
}

/** The query shapes a window pulls with, and the ones a tick has to survive. */
const SHAPES: { name: string; request: SsrmGetRowsRequest; grouped?: boolean }[] = [
  { name: 'flat', request: {} },
  { name: 'sorted', request: { sortModel: [{ colId: 'px', sort: 'desc' }] } },
  {
    name: 'filtered+sorted',
    request: {
      filterModel: { qty: { filterType: 'number', type: 'greaterThan', filter: 300 } },
      sortModel: [{ colId: 'qty', sort: 'asc' }],
    },
  },
  {
    // A COMPUTED sort key. `cBoth` moves whenever either half of a tick lands,
    // so a row crosses the viewport boundary for a reason no single written
    // cell names — which is frame 26's failure with one more level of
    // indirection between the write and the row's position.
    name: 'calc-sorted',
    request: { sortModel: [{ colId: 'cBoth', sort: 'desc' }] },
  },
  {
    name: 'grouped',
    grouped: true,
    request: {
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      valueCols: [{ id: 'qty', aggFunc: 'sum' }],
    },
  },
];

const lit = (value: number | string | boolean | null) => ({ type: 'literal' as const, value });
const col = (columnId: string) => ({ type: 'columnRef' as const, columnId });

/**
 * The calculated columns this fuzz carries, chosen for what they DEPEND on.
 *
 * `cBoth` moves on either half of a tick; `cQty` moves only on the qty half, so
 * a price frame must NOT re-stamp it (a cell AG is told changed flashes, and a
 * quantity flashing on a price tick is a lie the user can see); `cPx` carries
 * the null and the NaN through, because those are the two values a patch is
 * most likely to lose on the way.
 */
const CALC: SsrmCalcColumnDef[] = [
  { colId: 'cBoth', ast: { type: 'binary', operator: '+', left: col('px'), right: col('qty') } },
  { colId: 'cQty', ast: { type: 'binary', operator: '*', left: col('qty'), right: lit(2) } },
  {
    colId: 'cPx',
    ast: {
      type: 'call',
      name: 'IF',
      args: [
        { type: 'call', name: 'ISNOTNULL', args: [col('px')] },
        { type: 'binary', operator: '*', left: col('px'), right: lit(10) },
        lit(null),
      ],
    },
  },
];

const BLOCK = 20;
/** AG's cache is far larger than the viewport, which is the whole problem. */
const CACHED_BLOCKS = 3;

describe('the delta path — engine, port, viewport narrowing and pump', () => {
  it('agrees with a full re-read on every frame, across every query shape', async () => {
    const random = rng(0x5EED_1);
    const engine = createSsrmEngine({ schema: SCHEMA });
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }), sweepMs: 0 });

    const connect = () => {
      const channel = new MessageChannel();
      host.connect(channel.port2 as unknown as MessagePort);
      return channel.port1 as unknown as MessagePort;
    };

    const ids: string[] = [];
    const seed: SsrmRow[] = [];
    for (let i = 0; i < 300; i++) {
      const id = `r${i}`;
      ids.push(id);
      seed.push(makeRow(random, id));
    }
    engine.applySnapshot(seed);
    engine.setCalcColumns(CALC);
    // A REFUSED column is stamped nowhere and read nowhere, so every calculated
    // comparison below would be `undefined` against `undefined` and pass. That
    // is not hypothetical: session 4's first fuzz did exactly this for 30,000
    // assertions.
    expect(engine.calcDiagnostics().filter((d) => d.phase === 'compile')).toEqual([]);

    // Two windows: one applies the writes, one is the grid. The host never
    // echoes a write back to its author, so the viewer is the only one that can
    // be wrong — which is the topology a provider-fed book actually has.
    const writer = await SsrmEngineClient.open(connect(), 'book', { heartbeatMs: 0 });
    const viewer = await SsrmEngineClient.open(connect(), 'book', { heartbeatMs: 0 });

    const grid = agGrid('id');
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid.grid, {
      keyField: 'id',
      // Small enough that a burst always stops partway: the slice is only
      // tested if it actually fires, and a budget nothing reaches is not one.
      sliceBudgetMs: 0.000_001,
      schedule: clock.schedule,
    });
    viewer.subscribe((delta) => pump.push(delta));

    /** Rows the design permits to be stale — see the note at the top. */
    const staleByDesign = new Set<string>();
    /** Keys removed from the book, so a later frame can re-add one. */
    const graveyard: string[] = [];
    let shape = SHAPES[0];
    let viewportStart = 0;
    /** A tall grid shows what a short one caches, so both are run. */
    let viewportRows = BLOCK;
    /** Row-vs-book comparisons made. A fuzz that compared nothing is green. */
    let compared = 0;
    /** Calculated-cell comparisons. Same reason, and the same trap. */
    let calcCompared = 0;

    /**
     * The keys this window can SEE, asked of the engine directly.
     *
     * `null` means every key is visible, which is what a grouped request and an
     * undeclared viewport both mean. Deliberately not read off the host: an
     * oracle that asked the host what it sent could never catch the host
     * sending too little.
     */
    const visible = (): Set<string> | null => {
      const keys = engine.visibleKeys(shape.request, viewportStart, viewportStart + viewportRows);
      return keys === null ? null : new Set(keys.map(String));
    };

    /** What AG does on a scroll: read blocks, then report the viewport. */
    const scrollTo = async (start: number, tall = false): Promise<void> => {
      viewportStart = Math.max(0, start);
      viewportRows = tall ? BLOCK * CACHED_BLOCKS : BLOCK;
      const from = Math.max(0, viewportStart - BLOCK);
      const to = from + BLOCK * CACHED_BLOCKS;
      const page = await viewer.getRows({ ...shape.request, startRow: from, endRow: to });
      grid.load(page.rowData);
      for (const row of page.rowData) staleByDesign.delete(String(row.id));

      if (shape.grouped === true) {
        // An expanded group: AG asks for the children of a path, and those
        // LEAF rows are what a tick can land on. Without them the grouped case
        // would hold nothing a patch could ever apply to.
        for (const group of page.rowData.slice(0, 2)) {
          const children = await viewer.getRows({
            ...shape.request,
            groupKeys: [group.desk],
            startRow: 0,
            endRow: BLOCK,
          });
          grid.load(children.rowData);
          for (const row of children.rowData) staleByDesign.delete(String(row.id));
        }
      }

      await viewer.setViewport({
        request: shape.request,
        startRow: viewportStart,
        endRow: viewportStart + viewportRows,
      });
    };

    await scrollTo(0);

    let removedTotal = 0;
    let readdedTotal = 0;

    for (let frame = 0; frame < 260; frame++) {
      // ── the window moves ──────────────────────────────────────────────
      if (frame % 26 === 0) {
        // A sort, filter or group change purges AG's store and everything is
        // re-read: the one thing that legitimately clears the stale set.
        shape = SHAPES[(frame / 26) % SHAPES.length];
        grid.purge();
        staleByDesign.clear();
        await scrollTo(Math.floor(random() * 120), random() < 0.5);
      } else if (random() < 0.2) {
        await scrollTo(Math.floor(random() * 120), random() < 0.5);
      }

      // ── the writes, and what the design says must reach the window ────
      //
      // Several per frame, sometimes, because conflation is only tested when
      // two frames land between one pair of flushes: a frame naming `px` and a
      // frame naming `qty` on one row are two cells, and a pump that replaced
      // instead of merging would lose the earlier one. A removal following an
      // update, and a re-add following that removal, land the same way.
      let before: Set<string> | null = null;
      let after: Set<string> | null = null;

      const burst = 1 + Math.floor(random() * 3);
      for (let i = 0; i < burst; i++) {
        // BEFORE and AFTER, because they are not the same set. A tick that
        // changes a sort key MOVES the row across the viewport boundary, so a
        // row on screen now and gone from the range after the write is still
        // the row the user is looking at — AG does not re-order on a
        // transaction.
        before = visible();
        const mutation = mutate(random, ids, graveyard, frame * 4 + i);
        if (mutation.kind === 'remove') {
          await writer.applyRemove(mutation.keys);
          removedTotal += mutation.keys.length;
        } else {
          if (mutation.kind === 'readd') readdedTotal += 1;
          await writer.applyUpdate(mutation.rows);
        }
        await settle();
        after = visible();

        const seeable = before === null || after === null ? null : new Set([...before, ...after]);
        if (mutation.kind !== 'remove') {
          for (const row of mutation.rows) {
            const id = String(row.id);
            if (seeable !== null && !seeable.has(id) && grid.held.has(id)) staleByDesign.add(id);
          }
        }
      }

      // Both flush paths: the unbounded one a settled surface uses, and the
      // sliced one a burst gets. Draining after either is what "eventually
      // correct" has to mean — a slice that stopped partway is only honest if
      // the remainder is picked up with no further push to trigger it.
      if (random() < 0.3) pump.flushNow();
      clock.drain(pump);

      // ── the grid against a full re-read of the book ───────────────────
      for (const [rowId, data] of grid.held) {
        // Group rows are not leaves and no tick updates them; their aggregates
        // are the resync's job, not the pump's.
        if (rowId.startsWith('g:')) continue;

        const offset = engine.store.offsetOf(rowId);
        // A row the book no longer holds is a GHOST — the exact defect a
        // removal-only frame produced in the engine evaluated here in July.
        expect(offset, `frame ${frame} ${shape.name}: ghost row ${rowId}`).not.toBeUndefined();
        if (staleByDesign.has(rowId)) continue;

        compared += 1;
        for (const { field } of SCHEMA.fields) {
          const want = engine.store.valueAt(field, offset!);
          const got = data[field];
          expect(
            Object.is(got, want),
            `frame ${frame} ${shape.name}: ${rowId}.${field} is ${String(got)}, book says ` +
              `${String(want)} (in view before the write: ${String(before?.has(rowId) ?? 'all')}, ` +
              `after: ${String(after?.has(rowId) ?? 'all')})`,
          ).toBe(true);
        }

        // ── the CALCULATED cells the grid is holding ────────────────────
        // Against the engine's own evaluator at this row's offset, which is
        // the value a fresh block read would return. A calculated cell that
        // the patch failed to carry shows up here as a stale number and
        // nowhere else — on screen it is simply a plausible P&L.
        for (const def of CALC) {
          const evaluate = engine.calcEvaluator(def.colId);
          expect(evaluate, `${def.colId} was refused`).toBeDefined();
          const want = evaluate!(offset!);
          const got = data[def.colId];
          calcCompared += 1;
          expect(
            Object.is(got, want),
            `frame ${frame} ${shape.name}: ${rowId}.${def.colId} is ${String(got)}, the ` +
              `expression says ${String(want)} (in view before the write: ` +
              `${String(before?.has(rowId) ?? 'all')}, after: ${String(after?.has(rowId) ?? 'all')})`,
          ).toBe(true);
        }
      }
    }

    // Every lossy stage has to have actually run, or this proved nothing about
    // it. A probe that cannot report a failure is not one; nor is one that
    // never reached the thing it was pointed at.
    const stats = pump.stats();
    expect(stats.applied, 'no rows ever reached the grid').toBeGreaterThan(0);
    expect(stats.dropped, 'the drop path never ran').toBeGreaterThan(0);
    expect(stats.sliced, 'the slice never stopped a flush partway').toBeGreaterThan(0);
    expect(stats.removed, 'no removals crossed the port').toBeGreaterThan(0);
    expect(removedTotal, 'no rows were ever removed').toBeGreaterThan(0);
    expect(readdedTotal, 'no removed key was ever re-added').toBeGreaterThan(4);
    expect(grid.transactions(), 'AG was never handed a transaction').toBeGreaterThan(0);
    // The one that makes the rest mean something: a run in which every held row
    // happened to be excused would pass every assertion above and check nothing.
    expect(compared, 'the grid was barely compared against the book').toBeGreaterThan(2_000);
    expect(calcCompared, 'no calculated cell was ever compared').toBeGreaterThan(6_000);

    pump.dispose();
    await writer.close();
    await viewer.close();
    host.dispose();
  }, 60_000);
});

/** The frame generator, including the frames that are adversarial on purpose. */
function mutate(
  random: () => number,
  ids: string[],
  graveyard: string[],
  frame: number,
):
  | { kind: 'remove'; keys: string[] }
  | { kind: 'tick' | 'insert' | 'readd'; rows: SsrmRow[] } {
  const roll = random();

  if (roll < 0.1 && ids.length > 40) {
    // A REMOVAL-ONLY frame. Nothing is added and nothing ticks, which is the
    // frame the compaction bug in the July engine only ever showed up on.
    const keys: string[] = [];
    const count = 1 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const at = Math.floor(random() * ids.length);
      const [key] = ids.splice(at, 1);
      keys.push(key);
      graveyard.push(key);
    }
    return { kind: 'remove', keys };
  }

  if (roll < 0.16 && graveyard.length > 0) {
    // Re-add a key that WAS removed, drawn from the graveyard rather than
    // guessed — a guess almost never hits a dead key, and a case that almost
    // never runs is not covered. A tombstoned store gets this wrong by reviving
    // a dead offset with the previous occupant's cells still in it, and on the
    // push path the grid has to end up holding the NEW row or none.
    const id = graveyard.splice(Math.floor(random() * graveyard.length), 1)[0];
    ids.push(id);
    return { kind: 'readd', rows: [makeRow(random, id)] };
  }

  if (roll < 0.2) {
    const id = `n${frame}`;
    ids.push(id);
    return { kind: 'insert', rows: [makeRow(random, id)] };
  }

  const rows: SsrmRow[] = [];
  const count = 1 + Math.floor(random() * 40);
  for (let i = 0; i < count; i++) {
    const id = ids[Math.floor(random() * ids.length)];
    const pick = random();
    rows.push({
      id,
      // Two frames naming DIFFERENT columns of one row must merge in the pump,
      // not replace — so half of these name one column and half the other.
      ...(pick < 0.5
        ? { px: pick < 0.04 ? Number.NaN : Math.round(random() * 20000) / 100 }
        : { qty: pick > 0.96 ? null : Math.floor(random() * 1000) }),
      // A sort key changing under an ACTIVE sort, which is what moves a row
      // across the viewport boundary.
      ...(random() < 0.2 ? { px: Math.round(random() * 20000) / 100 } : {}),
    });
  }
  return { kind: 'tick', rows };
}
