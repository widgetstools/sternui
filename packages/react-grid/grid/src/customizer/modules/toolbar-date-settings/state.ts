export const TOOLBAR_DATE_SETTINGS_MODULE_ID = 'toolbar-date-settings';

export interface ToolbarDateSettingsState {
  /** When enabled, picking a past toolbar date writes ISO `YYYY-MM-DD` to AppData. */
  historicalDateAppDataEnabled: boolean;
  /** AppData provider instance name (e.g. `positions`). */
  historicalDateAppDataProvider: string;
  /** Key within the provider (e.g. `asOfDate`). */
  historicalDateAppDataKey: string;
}

export const INITIAL_TOOLBAR_DATE_SETTINGS: ToolbarDateSettingsState = {
  historicalDateAppDataEnabled: false,
  historicalDateAppDataProvider: '',
  historicalDateAppDataKey: '',
};
