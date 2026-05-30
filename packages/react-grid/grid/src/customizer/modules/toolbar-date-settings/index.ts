import type { Module } from '@starui/engine';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';
import { ToolbarDateSettingsPanel } from './ToolbarDateSettingsPanel';

export {
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  INITIAL_TOOLBAR_DATE_SETTINGS,
  type ToolbarDateSettingsState,
} from './state';
export {
  applyHistoricalToolbarDateToAppData,
  isHistoricalToolbarDate,
  resolveToolbarDateHistoryEnabled,
} from './applyHistoricalToolbarDateToAppData';
export { useToolbarDateSettingsBridge } from './useToolbarDateSettingsBridge';
export { ToolbarDateSettingsPanel } from './ToolbarDateSettingsPanel';

export const toolbarDateSettingsModule: Module<ToolbarDateSettingsState> = {
  id: TOOLBAR_DATE_SETTINGS_MODULE_ID,
  name: 'Custom Settings',
  code: '19',
  schemaVersion: 1,
  priority: 1002,

  getInitialState: () => ({ ...INITIAL_TOOLBAR_DATE_SETTINGS }),

  serialize: (state) => state,

  deserialize: (raw) => ({
    ...INITIAL_TOOLBAR_DATE_SETTINGS,
    ...((raw as Partial<ToolbarDateSettingsState> | null) ?? {}),
  }),

  migrate: (raw) =>
    !raw || typeof raw !== 'object'
      ? { ...INITIAL_TOOLBAR_DATE_SETTINGS }
      : { ...INITIAL_TOOLBAR_DATE_SETTINGS, ...(raw as Partial<ToolbarDateSettingsState>) },

  SettingsPanel: ToolbarDateSettingsPanel,
};
