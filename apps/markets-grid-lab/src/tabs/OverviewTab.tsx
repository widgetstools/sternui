import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { baseColumns, defaultColDef } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  OVERVIEW_CALC_COLUMNS,
  OVERVIEW_CC_STATE,
  OVERVIEW_COLUMN_GROUPS,
  OVERVIEW_CS_RULES,
  HEAVY_FLASH,
} from '../seeds';

const GRID_ID = 'lab-overview-v6';

const SEED = {
  'conditional-styling': { rules: OVERVIEW_CS_RULES },
  'column-customization': OVERVIEW_CC_STATE,
  'column-groups': { groups: OVERVIEW_COLUMN_GROUPS, openGroupIds: {} },
  'calculated-columns': { virtualColumns: OVERVIEW_CALC_COLUMNS },
  'general-settings': HEAVY_FLASH,
};

export function OverviewTab() {
  const rows = useMockStream('mock-positions-overview', { rowCount: 500, updateIntervalMs: 500 });
  const columnDefs = useMemo(() => baseColumns, []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Overview — kitchen-sink"
      subtitle="500 rows · 500 ms tick · 5 conditional rules · 4 calc cols · 8 column groups · module flashes only"
      help={HELP.overview}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
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
