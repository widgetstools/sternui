/**
 * Shared fakes for pull-plane unit tests: an in-memory Perspective
 * table/view pair implementing the slice of engine semantics the
 * datasource depends on (verified against the real 3.8 engine in the
 * P4a probes):
 *
 * • filter clauses AND-join; `contains`/`begins with`/`ends with` are
 *   case-insensitive literal matches; clauses on `__ssrm_*` expression
 *   columns pass every row (expression evaluation is engine territory —
 *   unit tests assert the emitted CONFIG, live behavior is proven in
 *   the spike);
 * • `group_by` (single level): `to_json` returns the total row
 *   (`__ROW_PATH__: []`) FIRST, then one row per group;
 *   `num_rows()` INCLUDES the total row; supported aggregates:
 *   sum/min/max/avg/count/unique;
 * • sort applies to flat rows or to group rows (by aggregate value).
 */

import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import type {
  PullDatasourceConnection,
  PullFilter,
  PullTable,
  PullView,
  PullViewConfig,
} from '../../pull/types.js';

export type Row = Record<string, unknown>;

function passes(row: Row, [col, op, term]: PullFilter): boolean {
  if (col.startsWith('__ssrm_')) return true; // expression columns — engine territory
  const value = row[col];
  const str = (v: unknown): string => String(v ?? '').toLowerCase();
  switch (op) {
    case '==':
      return value === term || String(value) === String(term);
    case '!=':
      return value !== term && String(value) !== String(term);
    case '>':
      return (value as number) > (term as number);
    case '>=':
      return (value as number) >= (term as number);
    case '<':
      return (value as number) < (term as number);
    case '<=':
      return (value as number) <= (term as number);
    case 'contains':
      return str(value).includes(str(term));
    case 'begins with':
      return str(value).startsWith(str(term));
    case 'ends with':
      return str(value).endsWith(str(term));
    case 'in':
      return Array.isArray(term) && term.some((t) => t === value || String(t) === String(value));
    case 'not in':
      return Array.isArray(term) && !term.some((t) => t === value || String(t) === String(value));
    case 'is null':
      return value === null || value === undefined;
    case 'is not null':
      return value !== null && value !== undefined;
    default:
      return true;
  }
}

function aggregate(rows: Row[], field: string, agg: string): unknown {
  const values = rows.map((r) => r[field]);
  const nums = values.filter((v): v is number => typeof v === 'number');
  switch (agg) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'min':
      return nums.length ? Math.min(...nums) : null;
    case 'max':
      return nums.length ? Math.max(...nums) : null;
    case 'avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case 'count':
      return values.filter((v) => v !== null && v !== undefined).length;
    case 'unique': {
      const distinct = new Set(values);
      return distinct.size === 1 ? values[0] : null;
    }
    default:
      return null;
  }
}

export class FakeView implements PullView {
  readonly config: PullViewConfig;
  readonly table: FakeTable;
  readonly updateCallbacks = new Map<number, () => void>();
  deleted = false;
  private nextCallbackId = 1;

  constructor(table: FakeTable, config: PullViewConfig) {
    this.table = table;
    this.config = config;
  }

  /** Filtered + sorted flat rows, or [total, ...groups] when grouped. */
  private materialize(): Row[] {
    const filter = this.config.filter ?? [];
    const filtered = this.table.rows.filter((row) => filter.every((f) => passes(row, f)));
    const groupBy = this.config.group_by ?? [];
    if (groupBy.length === 0) {
      const rows = filtered.map((row) => ({ ...row }));
      for (const [col, dir] of [...(this.config.sort ?? [])].reverse()) {
        rows.sort((a, b) => {
          const av = a[col] as number | string;
          const bv = b[col] as number | string;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      return rows;
    }
    const field = groupBy[0]!;
    const aggs = this.config.aggregates ?? {};
    const columns = this.config.columns ?? Object.keys(aggs);
    const byLabel = new Map<unknown, Row[]>();
    for (const row of filtered) {
      const label = row[field];
      const bucket = byLabel.get(label);
      if (bucket) bucket.push(row);
      else byLabel.set(label, [row]);
    }
    const aggRow = (rows: Row[]): Row => {
      const out: Row = {};
      for (const col of columns) {
        const spec = aggs[col] ?? 'sum';
        if (Array.isArray(spec)) {
          // ['weighted mean', [weightField]] — the real engine's spelling.
          const weightField = spec[1]?.[0];
          const weight = (r: Row): number => Number(r[weightField ?? ''] ?? 0);
          const total = rows.reduce((n, r) => n + weight(r), 0);
          out[col] =
            total === 0
              ? null
              : rows.reduce((n, r) => n + Number(r[col] ?? 0) * weight(r), 0) / total;
          continue;
        }
        out[col] = aggregate(rows, col, spec);
      }
      return out;
    };
    const groups = [...byLabel.entries()]
      .sort(([a], [b]) => (String(a) < String(b) ? -1 : 1))
      .map(([label, rows]) => ({ __ROW_PATH__: [label], ...aggRow(rows) }));
    for (const [col, dir] of [...(this.config.sort ?? [])].reverse()) {
      groups.sort((a, b) => {
        const av = (a as Row)[col] as number;
        const bv = (b as Row)[col] as number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === 'desc' ? -cmp : cmp;
      });
    }
    return [{ __ROW_PATH__: [], ...aggRow(filtered) }, ...groups];
  }

  async num_rows(): Promise<number> {
    return this.materialize().length;
  }

  async to_json(window?: { start_row?: number; end_row?: number }): Promise<Row[]> {
    const rows = this.materialize();
    const start = window?.start_row ?? 0;
    const end = window?.end_row ?? rows.length;
    return rows.slice(start, end).map((row) => ({ ...row }));
  }

  async on_update(callback: () => void): Promise<number> {
    const id = this.nextCallbackId++;
    this.updateCallbacks.set(id, callback);
    return id;
  }

  async remove_update(id: number): Promise<void> {
    this.updateCallbacks.delete(id);
  }

  async delete(): Promise<void> {
    this.deleted = true;
    this.updateCallbacks.clear();
  }

  fireUpdate(): void {
    for (const callback of this.updateCallbacks.values()) callback();
  }
}

export class FakeTable implements PullTable {
  rows: Row[] = [];
  readonly views: FakeView[] = [];

  async view(config?: PullViewConfig): Promise<PullView> {
    const view = new FakeView(this, config ?? {});
    this.views.push(view);
    return view;
  }

  async size(): Promise<number> {
    return this.rows.length;
  }

  /** Fire on_update on every live view (a table tick). */
  fireAll(): void {
    for (const view of this.views) {
      if (!view.deleted) view.fireUpdate();
    }
  }
}

export class FakeConnection implements PullDatasourceConnection {
  state: DatasetStateSnapshot | null = null;
  readonly table = new FakeTable();
  private readonly listeners = new Set<(s: DatasetStateSnapshot) => void>();
  openTableCalls = 0;
  private tableGate: Promise<void> = Promise.resolve();
  private releaseGate: (() => void) | null = null;

  onState(listener: (s: DatasetStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    if (this.state) listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async openTable(): Promise<PullTable> {
    this.openTableCalls += 1;
    await this.tableGate;
    return this.table;
  }

  emit(state: DatasetStateSnapshot): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }

  /** Make openTable hang until releaseTable() — for fencing tests. */
  holdTable(): void {
    this.tableGate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  releaseTable(): void {
    this.releaseGate?.();
    this.releaseGate = null;
  }
}
