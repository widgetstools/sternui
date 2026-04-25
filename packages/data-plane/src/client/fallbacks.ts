/**
 * fallbacks.ts — transport selection + degradation ladder.
 *
 * Preferred:   SharedWorker  (cross-tab, same-origin)
 * Degraded:    Worker        (per-tab; still off the main thread)
 * Last resort: MessageChannel + in-page Router  (no workers available;
 *              useful for tests, OpenFin view contexts that forbid
 *              workers, and for keeping the API uniform in SSR/
 *              non-browser runtimes where the caller picks up a
 *              client immediately after module import).
 *
 * Each branch produces a `MessagePort` for `DataPlaneClient`. The
 * client is transport-agnostic — from its perspective they're all
 * just ports.
 */

export type TransportMode = 'shared-worker' | 'dedicated-worker' | 'in-page';

export interface TransportSelection {
  mode: TransportMode;
  port: MessagePort;
  /** Call to release any transport-level resources (the worker, timers, etc.). */
  close: () => void;
}

export function hasSharedWorker(): boolean {
  return typeof SharedWorker !== 'undefined';
}

export function hasDedicatedWorker(): boolean {
  return typeof Worker !== 'undefined';
}
