import { DestroyRef, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { ProviderStats, ProviderStatus, AttachOpts } from '@starui/data-services';
import type { ProviderConfig } from '@starui/shared-types';
import { DataServicesService } from './DataServicesService';

/**
 * Reactive view of a live provider subscription. Angular twin of
 * React's `useProviderStream(id, cfg, listener)`.
 *
 * The subscription auto-detaches when the calling injector is
 * destroyed (component unmounts, root injector tears down, etc.).
 */
export interface ProviderStreamView<T = unknown> {
  /**
   * Latest snapshot rows. Replays the most recent value to late
   * subscribers. Empty `[]` until the first delta arrives.
   */
  rows$: Observable<readonly T[]>;
  /** Provider lifecycle status — `loading` → `ready` → `error?`. */
  status$: Observable<ProviderStatus>;
  /** Last error message (if any). */
  error$: Observable<string | undefined>;
  /**
   * Re-attach with `extra` payload — the Hub forwards it to
   * `provider.restart(extra)`. Common uses:
   *   - `{ asOfDate: '2026-04-01' }` for historical mode
   *   - `{ __refresh: Date.now() }` for a manual refresh button
   */
  refresh(extra?: Record<string, unknown>): void;
}

export function injectProviderStream<T = unknown>(
  providerId: string,
  cfg: ProviderConfig,
  opts: AttachOpts = {},
): ProviderStreamView<T> {
  const ds = inject(DataServicesService);
  const destroyRef = inject(DestroyRef);

  const rowsSubject = new BehaviorSubject<readonly T[]>([]);
  const statusSubject = new BehaviorSubject<ProviderStatus>('loading');
  const errorSubject = new BehaviorSubject<string | undefined>(undefined);

  const handle = ds.client.subscribe<T>(providerId, cfg, opts);

  // Snapshot resolves to the cache state at "ready". Push it through
  // rowsSubject; if it rejects (subscription cancelled before snapshot
  // arrived), surface as an error status.
  void handle.snapshot
    .then((rows) => {
      rowsSubject.next(rows);
    })
    .catch((err: unknown) => {
      errorSubject.next(err instanceof Error ? err.message : String(err));
      statusSubject.next('error');
    });

  // Live deltas after the snapshot.
  handle.onUpdate((rows) => rowsSubject.next(rows));

  // Re-snapshots from upstream restarts (peer subscriber clicked
  // refresh, etc.) — replace the rendered state.
  handle.onReset((rows) => rowsSubject.next(rows));

  // Status transitions.
  handle.onStatus((status, err) => {
    statusSubject.next(status);
    errorSubject.next(err);
  });

  // Auto-cleanup on injector destroy.
  destroyRef.onDestroy(() => {
    handle.unsubscribe();
    rowsSubject.complete();
    statusSubject.complete();
    errorSubject.complete();
  });

  const refresh = (extra?: Record<string, unknown>): void => {
    // Re-attach with extra; the Hub forwards to provider.restart.
    // Same fire-and-forget semantics as React's useProviderStream.
    ds.client.attach(
      providerId,
      undefined,
      { onDelta: () => undefined, onStatus: () => undefined },
      { extra: extra ?? { __refresh: Date.now() } },
    );
  };

  return {
    rows$: rowsSubject.asObservable(),
    status$: statusSubject.asObservable(),
    error$: errorSubject.asObservable(),
    refresh,
  };
}

/**
 * Live stats subscription. Angular twin of React's `useProviderStats(id)`.
 *
 *   const stats$ = injectProviderStats$('positions');
 *   stats$.subscribe(s => console.log(s.msgPerSec));
 */
export function injectProviderStats$(providerId: string): Observable<ProviderStats> {
  const ds = inject(DataServicesService);
  const destroyRef = inject(DestroyRef);
  const subject = new BehaviorSubject<ProviderStats | null>(null);

  const subId = ds.client.attachStats(providerId, {
    onStats: (stats) => subject.next(stats),
  });

  destroyRef.onDestroy(() => {
    ds.client.detach(subId);
    subject.complete();
  });

  // Filter out the initial null seed.
  return new Observable<ProviderStats>((observer) => {
    const sub = subject.subscribe((s) => {
      if (s !== null) observer.next(s);
    });
    return () => sub.unsubscribe();
  });
}
