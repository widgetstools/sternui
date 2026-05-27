import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMockStream } from '../data/useMockStream';
import type { LabRow } from '../data/types';
import { getScenarioById } from './scenarios';
import { useLabDemoRegistry } from './LabDemoContext';
import type { LabStreamOptions } from './types';

/**
 * Mock stream + optional scenario overlay + registration with the
 * right-hand Demo Console rail.
 */
export function useLabRows(
  tabId: string,
  providerId: string,
  opts: LabStreamOptions = {},
) {
  const { register } = useLabDemoRegistry();
  const [tickMs, setTickMs] = useState(opts.updateIntervalMs ?? 500);
  const [paused, setPaused] = useState(false);
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  const baseRows = useMockStream(providerId, {
    ...opts,
    updateIntervalMs: tickMs,
    enableUpdates: paused ? false : (opts.enableUpdates ?? true),
  });

  const rows = useMemo(() => {
    if (!scenarioId) return baseRows;
    const scenario = getScenarioById(scenarioId);
    if (!scenario) return baseRows;
    return scenario.apply(baseRows);
  }, [baseRows, scenarioId]);

  const applyScenario = useCallback((id: string) => {
    setScenarioId(id);
  }, []);

  const clearScenario = useCallback(() => {
    setScenarioId(null);
  }, []);

  useEffect(() => {
    register({
      tabId,
      rows,
      paused,
      setPaused,
      tickMs,
      setTickMs,
      activeScenarioId: scenarioId,
      applyScenario,
      clearScenario,
    });
    return () => register(null);
  }, [
    tabId,
    rows,
    paused,
    tickMs,
    scenarioId,
    applyScenario,
    clearScenario,
    register,
  ]);

  return { rows, tickMs, setTickMs, paused, setPaused, scenarioId, applyScenario, clearScenario };
}
