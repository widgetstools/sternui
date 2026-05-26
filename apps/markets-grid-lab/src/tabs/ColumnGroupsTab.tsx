import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { baseColumns, defaultColDef } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import { OVERVIEW_COLUMN_GROUPS } from '../seeds';

const GRID_ID = 'lab-column-groups-v4';

const SEED = {
  'column-groups': { groups: OVERVIEW_COLUMN_GROUPS, openGroupIds: {} },
};

export function ColumnGroupsTab() {
  const rows = useMockStream('mock-positions-column-groups', { rowCount: 500, updateIntervalMs: 600 });
  const columnDefs = useMemo(() => baseColumns, []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Column Groups"
      subtitle="8 module-seeded groups · 4 use columnGroupShow:'open' to reveal more on expand · Pricing + P&L open by default"
      help={HELP.columnGroups}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
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
