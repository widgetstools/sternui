import { DestroyRef, inject, signal, computed, type Signal } from '@angular/core';
import type { AppDataMirror, AppDataConfig } from '@starui/data-services';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';
import { DataServicesService } from './DataServicesService';

/**
 * Reactive view of the entire AppData snapshot. Angular twin of
 * React's `useAppDataStore()`.
 *
 * The mirror's `subscribe()` callback drives a `version` Signal that
 * bumps on every mutation — consumers chain a `computed()` off it to
 * re-derive their own views.
 */
export interface AppDataStoreView {
  /** The underlying mirror — sync reads via `store.get(name, key)`. */
  store: AppDataMirror;
  /** Bumps on every AppData mutation. Use as a Signal dependency to
   *  drive `computed()` that should recompute when AppData changes. */
  version: Signal<number>;
  /** True once the mirror has applied its first snapshot from the worker. */
  loaded: Signal<boolean>;
}

export function injectAppDataStore(): AppDataStoreView {
  const ds = inject(DataServicesService);
  const destroyRef = inject(DestroyRef);

  const version = signal(0);
  const loaded = signal(ds.appData.isReady());

  // Bump version on every mirror change. Mirror's `subscribe` returns
  // an unsubscribe; tie it to the injector's destroy hook so dynamic
  // injectors don't leak the listener.
  const off = ds.appData.subscribe(() => version.update((v) => v + 1));
  destroyRef.onDestroy(off);

  // `loaded` flips once the initial snapshot arrives. ready() is
  // idempotent so calling it more than once across helpers is fine.
  void ds.appData.ready().then(() => loaded.set(true));

  return { store: ds.appData, version, loaded };
}

/**
 * Per-provider scoped reactive view. Angular twin of React's
 * `useAppData(name)`.
 *
 *   const positions = injectAppData('positions');
 *   const date = positions.get('asOfDate');             // sync read
 *   await positions.set('asOfDate', '2026-04-30');      // async write + broadcast
 *   effect(() => console.log(positions.values()));      // reactive
 */
export interface AppDataHandle {
  /** Reactive map of `name`'s current key→value pairs. Empty until loaded. */
  values: Signal<Record<string, unknown>>;
  /** Whether the mirror has applied its first snapshot. */
  loaded: Signal<boolean>;
  /** Sync read. Returns undefined for unknown keys or pre-load. */
  get(key: string): unknown;
  /** Write a single key. Creates the AppData row on first set if it
   *  doesn't already exist. Resolves after the worker round-trip. */
  set(key: string, value: unknown): Promise<void>;
  /** Replace the entire variable map for this provider in one round-trip. */
  setMany(values: Record<string, unknown>): Promise<void>;
}

export function injectAppData(providerName: string): AppDataHandle {
  const { store, version, loaded } = injectAppDataStore();

  // `version` participates so any AppData mutation re-derives `values`.
  // `loaded` participates so the very-first hydration triggers a recompute.
  const values = computed<Record<string, unknown>>(() => {
    void version();
    void loaded();
    const row = store.list().find((r) => r.name === providerName);
    return row ? { ...row.values } : {};
  });

  const get = (key: string): unknown => store.get(providerName, key);

  const set = (key: string, value: unknown): Promise<void> =>
    store.set(providerName, key, value);

  const setMany = async (next: Record<string, unknown>): Promise<void> => {
    const existing = store.list().find((r) => r.name === providerName);
    const config: AppDataConfig = {
      configId: existing?.configId ?? '',
      name: providerName,
      ...(existing?.description !== undefined ? { description: existing.description } : {}),
      isPublic: existing?.isPublic ?? false,
      values: next,
      // Preserve a public ('system') row's userId; otherwise land on the
      // canonical logged-in user id so a fresh row never gets userId=''.
      userId: existing?.userId ?? LOGGED_IN_USER_ID,
    };
    await store.upsertConfig(config);
  };

  return { values, loaded, get, set, setMany };
}
