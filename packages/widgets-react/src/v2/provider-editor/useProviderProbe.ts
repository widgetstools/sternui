/**
 * useProviderProbe — Test Connection + Infer Fields in one hook.
 *
 * Replaces the four per-transport hooks v1 had
 * (useStompConnectionTest / useRestConnectionTest /
 *  useStompFieldInference / useRestFieldInference). The probe
 * functions live in `@marketsui/data-plane/v2/worker` and are pure —
 * no React, no SharedWorker. We call them from the main thread and
 * track the in-flight state here.
 */

import { useCallback, useState } from 'react';
import { probeStomp, probeRest, inferFields } from '@marketsui/data-plane/v2/worker';
import type { ProviderConfig, FieldNode } from '@marketsui/shared-types';

export interface ProbeState {
  testing: boolean;
  testResult: { success: boolean; rowCount?: number; error?: string } | null;
  inferring: boolean;
  inferredFields: FieldNode[];
  inferenceSummary: { rowsFetched: number; rowsUsed: number; fieldsDetected: number } | null;
  inferenceError: string | null;
  test(): Promise<void>;
  infer(opts?: { sampleSize?: number }): Promise<void>;
  reset(): void;
}

export function useProviderProbe(cfg: ProviderConfig | null): ProbeState {
  const [state, setState] = useState<Omit<ProbeState, 'test' | 'infer' | 'reset'>>({
    testing: false,
    testResult: null,
    inferring: false,
    inferredFields: [],
    inferenceSummary: null,
    inferenceError: null,
  });

  const test = useCallback(async () => {
    if (!cfg) return;
    setState((s) => ({ ...s, testing: true, testResult: null }));
    try {
      const result = await probeOnce(cfg, { maxRows: 5, timeoutMs: 10_000 });
      setState((s) => ({
        ...s,
        testing: false,
        testResult: result.ok
          ? { success: true, rowCount: result.rows?.length ?? 0 }
          : { success: false, error: result.error },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        testing: false,
        testResult: { success: false, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [cfg]);

  const infer = useCallback(async (opts: { sampleSize?: number } = {}) => {
    if (!cfg) return;
    const sampleSize = opts.sampleSize ?? 200;
    setState((s) => ({ ...s, inferring: true, inferenceError: null }));
    try {
      const fetchSize = Math.min(Math.max(sampleSize * 2, sampleSize + 50), 1000);
      const result = await probeOnce(cfg, { maxRows: fetchSize, timeoutMs: 30_000 });
      if (!result.ok) {
        setState((s) => ({ ...s, inferring: false, inferenceError: result.error ?? 'probe failed' }));
        return;
      }
      const { fields, rowsFetched, rowsUsed } = inferFields(result.rows ?? [], { targetSampleSize: sampleSize });
      setState((s) => ({
        ...s,
        inferring: false,
        inferredFields: fields,
        inferenceSummary: { rowsFetched, rowsUsed, fieldsDetected: fields.length },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        inferring: false,
        inferenceError: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [cfg]);

  const reset = useCallback(() => {
    setState({
      testing: false,
      testResult: null,
      inferring: false,
      inferredFields: [],
      inferenceSummary: null,
      inferenceError: null,
    });
  }, []);

  return { ...state, test, infer, reset };
}

async function probeOnce(
  cfg: ProviderConfig,
  opts: { maxRows: number; timeoutMs: number },
): Promise<{ ok: boolean; rows?: readonly unknown[]; error?: string }> {
  switch (cfg.providerType) {
    case 'stomp': return probeStomp(cfg, opts);
    case 'rest':  return probeRest(cfg);
    case 'mock':  return { ok: true, rows: [] };
    case 'appdata': return { ok: true, rows: [] };
    default:      return { ok: false, error: `Probe not implemented for ${cfg.providerType}` };
  }
}
