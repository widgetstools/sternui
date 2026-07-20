import type { ColumnDefinition, ProviderConfig, ProviderType } from '@wellsfargo-starui/types';
import type {
  AttachOpts,
  SharedWorkerDataServicesClient,
  SubscribeHandle,
} from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { IDataProvider, Unsubscribe } from './IDataProvider.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';
import {
  createProviderClient,
  type CreateProviderClientOpts,
  type ProviderClient,
} from '../runtime/providerWorker/index.js';

/**
 * Route {@link ProviderClientAdapter} data subscribe to a per-provider
 * SharedWorker (ADR Phase 4c). Catalog reads prefer Config SW via
 * {@link ProviderClientAdapterOpts.resolveProviderConfig} when set.
 */
export type ProviderWorkerRoutingOpts = Omit<CreateProviderClientOpts, 'providerId'>;

export interface ProviderClientAdapterOpts {
  client: SharedWorkerDataServicesClient;
  providerId: string;
  /** Draft cfg when the provider row is not in the catalog yet. */
  inlineCfg?: ProviderConfig;
  /**
   * When set, `start` / `restart` open `starui-provider:{appId}:{providerId}`
   * instead of the monolith hub (ADR Phase 4c). Default demos omit this.
   */
  providerWorker?: ProviderWorkerRoutingOpts;
  /**
   * Prefer Config SW (or any external catalog) over the monolith hub
   * client's `getProviderConfig` (ADR control-plane split).
   */
  resolveProviderConfig?: (providerId: string) => Promise<ProviderConfig | null>;
}

export function resolveProviderCapabilities(providerType: ProviderType): ProviderCapabilities {
  switch (providerType) {
    case 'stomp':
    case 'mock':
      return {
        providerType,
        streaming: true,
        realtime: true,
        supportsRefresh: true,
        supportsRestart: true,
      };
    case 'rest':
      return {
        providerType,
        streaming: false,
        realtime: false,
        supportsRefresh: true,
        supportsRestart: true,
      };
    case 'appdata':
      return {
        providerType,
        streaming: false,
        realtime: false,
        supportsRefresh: false,
        supportsRestart: false,
      };
    default:
      return {
        providerType,
        streaming: false,
        realtime: false,
        supportsRefresh: true,
        supportsRestart: true,
      };
  }
}

/**
 * Client-side {@link IDataProvider} backed by {@link SharedWorkerDataServicesClient}
 * (monolith hub) or optionally a per-provider SharedWorker (ADR Phase 4c).
 * One adapter instance = one hub/provider-SW subscriber (attach/detach).
 */
export class ProviderClientAdapter<T = Record<string, unknown>> implements IDataProvider<T> {
  readonly id: string;

  private readonly client: SharedWorkerDataServicesClient;
  private readonly inlineCfg?: ProviderConfig;
  private readonly providerWorker?: ProviderWorkerRoutingOpts;
  private readonly resolveProviderConfig?: (
    providerId: string,
  ) => Promise<ProviderConfig | null>;
  private providerClient: ProviderClient | null = null;
  private resolvedConfig: ProviderConfig | null = null;
  private handle: SubscribeHandle<T> | null = null;
  /** Reference to the last snapshot commit — not copied, not updated on live ticks. */
  private snapshotRows: readonly T[] = [];

  private readonly rowsReceivedHandlers = new Set<(count: number) => void>();
  private readonly snapshotHandlers = new Set<(rows: readonly T[]) => void>();
  private readonly tickHandlers = new Set<(rows: readonly T[]) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();

  constructor(opts: ProviderClientAdapterOpts) {
    this.id = opts.providerId;
    this.client = opts.client;
    this.inlineCfg = opts.inlineCfg;
    this.providerWorker = opts.providerWorker;
    this.resolveProviderConfig = opts.resolveProviderConfig;
  }

  get capabilities(): ProviderCapabilities {
    const providerType =
      this.resolvedConfig?.providerType ??
      this.inlineCfg?.providerType ??
      'mock';
    return resolveProviderCapabilities(providerType);
  }

  async start(): Promise<void> {
    if (this.handle) return;

    // eslint-disable-next-line no-console
    console.info('[starui/stomp-template] main thread ProviderClientAdapter.start', {
      providerId: this.id,
      providerWorker: Boolean(this.providerWorker),
      note: 'Hub loads catalog cfg in worker — see hub.attach / stomp.onConnect logs for wire destinations.',
    });

    if (this.inlineCfg) {
      this.resolvedConfig = this.inlineCfg;
    } else {
      // Prefer Config SW when wired; otherwise hub catalog RPC (Phase 3
      // on-demand single-row read — no full catalog preload gate).
      this.resolvedConfig = await this.loadProviderConfig();
      if (!this.resolvedConfig) {
        throw new Error(
          `[ProviderClientAdapter] No config for providerId=${this.id}. ` +
            'Pass inlineCfg for drafts or ensure the catalog is hydrated.',
        );
      }
    }

    const handle = await this.openSubscribe(this.inlineCfg ?? this.resolvedConfig ?? undefined);
    this.wireHandle(handle);
    this.handle = handle;
    try {
      await handle.snapshot;
    } catch (err) {
      // Superseded mid-snapshot by a restart — not a provider failure.
      if (this.handle === handle) throw err;
    }
  }

  async refresh(): Promise<void> {
    this.assertStarted();
    const rows = await this.handle!.refresh();
    this.snapshotRows = rows;
    for (const handler of this.snapshotHandlers) {
      handler(rows);
    }
  }

  async restart(extra?: Record<string, unknown>): Promise<void> {
    // eslint-disable-next-line no-console
    console.info('[starui/stomp-template] main thread ProviderClientAdapter.restart', {
      providerId: this.id,
      extra: extra ?? null,
      providerWorker: Boolean(this.providerWorker),
    });
    if (!this.resolvedConfig && !this.inlineCfg) {
      this.resolvedConfig = await this.loadProviderConfig();
      if (!this.resolvedConfig) {
        throw new Error(`[ProviderClientAdapter] No config for providerId=${this.id}`);
      }
    }

    // MAKE-BEFORE-BREAK (worklog B10): attach the replacement BEFORE
    // detaching the old subscription, so the worker never sees a
    // zero-subscriber gap. Detach-first stopped the provider (last
    // subscriber → stopProvider → upstream STOMP teardown) and re-dialed
    // ~1 s into every cold start when the wiring effect re-fired on cfg
    // hydration — the "Loading → Refreshing" overlay flip-flop. Attach-
    // first lets the hub LATE-JOIN when cfg + overlay match (no upstream
    // restart; see providerCfgsEqual / restartExtrasEqual); a genuinely
    // changed overlay still restarts upstream, just without the gap.
    const superseded = this.handle;
    const handle = await this.openSubscribe(
      this.inlineCfg ?? this.resolvedConfig ?? undefined,
      extra ? { extra } : {},
    );
    this.wireHandle(handle);
    this.handle = handle;
    superseded?.unsubscribe();
    try {
      await handle.snapshot;
    } catch (err) {
      // Only a live handle's failure is the caller's problem — if THIS
      // restart was itself superseded mid-snapshot, the replacement owns
      // the lifecycle now.
      if (this.handle === handle) throw err;
    }
  }

  getData(): readonly T[] {
    return this.snapshotRows;
  }

  getConfig(): ProviderConfig {
    if (!this.resolvedConfig) {
      throw new Error(
        `[ProviderClientAdapter] getConfig() before start() for providerId=${this.id}`,
      );
    }
    return this.resolvedConfig;
  }

  getColumnDefs(): readonly ColumnDefinition[] {
    const config = this.getConfig() as ProviderConfig & {
      columnDefinitions?: ColumnDefinition[];
    };
    return config.columnDefinitions ?? [];
  }

  onRowsReceived(handler: (count: number) => void): Unsubscribe {
    this.rowsReceivedHandlers.add(handler);
    return () => this.rowsReceivedHandlers.delete(handler);
  }

  onSnapshotData(handler: (rows: readonly T[]) => void): Unsubscribe {
    this.snapshotHandlers.add(handler);
    return () => this.snapshotHandlers.delete(handler);
  }

  onTick(handler: (rows: readonly T[]) => void): Unsubscribe {
    this.tickHandlers.add(handler);
    return () => this.tickHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private async loadProviderConfig(): Promise<ProviderConfig | null> {
    if (this.resolveProviderConfig) {
      return this.resolveProviderConfig(this.id);
    }
    const row = await this.client.getProviderConfig(this.id);
    return row?.config ?? null;
  }

  private async openSubscribe(
    cfg: ProviderConfig | undefined,
    attachOpts: AttachOpts = {},
  ): Promise<SubscribeHandle<T>> {
    if (this.providerWorker) {
      const pc = await createProviderClient({
        ...this.providerWorker,
        providerId: this.id,
      });
      this.providerClient = pc;
      return pc.subscribe<T>(cfg, attachOpts);
    }
    return this.client.subscribe<T>(this.id, cfg, attachOpts);
  }

  private wireHandle(handle: SubscribeHandle<T>): void {
    // Superseded handles (make-before-break restart) must go silent: their
    // late events — and especially their "Subscription cancelled" snapshot
    // rejection — are OUR teardown, not provider state. Forwarding them
    // resolved busy overlays early and logged spurious container errors on
    // every cold start (worklog B10).
    const live = () => this.handle === handle;

    handle.onRowsReceived((count) => {
      if (!live()) return;
      for (const handler of this.rowsReceivedHandlers) handler(count);
    });

    handle.onStatus((status, error) => {
      if (!live()) return;
      for (const handler of this.statusHandlers) handler(status, error);
      if (status === 'error') {
        const err = new Error(error ?? 'Provider error');
        for (const handler of this.errorHandlers) handler(err);
      }
    });

    handle.onUpdate((rows) => {
      if (!live()) return;
      for (const handler of this.tickHandlers) handler(rows);
    });

    const deliverSnapshot = (rows: readonly T[]) => {
      if (!live()) return;
      this.snapshotRows = rows;
      for (const handler of this.snapshotHandlers) handler(rows);
    };

    handle.onReset((rows) => {
      deliverSnapshot(rows);
    });

    handle.onSnapshotCommit(deliverSnapshot);

    void handle.snapshot.catch((err: unknown) => {
      if (!live()) return;
      const error = err instanceof Error ? err : new Error(String(err));
      for (const handler of this.errorHandlers) handler(error);
    });
  }

  async stop(): Promise<void> {
    this.detach();
    this.clearHandlers();
  }

  private clearHandlers(): void {
    this.rowsReceivedHandlers.clear();
    this.snapshotHandlers.clear();
    this.tickHandlers.clear();
    this.errorHandlers.clear();
    this.statusHandlers.clear();
  }

  private detach(): void {
    this.handle?.unsubscribe();
    this.handle = null;
    this.snapshotRows = [];
  }

  private assertStarted(): void {
    if (!this.handle) {
      throw new Error(
        `[ProviderClientAdapter] Operation requires start() for providerId=${this.id}`,
      );
    }
  }
}
