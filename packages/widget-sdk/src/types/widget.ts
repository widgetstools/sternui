import type { LayoutInfo, UnifiedConfig } from '@marketsui/shared-types';

/**
 * WidgetConfig — the config shape widgets receive from useWidget().
 * This is essentially UnifiedConfig but narrowed for widget consumption.
 */
export type WidgetConfig = UnifiedConfig;

/**
 * WidgetProps — the base props that every widget component receives.
 */
export interface WidgetProps {
  configId: string;
  launchData?: Record<string, unknown>;
}

/**
 * WidgetContext — the return type of the useWidget(configId) hook.
 * Provides everything a widget needs: config, lifecycle, layouts, communication, hierarchy.
 */
export interface WidgetContext {
  // ─── Identity ──────────────────────────────────────────
  id: string;                    // Unique widget instance ID
  configId: string;              // Configuration ID (from props)
  isOpenFin: boolean;            // true if running in OpenFin

  // ─── Configuration ────────────────────────────────────
  config: WidgetConfig | null;   // Current config (resolved through hierarchy)
  isLoading: boolean;            // true while config is being fetched
  error: Error | null;           // Config fetch error (if any)
  updateConfig: (updates: Partial<WidgetConfig>) => Promise<void>;
  saveConfig: (config?: WidgetConfig) => Promise<void>;
  refetchConfig: () => Promise<void>;

  // ─── Layouts ──────────────────────────────────────────
  layouts: LayoutInfo[];
  activeLayout: LayoutInfo | null;
  saveLayout: (name: string, state: unknown) => Promise<LayoutInfo>;
  loadLayout: (layoutId: string) => Promise<unknown>;
  deleteLayout: (layoutId: string) => Promise<void>;
  setActiveLayout: (layoutId: string) => void;

  // ─── Lifecycle ────────────────────────────────────────
  onSave: (handler: () => Promise<void> | void) => void;
  onDestroy: (handler: () => void) => void;

  // ─── Communication ────────────────────────────────────
  open: (widgetType: string, data?: Record<string, unknown>) => Promise<void>;
  broadcast: (topic: string, data: unknown) => void;
  subscribe: (topic: string, handler: (data: unknown) => void) => () => void;
  launchData: Record<string, unknown> | null;

  // ─── Settings Screens ─────────────────────────────────
  openSettings: (screenId: string, data?: Record<string, unknown>) => Promise<void>;

  // ─── Platform ─────────────────────────────────────────
  platform: import('./platform.js').PlatformAdapter;
}

/**
 * WidgetHostProps — props for the WidgetHost provider component.
 */
export interface WidgetHostProps {
  apiUrl: string;
  userId: string;
  platform?: import('./platform.js').PlatformAdapter;
  registry?: import('../registry/WidgetRegistry.js').WidgetRegistry;
  theme?: 'light' | 'dark';
  children: React.ReactNode;
}
