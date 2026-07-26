/**
 * SsrmDataset — the worker-side orchestrator for ONE dataset:
 * STOMP ingest session → DatasetStateMachine (lifecycle truth) +
 * TableWriter → the hosted Perspective Table (book truth).
 *
 * Composition rules:
 * • The machine owns THE generation token; each ingest session is
 *   stamped with the generation it was started for, and both the
 *   machine and the writer drop mismatched events — restart adoption
 *   is designed out, not patched.
 * • The Table is created lazily on the FIRST snapshot batch, so the
 *   schema can be refined from real rows (config columnDefinitions
 *   first, sampled types second). A zero-row seed still creates the
 *   table from the config schema alone — window clients must always
 *   find the table once the dataset is `empty`/`live`.
 * • Restart keeps the table identity (windows' `open_table` handles
 *   stay valid) — the writer clears it as the new generation's first
 *   serialized write.
 */

import type { PerspectiveTable } from './perspectiveVendor.mjs';
import type { BootedPerspective } from './perspectiveBoot.js';
import type { DatasetStateSnapshot, SsrmDatasetConfig } from '../types.js';
import { DatasetStateMachine } from '../DatasetStateMachine.js';
import { TableWriter, type SsrmRow, type SsrmTableSurface } from '../TableWriter.js';
import {
  coerceRowToSchema,
  createRowProjector,
  refineSchemaFromRows,
  schemaFromColumnDefinitions,
  type PerspectiveSchema,
} from '../tableSchema.js';
import { openStompSession, type OpenStompSessionOpts, type SsrmIngestSession } from './stompIngest.js';

export const DEFAULT_TABLE_NAME = 'dataset';

/** How often (live writes) to refresh the published rowCount from the table. */
const LIVE_ROWCOUNT_REFRESH_WRITES = 50;

export class SsrmDataset {
  readonly tableName: string;
  private readonly config: SsrmDatasetConfig;
  private readonly psp: BootedPerspective;
  private readonly machine: DatasetStateMachine;
  private readonly writer: TableWriter;
  private readonly ingestOpts: OpenStompSessionOpts;

  private session: SsrmIngestSession | null = null;
  private table: PerspectiveTable | null = null;
  private tableCreating = false;
  private schema: PerspectiveSchema | null = null;
  private projectRow: ((row: SsrmRow) => SsrmRow) | null = null;
  private liveWritesSinceRefresh = 0;

  constructor(
    config: SsrmDatasetConfig,
    psp: BootedPerspective,
    onState: (state: DatasetStateSnapshot) => void,
    ingestOpts: OpenStompSessionOpts = {},
  ) {
    this.config = config;
    this.psp = psp;
    this.ingestOpts = ingestOpts;
    this.tableName = config.tableName ?? DEFAULT_TABLE_NAME;
    this.machine = new DatasetStateMachine(onState);
    this.writer = new TableWriter({
      ...(config.maxBufferedRows !== undefined
        ? { maxBufferedRows: config.maxBufferedRows }
        : {}),
      onError: (generation, error) =>
        this.machine.streamError(
          generation,
          error instanceof Error ? error.message : String(error),
        ),
      onWrite: (generation) => this.onTableWrite(generation),
    });
  }

  get state(): DatasetStateSnapshot {
    // Ingest telemetry rides every snapshot so windows can see
    // backpressure without a second channel. Observational only.
    return { ...this.machine.state, ingest: this.writer.getStats() };
  }

  /** Begin generation 1. Call once, right after construction. */
  start(): void {
    this.openSession(this.machine.generation);
  }

  /**
   * Bump THE generation and reseed. The old session's teardown runs
   * off the critical path — its late events are generation-fenced.
   */
  restart(): DatasetStateSnapshot {
    const oldSession = this.session;
    this.session = null;
    if (oldSession) void oldSession.close();
    const generation = this.machine.restart();
    this.liveWritesSinceRefresh = 0;
    this.writer.beginGeneration(generation);
    this.openSession(generation);
    return this.machine.state;
  }

  async dispose(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (session) await session.close();
  }

  /**
   * Cell-edit write-back (P4b): apply keyed PARTIAL rows to the hosted
   * table. Values are coerced to the table schema (grid editors hand
   * back strings); rows ride the SAME serialized writer path as ingest
   * so an edit never overtakes a tick. Throws (→ acked as an error,
   * nothing written) when:
   * • `generation` is stale — the edit was computed against a dead book;
   * • the table/schema does not exist yet (nothing to edit);
   * • a row is missing the key column (unkeyed write = insert, not edit).
   */
  updateRows(generation: number, rows: readonly SsrmRow[]): void {
    if (generation !== this.machine.generation) {
      throw new Error(
        `[ssrm] update-rows refused: stale generation ${generation} (current ${this.machine.generation})`,
      );
    }
    const schema = this.schema;
    if (!this.table || !schema) {
      throw new Error('[ssrm] update-rows refused: table not created yet');
    }
    const key = this.config.keyColumn;
    const coerced = rows.map((row) => {
      if (row[key] === undefined || row[key] === null) {
        throw new Error(`[ssrm] update-rows refused: row missing key column '${key}'`);
      }
      return coerceRowToSchema(schema, row);
    });
    this.writer.enqueue(generation, coerced);
  }

  // ─── ingest events ────────────────────────────────────────────

  private openSession(generation: number): void {
    this.session = openStompSession(
      this.config,
      generation,
      {
        onDialed: (gen) => void this.machine.dialed(gen),
        onSnapshotBatch: (gen, rows) => this.onRows(gen, rows, 'seed'),
        onSnapshotEnd: (gen) => void this.onSnapshotEnd(gen),
        onLiveBatch: (gen, rows) => this.onRows(gen, rows, 'live'),
        onError: (gen, detail) => void this.machine.streamError(gen, detail),
      },
      this.ingestOpts,
    );
  }

  private onRows(generation: number, rows: SsrmRow[], kind: 'seed' | 'live'): void {
    if (generation !== this.machine.generation) return;
    if (kind === 'seed') {
      if (!this.machine.snapshotBatch(generation, rows.length)) return;
    }
    // Table creation rides the first rows (schema refinement needs
    // them). Projection to the table schema happens once, inside the
    // writer's table surface (`projectingSurface`) — covering both
    // these rows and any parked pre-table ones.
    if (!this.table && !this.tableCreating) {
      void this.createTable(generation, rows);
    }
    this.writer.enqueue(generation, rows);
    if (kind === 'live') this.machine.liveRows(generation);
  }

  private async onSnapshotEnd(generation: number): Promise<void> {
    if (!this.machine.snapshotEnd(generation)) return;
    // Zero-row seed: no batch ever arrived, so the table may not exist
    // yet — create it from the config schema alone.
    if (!this.table && !this.tableCreating) {
      await this.createTable(generation, []);
    }
  }

  private onTableWrite(generation: number): void {
    // Refresh the published rowCount from the table (the source of
    // truth) at a bounded cadence while live — new keys in ticks grow
    // the book without a snapshot batch ever counting them.
    if (this.machine.state.phase !== 'live') return;
    this.liveWritesSinceRefresh += 1;
    if (this.liveWritesSinceRefresh < LIVE_ROWCOUNT_REFRESH_WRITES) return;
    this.liveWritesSinceRefresh = 0;
    void this.refreshRowCount(generation);
  }

  private async refreshRowCount(generation: number): Promise<void> {
    if (!this.table) return;
    try {
      const size = await this.table.size();
      this.machine.liveRows(generation, size);
    } catch {
      /* table deleted mid-read — ignore */
    }
  }

  // ─── table creation ───────────────────────────────────────────

  private async createTable(generation: number, sampleRows: SsrmRow[]): Promise<void> {
    this.tableCreating = true;
    try {
      const declared = (this.config.columnDefinitions ?? [])
        .map((c) => c.field)
        .filter(Boolean);
      const base = schemaFromColumnDefinitions(this.config.columnDefinitions, this.config.keyColumn);
      const { schema } = refineSchemaFromRows(base, declared, sampleRows);
      this.schema = schema;
      this.projectRow = createRowProjector(schema);
      const table = await this.psp.localClient.table(schema as Record<string, unknown>, {
        index: this.config.keyColumn,
        name: this.tableName,
      });
      this.table = table;
      const surface: SsrmTableSurface = {
        clear: () => table.clear(),
        update: (rows) => table.update(rows as SsrmRow[], { format: 'json' }),
        size: () => table.size(),
      };
      // Rows buffered before the schema existed are projected on flush.
      await this.writer.attachTable(generation, this.projectingSurface(surface));
    } catch (err) {
      this.machine.streamError(
        generation,
        `Perspective table create failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.tableCreating = false;
    }
  }

  /** Wrap the surface so every write is projected to the table schema. */
  private projectingSurface(surface: SsrmTableSurface): SsrmTableSurface {
    return {
      clear: surface.clear,
      size: surface.size,
      update: (rows) =>
        surface.update(this.projectRow ? rows.map(this.projectRow) : rows),
    };
  }
}
