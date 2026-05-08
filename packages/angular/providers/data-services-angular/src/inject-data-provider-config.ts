import { DestroyRef, inject } from '@angular/core';
import { BehaviorSubject, type Observable } from 'rxjs';
import type { DataProviderConfig } from '@starui/shared-types';
import type { ProviderConfig } from '@starui/shared-types';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';
import { DataServicesService } from './DataServicesService';

/**
 * Single saved data-provider config row by id. Angular twin of
 * React's `useDataProviderConfig(id)`.
 */
export interface DataProviderConfigView {
  cfg: DataProviderConfig | null;
  loading: boolean;
  error?: string;
}

export function injectDataProviderConfig$(providerId: string | null | undefined): Observable<DataProviderConfigView> {
  const ds = inject(DataServicesService);
  const destroyRef = inject(DestroyRef);

  const subject = new BehaviorSubject<DataProviderConfigView>({
    cfg: null,
    loading: Boolean(providerId),
  });

  if (providerId) {
    void ds.configStore.get(providerId)
      .then((cfg) => subject.next({ cfg, loading: false }))
      .catch((err: unknown) => subject.next({
        cfg: null,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
  } else {
    subject.next({ cfg: null, loading: false });
  }

  destroyRef.onDestroy(() => subject.complete());

  return subject.asObservable();
}

/**
 * List of saved provider configs visible to the active user. Angular
 * twin of React's `useDataProvidersList()`.
 *
 * Returns the union of public (`userId === 'system'`) + the active
 * user's own rows, optionally filtered by subtype. `refresh()` triggers
 * a re-fetch — useful after the editor saves a new row and the picker
 * needs to repopulate.
 */
export interface DataProvidersListView {
  configs$: Observable<readonly DataProviderConfig[]>;
  loading$: Observable<boolean>;
  error$: Observable<string | undefined>;
  refresh(): void;
}

export interface ListOptions {
  /** Active user id. Defaults to `LOGGED_IN_USER_ID`. */
  userId?: string;
  /** Narrow by transport type (`'stomp'`, `'rest'`, etc.). */
  subtype?: ProviderConfig['providerType'];
  /** Include AppData rows in the result. */
  includeAppData?: boolean;
}

export function injectDataProvidersList$(opts: ListOptions = {}): DataProvidersListView {
  const ds = inject(DataServicesService);
  const destroyRef = inject(DestroyRef);

  const configsSubject = new BehaviorSubject<readonly DataProviderConfig[]>([]);
  const loadingSubject = new BehaviorSubject<boolean>(true);
  const errorSubject = new BehaviorSubject<string | undefined>(undefined);

  const userId = opts.userId ?? LOGGED_IN_USER_ID;

  const fetch = (): void => {
    loadingSubject.next(true);
    errorSubject.next(undefined);
    const listOpts: { subtype?: ProviderConfig['providerType']; includeAppData?: boolean } = {};
    if (opts.subtype) listOpts.subtype = opts.subtype;
    if (opts.includeAppData) listOpts.includeAppData = true;

    void ds.configStore.list(userId, listOpts)
      .then((rows) => {
        configsSubject.next(rows);
        loadingSubject.next(false);
      })
      .catch((err: unknown) => {
        errorSubject.next(err instanceof Error ? err.message : String(err));
        loadingSubject.next(false);
      });
  };

  fetch();

  destroyRef.onDestroy(() => {
    configsSubject.complete();
    loadingSubject.complete();
    errorSubject.complete();
  });

  return {
    configs$: configsSubject.asObservable(),
    loading$: loadingSubject.asObservable(),
    error$: errorSubject.asObservable(),
    refresh: fetch,
  };
}
