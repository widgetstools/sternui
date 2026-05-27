// Vite `?raw` loads the file content as a string at build time.
import overview from './overview.md?raw';
import formatting from './formatting.md?raw';
import renderers from './renderers.md?raw';
import formatterToolbar from './formatter-toolbar.md?raw';
import columnGroups from './column-groups.md?raw';
import calculatedColumns from './calculated-columns.md?raw';
import conditionalStyling from './conditional-styling.md?raw';
import liveUpdates from './live-updates.md?raw';
import profiles from './profiles.md?raw';
import alerts from './alerts.md?raw';
import quickFilters from './quick-filters.md?raw';
import smartEdit from './smart-edit.md?raw';

export const HELP = {
  overview,
  formatting,
  renderers,
  formatterToolbar,
  columnGroups,
  calculatedColumns,
  conditionalStyling,
  liveUpdates,
  profiles,
  alerts,
  quickFilters,
  smartEdit,
} as const;
