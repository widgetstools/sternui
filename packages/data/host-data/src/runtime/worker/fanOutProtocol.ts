/**
 * Wire protocol between the SharedWorker hub and dedicated fan-out workers.
 * One fan-out worker is spawned per hub `subId` on attach; the window
 * MessagePort stays on the hub — workers prepare per-subscriber envelopes
 * and the pool posts them to the client port.
 */

/** Hub → fan-out worker (control channel). */
export type FanOutHubToWorker =
  | { type: 'register'; subId: string; clientId: string }
  | { type: 'unregister'; subId: string }
  | {
      type: 'broadcast';
      jobId: number;
      subId: string;
      clientId: string;
      event: unknown;
    }
  | { type: 'dispose' };

/** Fan-out worker → hub (control channel). */
export type FanOutWorkerToHub =
  | {
      type: 'deliver';
      jobId: number;
      clientId: string;
      subId: string;
      message: unknown;
    }
  | { type: 'broadcast-done'; jobId: number; deadSubIds: string[] };

/** First message on a new worker — no port transfer. */
export interface FanOutWorkerInit {
  type: 'init';
}

export type FanOutWorkerInbound = FanOutWorkerInit | FanOutHubToWorker;
