import type { LabRow } from '../data/types';

export interface LabStreamOptions {
  rowCount?: number;
  updateIntervalMs?: number;
  enableUpdates?: boolean;
  /**
   * Subscribe at all. Default true.
   *
   * Distinct from `enableUpdates`, which only stops the ticks: the snapshot
   * still arrives and the window still holds it. A tab whose active surface
   * reads from the worker-held Table sets this false, or it materializes the
   * whole book for nothing — see `StreamOptions.enabled` in `data/types.ts`
   * for the measurement that produced this option.
   */
  enabled?: boolean;
}

export interface LabScenario {
  id: string;
  title: string;
  description: string;
  /** Accent for card chrome — design-system semantic hues only */
  accent: 'positive' | 'negative' | 'warning' | 'info' | 'neutral';
  /** Which lab tab(s) this scenario is meant for */
  tabs: string[];
  apply: (rows: readonly LabRow[]) => LabRow[];
}

export interface LabStreamHandle {
  tabId: string;
  getRowCount: () => number;
  /** Rows after the last full provider snapshot (stable between ticks). */
  snapshotRowCount: number;
  paused: boolean;
  setPaused: (v: boolean) => void;
  tickMs: number;
  setTickMs: (ms: number) => void;
  activeScenarioId: string | null;
  applyScenario: (id: string) => void;
  clearScenario: () => void;
}
