/**
 * Restart a provider from a window that is NOT subscribed to its push stream.
 *
 * The Demo Console's pause, tick-rate and "clear scenario" controls all mean
 * "re-run the generator with a different overlay", which is
 * `provider.restart(extra)` in the worker. On the CSRM lab that was free —
 * every tab held a push subscription, so it just re-attached with `extra`.
 *
 * A pull-path window holds no such subscription: it opens a View against the
 * Table and receives no rows at all. So the restart is issued the only way the
 * hub exposes it — a transient attach carrying `extra` (the hub calls
 * `handle.restart(extra)` when the provider is already running), detached on
 * the next turn.
 *
 * The cost is one cache replay to that short-lived subscriber. That is
 * acceptable for a button press and would not be for anything per-tick, which
 * is why nothing on the render path uses it.
 */
import type { ProviderConfig } from '@starui/types';

interface RestartCapableClient {
  subscribe(
    providerId: string,
    cfg: ProviderConfig | undefined,
    opts: { extra?: Record<string, unknown> },
  ): { subId: string };
  detach(subId: string): void;
}

export function restartLabProvider(
  client: unknown,
  providerId: string,
  extra: Record<string, unknown>,
  /**
   * Pass the CURRENT config to force a rebuild of the running provider.
   *
   * Without it the hub restarts the slot it already has — which was created
   * from whatever cfg was current when the provider first started, and keeps
   * its Table. That matters because a Table is built from the config's
   * declared schema: change the declaration and a reload alone will NOT pick
   * it up, since the SharedWorker outlives the page and the attach re-opens
   * the existing Table.
   *
   * MEASURED the hard way while building this app: declaring the index column
   * `id` as `number` made Perspective COERCE every `POS-…` string to `0`, so
   * all 500 rows upserted onto one row. Fixing the declaration changed
   * nothing on screen until the provider was recreated — the worker was still
   * serving the Table built from the old schema. `providerCfgEqual` in the hub
   * gates the rebuild, so passing an unchanged cfg is free.
   */
  cfg?: ProviderConfig,
): void {
  const c = client as Partial<RestartCapableClient>;
  if (typeof c.subscribe !== 'function' || typeof c.detach !== 'function') return;
  try {
    // `__restartAt` guarantees the overlay differs from the last one, so the
    // hub takes the RESTART branch rather than treating this as a late-join.
    const handle = c.subscribe(providerId, cfg, {
      extra: { ...extra, __restartAt: Date.now() },
    });
    // Next turn, not immediately: detaching inside the same task can race the
    // worker's registration of the subId, and an unregistered detach is a
    // no-op that would leak the subscriber.
    setTimeout(() => {
      try {
        c.detach!(handle.subId);
      } catch {
        /* the window is going away anyway */
      }
    }, 0);
  } catch {
    /* a failed restart must not throw out of a click handler */
  }
}
