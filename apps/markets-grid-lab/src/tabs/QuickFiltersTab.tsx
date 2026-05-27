import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  QUICK_FILTERS_ACTIVE_PROFILE_ID,
  QUICK_FILTERS_DEMO_PROFILES,
  QUICK_FILTERS_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip',
  'ticker',
  'instrumentDescription',
  'assetClass',
  'issuerSector',
  'compositeRating',
  'currency',
  'book',
  'trader',
  'bidPrice',
  'midPrice',
  'askPrice',
  'yieldToMaturity',
  'yieldToWorst',
  'oas',
  'modifiedDuration',
  'marketValue',
  'unrealizedPnL',
  'dailyPnL',
  'mtdPnL',
];

export function QuickFiltersTab() {
  const { rows } = useLabRows('filters', 'mock-positions-quick-filters', {
    rowCount: 400,
    updateIntervalMs: 700,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(
    () => ({ ...defaultColDef, floatingFilter: true }),
    [],
  );
  const onReady = useLabDemoProfiles(
    QUICK_FILTERS_GRID_ID,
    QUICK_FILTERS_DEMO_PROFILES,
    QUICK_FILTERS_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Quick filter buttons"
      subtitle={`${QUICK_FILTERS_DEMO_PROFILES.length} profiles · saved filter pills · toggle · capture · AND stack`}
      help={HELP.quickFilters}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={QUICK_FILTERS_GRID_ID}
          componentName="QuickFilters"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={memoizedDefaultColDef}
          rowIdField="id"
          storage={labStorage}
          onReady={onReady}
          showFiltersToolbar
          showProfileSelector
          showSaveButton
          showSettingsButton
          sideBar={{ toolPanels: ['filters'] }}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
            ],
          }}
        />
      </div>
    </TabContainer>
  );
}
