import type { ColumnDefinition, ProviderConfig } from '@starui/types';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';

/** Unsubscribe handle returned by event registrars. */
export type Unsubscribe = () => void;

/**
 * Uniform client contract for a hub-backed data provider.
 *
 * Lifecycle maps to SharedWorker attach/detach; global provider teardown
 * is {@link DataServicesHubBundle.stopProvider}, not {@link stop}.
 *
 * @typeParam T Row shape (defaults to opaque records).
 */
export interface IDataProvider<T = Record<string, unknown>> {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  /** Attach subscriber; start transport when not already running. */
  start(): Promise<void>;
  /** Detach this client; hub provider stays up for other subscribers. */
  stop(): Promise<void>;
  /** Replay hub row cache to this subscriber without upstream I/O. */
  refresh(): Promise<void>;
  /** Full re-acquire (STOMP reconnect, REST refetch, historical asOfDate, …). */
  restart(extra?: Record<string, unknown>): Promise<void>;

  /** Last mirrored snapshot rows (client-side cache). */
  getData(): readonly T[];
  /** Resolved provider configuration from hub catalog or attach cfg. */
  getConfig(): ProviderConfig;
  /** Column defs from config or inferred schema. */
  getColumnDefs(): readonly ColumnDefinition[];

  /** Progressive snapshot row count (optional aggregate during load). */
  onRowsReceived(handler: (count: number) => void): Unsubscribe;
  /** Full snapshot replace (`replace: true` delta). */
  onSnapshotData(handler: (rows: readonly T[]) => void): Unsubscribe;
  /** Incremental keyed updates after snapshot (streaming providers). */
  onTick(handler: (rows: readonly T[]) => void): Unsubscribe;
  onError(handler: (error: Error) => void): Unsubscribe;
  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe;
}

/** Resolves {@link IDataProvider} instances by persisted provider id. */
export interface IDataProviderFactory {
  getProvider(providerId: string): IDataProvider;
}

/**
 * Bundle returned by `ensurePlatformReady` / `ensureDataServicesHub`.
 * Implementation lands in Phase 2; contract locked in Phase 0.
 */
export interface DataServicesHubBundle extends IDataProviderFactory {
  /** Catalog + AppData hydrated in the worker. */
  readonly ready: Promise<void>;
  /** Global teardown — wire `stop`. Does not run on grid unmount. */
  stopProvider(providerId: string): Promise<void>;
  /** Tear down hub client and worker connection for this window. */
  dispose(): void;
}
