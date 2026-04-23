import type { WidgetConfig } from './widget.js';

/**
 * SettingsScreenContext — the return type of useSettingsScreen().
 * Provides access to the parent widget's config from a settings screen.
 */
export interface SettingsScreenContext {
  // Parent identity
  parentConfigId: string;
  parentInstanceId: string;
  parentViewId: string;

  // Parent's configuration
  config: WidgetConfig | null;
  isLoading: boolean;
  error: Error | null;

  // Operations
  saveConfig: (updates: Partial<WidgetConfig>) => Promise<void>;
  close: (result?: unknown) => void;

  // Data passed by openSettings()
  launchData: Record<string, unknown> | null;

  // Hierarchy awareness
  configSource: 'own' | 'inherited';
  inheritedFrom?: string;
  forkAndSave: (updates: Partial<WidgetConfig>, newName?: string) => Promise<void>;
}

/**
 * SettingsScreenDefinition — metadata for a registered settings screen.
 */
export interface SettingsScreenDefinition {
  id: string;
  label: string;
  route: string;
  component?: React.ComponentType;
}
