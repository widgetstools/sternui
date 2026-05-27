import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { baseColumns, defaultColDef } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  COLUMN_GROUPS_ACTIVE_PROFILE_ID,
  COLUMN_GROUPS_DEMO_PROFILES,
  COLUMN_GROUPS_GRID_ID,
} from '../profiles/catalogs';

export function ColumnGroupsTab() {
  const { rows } = useLabRows('groups', 'mock-positions-column-groups', {
    rowCount: 500,
    updateIntervalMs: 600,
  });
  const columnDefs = useMemo(() => baseColumns, []);
  const onReady = useLabDemoProfiles(
    COLUMN_GROUPS_GRID_ID,
    COLUMN_GROUPS_DEMO_PROFILES,
    COLUMN_GROUPS_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Column Groups"
      subtitle={`${COLUMN_GROUPS_DEMO_PROFILES.length} profiles · 8 nested groups · open/closed presets`}
      help={HELP.columnGroups}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={COLUMN_GROUPS_GRID_ID}
          componentName="Column Groups"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowIdField="id"
          storage={labStorage}
          onReady={onReady}
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}
