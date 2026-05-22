import type { ActiveIdSource } from '@starui/engine';
import { traceProfile } from '@starui/engine';

/**
 * OpenFin per-view active-profile pointer source.
 *
 * Stores the active profile id on the current view's `customData`. This
 * lets duplicated views show different profiles of the same MarketsGrid
 * instance: each view carries its own override on `customData`, and the
 * platform's snapshot capture round-trips it through workspace
 * save/restore for free.
 *
 * Returns `null` when `fin` is unavailable, so non-OpenFin hosts (browser,
 * Electron, tests) silently fall through to localStorage as before. Both
 * `read()` and `write()` swallow errors — the source is best-effort and
 * must never block ProfileManager boot or a profile commit.
 *
 * Read on grid mount:
 *   - When set, the manager uses this id exclusively (including explicit
 *     `__default__`). localStorage is not consulted — it is shared across
 *     all OpenFin views on the same origin and would force every duplicated
 *     view to show the same profile.
 *   - If the row no longer exists on disk, falls through to Default.
 *
 * Written on every active-id commit (boot/load/create/clone/import/
 * remove-active):
 *   - `fin.me.updateOptions({ customData: { ...current, activeProfileId } })`
 *     mutates the live view's options. `Platform.getSnapshot()` reads
 *     from those same options, so the active id is captured into the
 *     workspace snapshot automatically.
 */
export function createOpenFinViewProfileSource(): ActiveIdSource | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finGlobal = (globalThis as any).fin;
  if (!finGlobal?.me?.getOptions || !finGlobal?.me?.updateOptions) {
    traceProfile('openfin.source.unavailable', { reason: 'fin.me.getOptions/updateOptions missing' });
    return null;
  }

  traceProfile('openfin.source.ready', { note: 'OpenFin view customData activeProfileId pointer enabled' });

  return {
    async read(): Promise<string | null> {
      try {
        const opts = await finGlobal.me.getOptions();
        const id = opts?.customData?.activeProfileId;
        const resolved = typeof id === 'string' && id ? id : null;
        traceProfile('openfin.customData.read', {
          activeProfileId: resolved,
          customDataKeys: opts?.customData && typeof opts.customData === 'object'
            ? Object.keys(opts.customData as Record<string, unknown>)
            : [],
        });
        return resolved;
      } catch (err) {
        traceProfile('openfin.customData.read.error', { error: String(err) });
        return null;
      }
    },
    async write(id: string): Promise<void> {
      try {
        const opts = await finGlobal.me.getOptions();
        const current = (opts?.customData ?? {}) as Record<string, unknown>;
        if (current.activeProfileId === id) {
          traceProfile('openfin.customData.write.skip', { activeProfileId: id, reason: 'unchanged' });
          return;
        }
        await finGlobal.me.updateOptions({
          customData: { ...current, activeProfileId: id },
        });
        traceProfile('openfin.customData.write', {
          activeProfileId: id,
          previousActiveProfileId: current.activeProfileId ?? null,
        });
      } catch (err) {
        traceProfile('openfin.customData.write.error', { activeProfileId: id, error: String(err) });
      }
    },
  };
}
