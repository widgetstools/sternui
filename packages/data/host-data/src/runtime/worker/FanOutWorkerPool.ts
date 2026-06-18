/**
 * FanOutWorkerPool — one dedicated fan-out worker per hub `subId`.
 * Spawned on `attach`, terminated on `detach` or client disconnect.
 * The window MessagePort stays on the hub; workers prepare envelopes
 * and the pool delivers them to the client port.
 */

import type { PortLike } from './hubTypes.js';
import type {
  FanOutHubToWorker,
  FanOutWorkerToHub,
} from './fanOutProtocol.js';

export interface FanOutWorkerPoolOpts {
  /** Worker script URL (bundled sibling of data-services-worker.mjs). */
  workerUrl: string | URL;
  /** Called when a client port is dead or released. */
  onClientDead: (clientId: string) => void;
  /** Inject Worker constructor for tests. */
  createWorker?: (url: string | URL) => WorkerLike;
}

type WorkerEventListener = ((ev: MessageEvent) => void) | (() => void);

/** Minimal Worker surface for pool wiring + test doubles. */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message' | 'error', listener: WorkerEventListener): void;
  removeEventListener(type: 'message' | 'error', listener: WorkerEventListener): void;
}

/** Fan-out worker → hub broadcast job timeout (inline fallback on expiry). */
export const FANOUT_BROADCAST_TIMEOUT_MS = 10_000;

interface SubscriberWorker {
  worker: WorkerLike;
  subId: string;
  clientId: string;
  onError: () => void;
}

interface PendingConnection {
  port: MessagePort;
  onMessage: (ev: MessageEvent) => void;
  onError: () => void;
}

interface PendingJob {
  subId: string;
  resolve: (deadSubIds: string[]) => void;
  deadSubIds: string[];
  pendingDone: boolean;
}

/**
 * Whether fan-out workers are enabled. Override with
 * `localStorage.STARUI_FANOUT_POOL_SIZE` (`0` disables).
 */
export function isFanOutEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem('STARUI_FANOUT_POOL_SIZE');
  return raw !== '0';
}

/**
 * Create a fan-out worker pool, or `null` when disabled or `Worker` is
 * unavailable (tests / unsupported environments).
 */
export function createFanOutWorkerPool(opts: FanOutWorkerPoolOpts): FanOutWorkerPool | null {
  if (!isFanOutEnabled()) return null;
  if (!opts.createWorker && typeof Worker === 'undefined') return null;
  return new FanOutWorkerPool(opts);
}

export class FanOutWorkerPool {
  private readonly subscriberWorkers = new Map<string, SubscriberWorker>();
  private readonly pendingConnections = new Map<string, PendingConnection>();
  private readonly proxies = new Map<string, PortLike>();
  private readonly pendingJobs = new Map<number, PendingJob>();
  private jobIdSeq = 0;
  private disposed = false;
  private readonly onWorkerMessage: (ev: MessageEvent) => void;
  private readonly createWorker: (url: string | URL) => WorkerLike;
  private readonly workerUrl: string;

  constructor(private readonly opts: FanOutWorkerPoolOpts) {
    this.createWorker = opts.createWorker ?? ((url) => new Worker(url, { type: 'module' }) as WorkerLike);
    this.workerUrl = opts.workerUrl.toString();
    this.onWorkerMessage = (ev: MessageEvent<FanOutWorkerToHub>) => {
      this.handleWorkerMessage(ev.data);
    };
  }

  /** Proxy PortLike the hub stores on listeners — delivers via hub-held port. */
  createPortProxy(clientId: string): PortLike {
    const proxy: PortLike = {
      fanOutClientId: clientId,
      postMessage: (message) => {
        this.deliverToClient(clientId, message);
      },
    };
    this.proxies.set(clientId, proxy);
    return proxy;
  }

  getProxy(clientId: string): PortLike | undefined {
    return this.proxies.get(clientId);
  }

  /**
   * Register a window MessagePort. Inbound requests are forwarded via
   * `onMessage` for the lifetime of the connection.
   */
  registerPending(
    clientId: string,
    port: MessagePort,
    handlers: {
      onMessage: (ev: MessageEvent) => void;
      onError: () => void;
    },
  ): void {
    if (this.disposed) return;
    this.unregisterClient(clientId);
    port.addEventListener('message', handlers.onMessage);
    port.addEventListener('messageerror', handlers.onError);
    port.start();
    this.pendingConnections.set(clientId, {
      port,
      onMessage: handlers.onMessage,
      onError: handlers.onError,
    });
  }

  /** True when a fan-out worker is active for this subscription. */
  isActive(subId: string): boolean {
    return this.subscriberWorkers.has(subId);
  }

  /**
   * Spawn a dedicated fan-out worker for one hub subscription. Recycles
   * any existing worker for the same `subId` (re-attach / stale slot).
   */
  activateSubscriber(subId: string, clientId: string): void {
    if (this.disposed) return;
    if (!this.pendingConnections.has(clientId)) return;

    const existing = this.subscriberWorkers.get(subId);
    if (existing) {
      if (existing.clientId === clientId) return;
      this.destroySubscriberWorker(subId);
    }

    const worker = this.createWorker(this.workerUrl);
    const onError = () => {
      if (this.subscriberWorkers.get(subId)?.worker !== worker) return;
      this.failPendingJobsForSubId(subId);
      this.destroySubscriberWorker(subId);
    };
    worker.addEventListener('message', this.onWorkerMessage);
    worker.addEventListener('error', onError);
    this.subscriberWorkers.set(subId, { worker, subId, clientId, onError });

    worker.postMessage({ type: 'init' });
    try {
      worker.postMessage({ type: 'register', subId, clientId } satisfies FanOutHubToWorker);
    } catch {
      this.failPendingJobsForSubId(subId);
      this.destroySubscriberWorker(subId);
    }
  }

  /** Tear down the fan-out worker for one subscription. */
  unregisterSubscriber(subId: string): void {
    this.failPendingJobsForSubId(subId);
    this.destroySubscriberWorker(subId);
  }

  /**
   * Tear down every subscription worker and the connection for one
   * client window (port close).
   */
  unregisterClient(clientId: string): void {
    for (const [subId, slot] of [...this.subscriberWorkers.entries()]) {
      if (slot.clientId === clientId) this.unregisterSubscriber(subId);
    }
    this.detachPendingListeners(clientId);
    this.pendingConnections.delete(clientId);
    this.proxies.delete(clientId);
  }

  /**
   * One broadcast job per active subscription worker. Always resolves
   * (never rejects) with the list of `subId`s that failed delivery.
   */
  broadcast(
    items: ReadonlyArray<{ clientId: string; subId: string }>,
    event: unknown,
  ): Promise<string[]> {
    if (this.disposed || items.length === 0) return Promise.resolve([]);

    const jobs: Array<Promise<string[]>> = [];
    const orphanSubIds: string[] = [];

    for (const item of items) {
      if (!this.subscriberWorkers.has(item.subId)) {
        orphanSubIds.push(item.subId);
        continue;
      }
      const jobId = ++this.jobIdSeq;
      const subId = item.subId;
      jobs.push(new Promise<string[]>((resolve) => {
        const timer = setTimeout(() => {
          const job = this.pendingJobs.get(jobId);
          if (!job) return;
          this.pendingJobs.delete(jobId);
          resolve([subId]);
        }, FANOUT_BROADCAST_TIMEOUT_MS);
        this.pendingJobs.set(jobId, {
          subId,
          deadSubIds: [],
          pendingDone: false,
          resolve: (deadSubIds) => {
            clearTimeout(timer);
            resolve(deadSubIds);
          },
        });
        this.postToSubscriber(subId, {
          type: 'broadcast',
          jobId,
          subId: item.subId,
          clientId: item.clientId,
          event,
        });
      }));
    }

    if (jobs.length === 0) return Promise.resolve(orphanSubIds);

    return Promise.all(jobs).then((deadLists) => {
      const merged = orphanSubIds.slice();
      for (const list of deadLists) merged.push(...list);
      return merged;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const subId of [...this.subscriberWorkers.keys()]) {
      this.destroySubscriberWorker(subId);
    }
    for (const clientId of [...this.pendingConnections.keys()]) {
      this.detachPendingListeners(clientId);
      this.pendingConnections.delete(clientId);
    }
    this.proxies.clear();
    for (const [, job] of this.pendingJobs) {
      job.resolve([job.subId]);
    }
    this.pendingJobs.clear();
  }

  private deliverToClient(clientId: string, message: unknown): void {
    if (this.disposed) return;
    const pending = this.pendingConnections.get(clientId);
    if (!pending) return;
    try {
      pending.port.postMessage(message);
    } catch {
      this.unregisterClient(clientId);
      this.opts.onClientDead(clientId);
    }
  }

  private postToSubscriber(subId: string, message: FanOutHubToWorker): void {
    const slot = this.subscriberWorkers.get(subId);
    if (!slot) return;
    try {
      slot.worker.postMessage(message);
    } catch {
      this.failPendingJobsForSubId(subId);
      this.destroySubscriberWorker(subId);
    }
  }

  private failPendingJobsForSubId(subId: string): void {
    for (const [jobId, job] of this.pendingJobs) {
      if (job.subId !== subId) continue;
      if (!job.deadSubIds.includes(subId)) job.deadSubIds.push(subId);
      job.pendingDone = true;
      this.finishJobIfReady(jobId);
    }
  }

  private detachPendingListeners(clientId: string): void {
    const pending = this.pendingConnections.get(clientId);
    if (!pending) return;
    try {
      pending.port.removeEventListener('message', pending.onMessage);
      pending.port.removeEventListener('messageerror', pending.onError);
    } catch {
      /* port may already be closed */
    }
  }

  private destroySubscriberWorker(subId: string): void {
    const slot = this.subscriberWorkers.get(subId);
    if (!slot) return;
    this.subscriberWorkers.delete(subId);
    try {
      slot.worker.postMessage({ type: 'dispose' } satisfies FanOutHubToWorker);
    } catch {
      /* worker already gone */
    }
    slot.worker.removeEventListener('message', this.onWorkerMessage);
    slot.worker.removeEventListener('error', slot.onError);
    slot.worker.terminate();
  }

  private handleWorkerMessage(data: FanOutWorkerToHub): void {
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
      case 'deliver': {
        const pending = this.pendingConnections.get(data.clientId);
        if (!pending) {
          this.noteJobDead(data.jobId, data.subId);
          return;
        }
        try {
          pending.port.postMessage(data.message);
        } catch {
          this.unregisterClient(data.clientId);
          this.opts.onClientDead(data.clientId);
          this.noteJobDead(data.jobId, data.subId);
        }
        return;
      }
      case 'broadcast-done': {
        const job = this.pendingJobs.get(data.jobId);
        if (!job) return;
        job.pendingDone = true;
        for (const deadSubId of data.deadSubIds) {
          if (!job.deadSubIds.includes(deadSubId)) job.deadSubIds.push(deadSubId);
        }
        this.finishJobIfReady(data.jobId);
        return;
      }
      default:
        return;
    }
  }

  private noteJobDead(jobId: number, subId: string): void {
    const job = this.pendingJobs.get(jobId);
    if (!job) return;
    if (!job.deadSubIds.includes(subId)) job.deadSubIds.push(subId);
    job.pendingDone = true;
    this.finishJobIfReady(jobId);
  }

  private finishJobIfReady(jobId: number): void {
    const job = this.pendingJobs.get(jobId);
    if (!job || !job.pendingDone) return;
    this.pendingJobs.delete(jobId);
    job.resolve(job.deadSubIds);
  }
}

/**
 * Resolve the bundled fan-out worker URL as a sibling of the main worker
 * asset. Works in both tsc-emitted dev paths and esbuild bundles.
 */
export function resolveFanOutWorkerUrl(baseUrl: string): URL {
  return new URL('data-services-fanout-worker.mjs', baseUrl);
}

/**
 * @deprecated Use {@link isFanOutEnabled}. Kept for callers that read pool size.
 */
export function defaultFanOutPoolSize(): number {
  return isFanOutEnabled() ? 1 : 0;
}
