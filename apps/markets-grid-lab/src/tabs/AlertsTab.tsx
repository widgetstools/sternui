import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  ALERTS_ACTIVE_PROFILE_ID,
  ALERTS_DEMO_PROFILES,
  ALERTS_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'yieldToWorst',
  'marketValue',
  'unrealizedPnL', 'dailyPnL',
  'lastUpdate',
];

export function AlertsTab() {
  const { rows } = useLabRows('alerts', 'mock-positions-alerts', {
    rowCount: 250,
    updateIntervalMs: 600,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useLabDemoProfiles(ALERTS_GRID_ID, ALERTS_DEMO_PROFILES, ALERTS_ACTIVE_PROFILE_ID);

  return (
    <TabContainer
      title="Alerts"
      subtitle={`${ALERTS_DEMO_PROFILES.length} profiles · triggers · channels · debounce · rate limit`}
      help={HELP.alerts}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={ALERTS_GRID_ID}
          componentName="Alerts"
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
