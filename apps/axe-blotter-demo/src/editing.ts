/**
 * Edit subsystem — five-layer architecture from the HTML reference demo,
 * ported to TypeScript and re-shaped to talk to MarketsGrid via its
 * imperative `MarketsGridHandle`.
 *
 *   L1 input        → keyboard handler in App.tsx
 *   L2 intent       → EditIntent objects produced by editors / tick handlers
 *   L3 coordinator  → EditCoordinator (this file)
 *   L4 buffer       → PendingEditBuffer (this file)
 *   L5 commit       → EditCoordinator.commit() — Phase 1 validate / Phase 2
 *                     mark COMMITTING + suspend stream / Phase 3 apply
 *                     transaction + flash green + promote undo
 *
 * NOTE — this whole subsystem is orthogonal to MarketsGrid. The grid
 * provides the rendering surface (`gridApi`) and the persistence
 * surface (`profiles`). Editing semantics, validation, undo grouping,
 * and linkage are app-owned concerns; the value of MarketsGrid here is
 * that its `MarketsGridHandle` exposes everything we need imperatively.
 */
import type { GridApi } from 'ag-grid-community';
import { POLICY, LINKAGE, round, type AxeRow, type CellPendingTag } from './data';

/**
 * Mirror buffer state onto each row's `__p_<col>` shadow fields, so
 * MarketsGrid's conditional-styling rules (defined in buildAxeProfile.ts)
 * can match cell state through the standard ExpressionEngine context.
 *
 * Returns the list of rows that actually changed — caller passes this
 * to gridApi.applyTransactionAsync to keep the styling pipeline reactive.
 */
export function syncBufferToRows(
  buffer: PendingEditBuffer,
  rows: AxeRow[],
): AxeRow[] {
  const tagFor = (e: PendingEntry | undefined): CellPendingTag => {
    if (!e) return '';
    if (e.conflict) return 'conflict';
    if (e.state === 'COMMITTING') return 'committing';
    if (e.state === 'COMMITTED_FLASH') return 'committed';
    if (e.state === 'REJECTED') return 'rejected';
    if (e.warn) return 'warn';
    return 'pending';
  };
  const changed: AxeRow[] = [];
  for (const row of rows) {
    const next: Record<string, CellPendingTag> = {
      __p_bid:    tagFor(buffer.get(row.id, 'bid')),
      __p_ask:    tagFor(buffer.get(row.id, 'ask')),
      __p_spread: tagFor(buffer.get(row.id, 'spread')),
      __p_size:   tagFor(buffer.get(row.id, 'size')),
    };
    let dirty = false;
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      if ((row as unknown as Record<string, unknown>)[k] !== next[k]) {
        (row as unknown as Record<string, unknown>)[k] = next[k];
        dirty = true;
      }
    }
    if (dirty) changed.push(row);
  }
  return changed;
}

// ─── Types ─────────────────────────────────────────────────────────────

export type CellState =
  | 'VALID'
  | 'COMMITTING'
  | 'COMMITTED_FLASH'
  | 'REJECTED';

export interface PendingEntry {
  rowId: string;
  colId: string;
  /** Pre-edit value — used for diff + undo restoration. */
  before: number;
  /** Currently-staged value. */
  value: number;
  state: CellState;
  /** Shared across linked edits in the same intent (bid+ask move together). */
  intentId: string;
  timestamp: number;
  /** Set true when the streamer ticks the underlying while we have a
   *  pending edit on this cell — surfaces the ⚠ glyph. */
  conflict?: boolean;
  /** Validator returned warn-not-reject — surfaces dotted border per the
   *  architecture's DRAFT-vs-VALID distinction (DOC-MUI-GRID-001 §04). */
  warn?: string;
  /** Origin label shown in the Note column. `'primary'` = the cell the
   *  trader actually edited; `'linkage'` = derived sibling. */
  origin?: 'primary' | 'linkage';
}

export interface EditIntent {
  rowId: string;
  colId: string;
  value: number;
  /** When provided, group several intents under one undo frame. */
  intentId?: string;
  /** Display label for the activity log. */
  origin?: 'cellEditor' | 'pairedTick' | 'rangeTick';
  /** Set false to skip linkage expansion (rare; for undo paths). */
  applyLinkage?: boolean;
}

export interface UndoFrame {
  intentId: string;
  timestamp: number;
  origin: string;
  tier: 'working' | 'committed';
  edits: { rowId: string; colId: string; before: number; after: number }[];
}

export type LogKind = 'intent' | 'commit' | 'undo' | 'reject' | 'tick' | 'stream';
export type LogFn = (kind: LogKind, msg: string, detail?: string) => void;
export type ToastFn = (msg: string, kind?: 'danger' | 'success') => void;

// ─── L4 · PendingEditBuffer ────────────────────────────────────────────

export class PendingEditBuffer {
  private entries = new Map<string, PendingEntry>();
  private listeners = new Set<() => void>();

  private key(rowId: string, colId: string) { return `${rowId}|${colId}`; }
  has(rowId: string, colId: string) { return this.entries.has(this.key(rowId, colId)); }
  get(rowId: string, colId: string) { return this.entries.get(this.key(rowId, colId)); }
  size() { return this.entries.size; }
  all() { return Array.from(this.entries.values()); }

  set(entry: PendingEntry) {
    this.entries.set(this.key(entry.rowId, entry.colId), entry);
    this.notify();
  }
  delete(rowId: string, colId: string) {
    this.entries.delete(this.key(rowId, colId));
    this.notify();
  }
  clear() { this.entries.clear(); this.notify(); }

  setState(rowId: string, colId: string, state: CellState) {
    const e = this.get(rowId, colId);
    if (e) { e.state = state; this.notify(); }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Public for the streamer to flag conflicts directly on entries. */
  notify() { this.listeners.forEach((fn) => fn()); }
}

// ─── L3 · UndoStack (two-tier: working + committed) ────────────────────

export class UndoStack {
  private working: UndoFrame[] = [];
  private committed: UndoFrame[] = [];
  private redoStack: UndoFrame[] = [];
  private listeners = new Set<() => void>();

  pushWorking(frame: UndoFrame) {
    this.working.push(frame);
    this.redoStack = [];
    this.notify();
  }
  promoteToCommitted(intentId: string) {
    const idx = this.working.findIndex((f) => f.intentId === intentId);
    if (idx < 0) return;
    const frame = this.working.splice(idx, 1)[0];
    frame.tier = 'committed';
    this.committed.push(frame);
    this.notify();
  }
  popForUndo(): { frame: UndoFrame; tier: 'working' | 'committed' } | null {
    if (this.working.length > 0) return { frame: this.working.pop()!, tier: 'working' };
    if (this.committed.length > 0) return { frame: this.committed[this.committed.length - 1], tier: 'committed' };
    return null;
  }
  consumeCommittedTop(): UndoFrame | null {
    if (this.committed.length === 0) return null;
    const f = this.committed.pop()!;
    this.notify();
    return f;
  }
  pushRedo(frame: UndoFrame) { this.redoStack.push(frame); this.notify(); }
  popRedo() { return this.redoStack.pop(); }
  canUndo() { return this.working.length > 0 || this.committed.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  clearWorkingOnDiscard() { this.working = []; this.notify(); }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify() { this.listeners.forEach((fn) => fn()); }
}

// ─── L3 · EditCoordinator ──────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EditCoordinator {
  /** Cells suspended from streaming during the commit round-trip. */
  private streamingSuspended = new Set<string>();
  private rowMap = new Map<string, AxeRow>();

  constructor(
    public readonly buffer: PendingEditBuffer,
    public readonly undo: UndoStack,
    private readonly gridApi: GridApi,
    private readonly log: LogFn,
    private readonly toast: ToastFn,
  ) {}

  setRows(rows: readonly AxeRow[]) {
    this.rowMap.clear();
    for (const r of rows) this.rowMap.set(r.id, r);
  }
  getRow(rowId: string) { return this.rowMap.get(rowId); }
  isSuspended(rowId: string, colId: string) {
    return this.streamingSuspended.has(`${rowId}|${colId}`);
  }

  /** L2 → L3 — stage a single intent and any derived linkage edits. */
  stage(intent: EditIntent): string | null {
    // Skip no-op edits — AG-Grid's edit pipeline can fire valueSetter
    // on commit even when the typed value matches the displayed value
    // (which itself comes from the buffer). Without this guard, every
    // post-edit "Tab to next cell" produces a 0-delta entry.
    const currentRow = this.getRow(intent.rowId);
    if (currentRow) {
      const liveOrPending = this.buffer.has(intent.rowId, intent.colId)
        ? this.buffer.get(intent.rowId, intent.colId)!.value
        : (currentRow[intent.colId as keyof AxeRow] as number);
      if (intent.value === liveOrPending) return null;
    }

    const intentId = intent.intentId ?? `i_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const reverseEdits: UndoFrame['edits'] = [];
    const allEdits: { rowId: string; colId: string; value: number }[] = [
      { rowId: intent.rowId, colId: intent.colId, value: intent.value },
    ];

    // Linkage expansion
    const link = LINKAGE[intent.colId];
    const row = this.getRow(intent.rowId);
    if (link && intent.applyLinkage !== false && row) {
      if (link.kind === 'preserve_spread') {
        const delta = intent.value - (row[intent.colId as keyof AxeRow] as number);
        for (const pCol of link.paired) {
          const pVal = round((row[pCol as keyof AxeRow] as number) + delta, POLICY[pCol]?.precision ?? 3);
          allEdits.push({ rowId: intent.rowId, colId: pCol, value: pVal });
        }
      } else {
        const derived = link.derive(intent.value, row);
        for (const [pCol, pVal] of Object.entries(derived)) {
          if (typeof pVal !== 'number') continue;
          allEdits.push({ rowId: intent.rowId, colId: pCol, value: pVal });
          // Cascade bid → ask through preserve_spread.
          if (pCol === 'bid') {
            const askDelta = pVal - row.bid;
            allEdits.push({ rowId: intent.rowId, colId: 'ask', value: round(row.ask + askDelta, 3) });
          }
        }
      }
    }

    // Validate every edit. Reject the entire intent if any cell rejects.
    for (const ed of allEdits) {
      const v = this.validate(ed);
      if (v.state === 'REJECTED') {
        this.log('reject', `Edit rejected on ${ed.colId}: ${v.reason}`);
        this.toast(`Rejected: ${v.reason}`, 'danger');
        return null;
      }
    }

    // Commit to buffer. The first edit in `allEdits` is the trader's
    // primary intent; everything after is linkage-derived. Per-edit
    // validator state is re-checked here so warn flags ride along.
    for (let i = 0; i < allEdits.length; i++) {
      const ed = allEdits[i];
      const r = this.getRow(ed.rowId);
      if (!r) continue;
      const existing = this.buffer.get(ed.rowId, ed.colId);
      const before = existing ? existing.before : (r[ed.colId as keyof AxeRow] as number);
      reverseEdits.push({ rowId: ed.rowId, colId: ed.colId, before, after: ed.value });
      const v = this.validate(ed);
      this.buffer.set({
        rowId: ed.rowId,
        colId: ed.colId,
        before,
        value: ed.value,
        state: 'VALID',
        intentId,
        timestamp: Date.now(),
        warn: 'warn' in v ? v.warn : undefined,
        origin: i === 0 ? 'primary' : 'linkage',
      });
    }

    this.undo.pushWorking({
      intentId,
      timestamp: Date.now(),
      origin: intent.origin ?? 'cellEditor',
      tier: 'working',
      edits: reverseEdits,
    });

    this.refreshCells(allEdits);

    const head = reverseEdits[0];
    this.log(
      'intent',
      `${intent.origin ?? 'edit'} → ${allEdits.length} cell(s) staged`,
      head ? `${intent.colId} on ${intent.rowId}: ${head.before} → ${head.after} (intent ${intentId.slice(0, 10)})` : undefined,
    );
    return intentId;
  }

  /** Range tick — produce one EditIntent per cell in the active range. */
  tickRange(direction: 'up' | 'down', multiplier = 1) {
    const ranges = this.gridApi.getCellRanges();
    if (!ranges || ranges.length === 0) {
      this.toast('Select a range first');
      return;
    }
    const intentId = `tick_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let count = 0;

    for (const range of ranges) {
      const startRow = Math.min(range.startRow!.rowIndex, range.endRow!.rowIndex);
      const endRow = Math.max(range.startRow!.rowIndex, range.endRow!.rowIndex);
      for (const col of range.columns) {
        const colId = col.getColId();
        const policy = POLICY[colId];
        if (!policy) continue;
        const tick = policy.tick * multiplier * (direction === 'up' ? 1 : -1);
        for (let i = startRow; i <= endRow; i++) {
          const node = this.gridApi.getDisplayedRowAtIndex(i);
          const data = node?.data as AxeRow | undefined;
          if (!data) continue;
          const current = this.buffer.has(data.id, colId)
            ? this.buffer.get(data.id, colId)!.value
            : (data[colId as keyof AxeRow] as number);
          const newVal = round(current + tick, policy.precision);
          const id = this.stage({ rowId: data.id, colId, value: newVal, intentId, origin: 'rangeTick' });
          if (id) count++;
        }
      }
    }
    if (count > 0) this.log('tick', `Tick ${direction} ×${multiplier} → ${count} edit(s)`);
  }

  validate(edit: { rowId: string; colId: string; value: number }) {
    const policy = POLICY[edit.colId];
    if (!policy) return { state: 'VALID' as const };
    const row = this.getRow(edit.rowId);
    if (!row) return { state: 'VALID' as const };
    const baseline = row[edit.colId as keyof AxeRow] as number;
    const delta = Math.abs(edit.value - baseline);
    if (delta > policy.reject) {
      return {
        state: 'REJECTED' as const,
        reason: `Δ ${delta.toFixed(2)} ${policy.unit} exceeds reject threshold ${policy.reject}`,
      };
    }
    if (delta > policy.warn) {
      return {
        state: 'VALID' as const,
        warn: `Δ ${delta.toFixed(2)} ${policy.unit} > warn ${policy.warn}`,
      };
    }
    return { state: 'VALID' as const };
  }

  refreshCells(edits: readonly { rowId: string; colId: string }[]) {
    const rowIds = [...new Set(edits.map((e) => e.rowId))];
    const cols = [...new Set(edits.map((e) => e.colId))];
    const rowNodes = rowIds.map((id) => this.gridApi.getRowNode(id)).filter(Boolean) as ReturnType<GridApi['getRowNode']>[];
    this.gridApi.refreshCells({ rowNodes: rowNodes as never, columns: cols, force: true });
  }

  /** L5 commit — Phase 1 validate / Phase 2 mark COMMITTING / Phase 3 apply. */
  async commit() {
    if (this.buffer.size() === 0) {
      this.toast('Nothing to commit');
      return;
    }

    // Phase 1
    for (const e of this.buffer.all()) {
      const v = this.validate({ rowId: e.rowId, colId: e.colId, value: e.value });
      if (v.state === 'REJECTED') {
        this.toast('Batch aborted: validation failed');
        this.log('reject', `Phase 1 abort: ${e.colId} on ${e.rowId}`);
        return;
      }
    }
    this.log('commit', `Phase 1 ✓ ${this.buffer.size()} edit(s) valid`);

    // Phase 2
    const all = this.buffer.all();
    const intentIds = [...new Set(all.map((e) => e.intentId))];
    for (const e of all) {
      this.buffer.setState(e.rowId, e.colId, 'COMMITTING');
      this.streamingSuspended.add(`${e.rowId}|${e.colId}`);
    }
    this.refreshCells(all);
    this.log('commit', `Phase 2 → ViewServer (${all.length} cells COMMITTING)`);

    // Simulate ViewServer round-trip
    await sleep(700 + Math.random() * 400);

    // Phase 3 — apply transaction, flash green, then sweep buffer
    const byRow = new Map<string, AxeRow>();
    for (const e of all) {
      const base = byRow.get(e.rowId) ?? { ...this.getRow(e.rowId)! };
      (base as unknown as Record<string, unknown>)[e.colId] = e.value;
      byRow.set(e.rowId, base);
    }
    for (const updated of byRow.values()) this.rowMap.set(updated.id, updated);
    this.gridApi.applyTransactionAsync({ update: [...byRow.values()] });

    const cells = all.map((e) => ({ rowId: e.rowId, colId: e.colId }));
    for (const c of cells) this.buffer.setState(c.rowId, c.colId, 'COMMITTED_FLASH');
    this.refreshCells(cells);

    setTimeout(() => {
      for (const c of cells) {
        this.buffer.delete(c.rowId, c.colId);
        this.streamingSuspended.delete(`${c.rowId}|${c.colId}`);
      }
      this.refreshCells(cells);
      for (const id of intentIds) this.undo.promoteToCommitted(id);
      this.log(
        'commit',
        `Phase 3 ✓ ack received (${all.length} cells)`,
        `intents committed: ${intentIds.map((i) => i.slice(0, 8)).join(', ')}`,
      );
      this.toast('Committed', 'success');
    }, 700);
  }

  cancel() {
    if (this.buffer.size() === 0) return;
    const cells = this.buffer.all().map((e) => ({ rowId: e.rowId, colId: e.colId }));
    this.buffer.clear();
    this.undo.clearWorkingOnDiscard();
    this.refreshCells(cells);
    this.log('undo', `Discarded ${cells.length} pending edit(s)`);
    this.toast('Discarded');
  }

  undoOne() {
    const popped = this.undo.popForUndo();
    if (!popped) { this.toast('Nothing to undo'); return; }
    const { frame, tier } = popped;

    if (tier === 'working') {
      const cells: { rowId: string; colId: string }[] = [];
      for (const ed of frame.edits) {
        const row = this.getRow(ed.rowId);
        const live = row ? (row[ed.colId as keyof AxeRow] as number) : ed.before;
        if (ed.before === live) {
          this.buffer.delete(ed.rowId, ed.colId);
        } else {
          this.buffer.set({
            rowId: ed.rowId, colId: ed.colId, before: live, value: ed.before,
            state: 'VALID', intentId: 'undo_restore', timestamp: Date.now(),
          });
        }
        cells.push({ rowId: ed.rowId, colId: ed.colId });
      }
      this.refreshCells(cells);
      this.undo.pushRedo(frame);
      this.log('undo', `Undid working frame · ${frame.edits.length} cell(s)`);
      return;
    }

    // Committed: stage a compensating edit (preserves audit trail).
    this.undo.consumeCommittedTop();
    const reverseIntent = `undo_${Date.now()}`;
    for (const ed of frame.edits) {
      const row = this.getRow(ed.rowId);
      if (!row) continue;
      this.buffer.set({
        rowId: ed.rowId, colId: ed.colId,
        before: row[ed.colId as keyof AxeRow] as number,
        value: ed.before,
        state: 'VALID',
        intentId: reverseIntent,
        timestamp: Date.now(),
      });
    }
    this.refreshCells(frame.edits);
    this.undo.pushRedo(frame);
    this.log(
      'undo',
      `Compensating edit staged from committed history (${frame.edits.length} cell(s))`,
      'Original commit preserved for audit. New pending = reverse.',
    );
    this.toast('Compensating undo staged — review and commit');
  }

  redoOne() {
    const frame = this.undo.popRedo();
    if (!frame) { this.toast('Nothing to redo'); return; }
    const cells: { rowId: string; colId: string }[] = [];
    for (const ed of frame.edits) {
      const row = this.getRow(ed.rowId);
      if (!row) continue;
      this.buffer.set({
        rowId: ed.rowId, colId: ed.colId,
        before: row[ed.colId as keyof AxeRow] as number,
        value: ed.after,
        state: 'VALID',
        intentId: `${frame.intentId}_redo`,
        timestamp: Date.now(),
      });
      cells.push({ rowId: ed.rowId, colId: ed.colId });
    }
    this.undo.pushWorking({ ...frame, intentId: `${frame.intentId}_redo`, tier: 'working' });
    this.refreshCells(cells);
    this.log('undo', `Redo · ${frame.edits.length} cell(s) re-staged`);
  }
}
