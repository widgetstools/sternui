/**
 * useDataPlaneValue — subscribe to a keyed-resource provider key.
 *
 * Returns the latest value for `(providerId, key)` and re-renders
 * the component whenever the worker broadcasts an `update`. The
 * initial value fetches via `client.get` (cached if warm, fresh
 * otherwise) and thereafter is driven purely by `subscribe` pushes.
 *
 * Lifecycle
 * ---------
 *   mount → subscribe + get
 *   (any worker update) → setState
 *   unmount / providerId or key change → unsubscribe, cancel pending get
 *
 * Backed by `useSyncExternalStore`-style semantics — the subscription
 * survives concurrent rendering correctly because we use refs for
 * the latest value + a stable subscribe callback.
 */

import { useEffect, useRef, useState } from 'react';
import type { DataPlaneClientError, KeyedUpdateEvent } from '@marketsui/data-plane/client';
import { useDataPlaneClient } from './context';

export interface UseValueOpts {
  /**
   * Whether to run an initial `client.get(...)` on mount. Default:
   * `true`. Set to `false` for keys that are write-only or for
   * components that only care about updates-from-now.
   */
  fetchInitial?: boolean;
}

export interface UseValueResult<T> {
  value: T | undefined;
  isLoading: boolean;
  error: DataPlaneClientError | null;
}

export function useDataPlaneValue<T = unknown>(
  providerId: string,
  key: string,
  opts: UseValueOpts = {},
): UseValueResult<T> {
  const client = useDataPlaneClient();
  const [value, setValue] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(opts.fetchInitial !== false);
  const [error, setError] = useState<DataPlaneClientError | null>(null);

  // Keep a mounted ref so async callbacks don't setState on a torn
  // component (legitimate on StrictMode double-mount too).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    setValue(undefined);
    setError(null);

    // Kick off subscribe first so we don't miss an update between
    // `get` and `subscribe` calls.
    client
      .subscribe<T>(providerId, key, (ev: KeyedUpdateEvent<T>) => {
        if (cancelled || !mountedRef.current) return;
        setValue(ev.value);
      }, (err) => {
        if (cancelled || !mountedRef.current) return;
        setError(err);
      })
      .then((unsubFn) => {
        if (cancelled) {
          unsubFn();
          return;
        }
        unsub = unsubFn;
      })
      .catch((err: unknown) => {
        if (cancelled || !mountedRef.current) return;
        setError(err as DataPlaneClientError);
      });

    if (opts.fetchInitial !== false) {
      setIsLoading(true);
      client
        .get<T>(providerId, key)
        .then((v) => {
          if (cancelled || !mountedRef.current) return;
          setValue((current) => (current === undefined ? v : current));
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled || !mountedRef.current) return;
          setError(err as DataPlaneClientError);
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [client, providerId, key, opts.fetchInitial]);

  return { value, isLoading, error };
}
