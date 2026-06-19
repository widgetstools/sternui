import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProviderClientAdapter, type IDataProvider } from '@starui/host-data';
import type { ProviderConfig } from '@starui/types';
import type { ProviderStatus } from '@starui/host-data/runtime';
import { useDataServicesContext } from './DataServicesProvider.js';

export interface UseDataProviderOpts {
  /** Draft cfg when the provider row is not in the catalog yet. */
  inlineCfg?: ProviderConfig;
  /** Automatically call `start()` when `providerId` is set. Default `true`. */
  autoStart?: boolean;
}

export interface UseDataProviderResult<T = Record<string, unknown>> {
  provider: IDataProvider<T> | null;
  status: ProviderStatus;
  error?: string;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  restart: (extra?: Record<string, unknown>) => Promise<void>;
  /** Pause realtime deltas for this subscriber (provider keeps running). */
  pause: () => void;
  /** Resume realtime deltas; the hub replays its cache to catch up. */
  resume: () => void;
  /** Reactive paused state (mirrors the provider). */
  paused: boolean;
}

/**
 * Hub-backed {@link IDataProvider} hook — preferred over legacy
 * {@link useProviderStream} for production grids.
 */
export function useDataProvider<T = Record<string, unknown>>(
  providerId: string | null | undefined,
  opts: UseDataProviderOpts = {},
): UseDataProviderResult<T> {
  const { client } = useDataServicesContext();
  const { inlineCfg, autoStart = true } = opts;

  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);
  const [paused, setPaused] = useState(false);

  const provider = useMemo(() => {
    if (!providerId) return null;
    return new ProviderClientAdapter<T>({ client, providerId, inlineCfg });
  }, [client, providerId, inlineCfg]);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    if (!provider) {
      setStatus('loading');
      setError(undefined);
      return;
    }

    const unsubStatus = provider.onStatus((s: ProviderStatus, err?: string) => {
      setStatus(s);
      setError(err);
    });
    const unsubError = provider.onError((err: Error) => {
      setError(err.message);
      setStatus('error');
    });

    return () => {
      unsubStatus();
      unsubError();
      void provider.stop();
    };
  }, [provider]);

  const start = useCallback(async () => {
    const active = providerRef.current;
    if (!active) return;
    setStatus('loading');
    setError(undefined);
    try {
      await active.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!autoStart || !provider) return;
    let cancelled = false;
    void (async () => {
      try {
        setStatus('loading');
        setError(undefined);
        await provider.start();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [provider, autoStart]);

  const refresh = useCallback(async () => {
    await providerRef.current?.refresh();
  }, []);

  const pause = useCallback(() => {
    providerRef.current?.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    providerRef.current?.resume();
    setPaused(false);
  }, []);

  // A freshly-created provider (providerId change) starts unpaused.
  useEffect(() => { setPaused(provider?.isPaused() ?? false); }, [provider]);

  const restart = useCallback(async (extra?: Record<string, unknown>) => {
    const active = providerRef.current;
    if (!active) return;
    setStatus('loading');
    setError(undefined);
    try {
      await active.restart(extra);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      throw err;
    }
  }, []);

  return { provider, status, error, start, refresh, restart, pause, resume, paused };
}
