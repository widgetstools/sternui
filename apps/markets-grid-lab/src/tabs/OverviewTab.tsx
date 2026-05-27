import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { baseColumns, defaultColDef } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  OVERVIEW_ACTIVE_PROFILE_ID,
  OVERVIEW_DEMO_PROFILES,
  OVERVIEW_GRID_ID,
} from '../profiles/catalogs';

export function OverviewTab() {
  const { rows } = useLabRows('overview', 'mock-positions-overview', {
    rowCount: 500,
    updateIntervalMs: 500,
  });
  const columnDefs = useMemo(() => baseColumns, []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useLabDemoProfiles(
    OVERVIEW_GRID_ID,
    OVERVIEW_DEMO_PROFILES,
    OVERVIEW_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Overview — kitchen-sink"
      subtitle={`${OVERVIEW_DEMO_PROFILES.length} profiles · multi-module seed · pick a lens in the profile selector`}
      help={HELP.overview}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={OVERVIEW_GRID_ID}
          componentName="Overview"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={memoizedDefaultColDef}
          rowIdField="id"
          storage={labStorage}
          onReady={onReady}
          showFiltersToolbar
          showFormattingToolbar
          showProfileSelector
          showSaveButton
          showSettingsButton
          sideBar={{ toolPanels: ['columns', 'filters'] }}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
              { statusPanel: 'agAggregationComponent', align: 'right' },
            ],
          }}
        />
      </div>
    </TabContainer>
  );
}
