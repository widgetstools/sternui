import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  LIVE_ACTIVE_PROFILE_ID,
  LIVE_DEMO_PROFILES,
  LIVE_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'oas',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'lastUpdate',
];

export function LiveUpdatesTab() {
  const { rows, tickMs } = useLabRows('live', 'mock-positions-live', {
    rowCount: 500,
    updateIntervalMs: 400,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useLabDemoProfiles(LIVE_GRID_ID, LIVE_DEMO_PROFILES, LIVE_ACTIVE_PROFILE_ID);

  return (
    <TabContainer
      title="Live Updates"
      subtitle={`${LIVE_DEMO_PROFILES.length} profiles · ${tickMs} ms tick · use Demo console for scenarios`}
      help={HELP.liveUpdates}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={LIVE_GRID_ID}
          componentName="Live Updates"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={memoizedDefaultColDef}
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
