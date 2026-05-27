import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  CALCULATED_ACTIVE_PROFILE_ID,
  CALCULATED_DEMO_PROFILES,
  CALCULATED_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'yieldToWorst', 'oas', 'benchmarkYield',
  'modifiedDuration', 'dv01', 'convexity', 'cs01',
  'marketValue', 'quantityFace', 'avgDailyVolume30d',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
];

export function CalculatedColumnsTab() {
  const { rows } = useLabRows('calc', 'mock-positions-calculated', {
    rowCount: 500,
    updateIntervalMs: 500,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useLabDemoProfiles(
    CALCULATED_GRID_ID,
    CALCULATED_DEMO_PROFILES,
    CALCULATED_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Calculated Columns"
      subtitle={`${CALCULATED_DEMO_PROFILES.length} profiles · up to 11 virtual columns · nested IF · cross-field math`}
      help={HELP.calculatedColumns}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={CALCULATED_GRID_ID}
          componentName="Calculated"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ ...memoizedDefaultColDef, enableCellChangeFlash: true }}
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
