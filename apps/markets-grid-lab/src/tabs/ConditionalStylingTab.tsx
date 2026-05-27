import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  CONDITIONAL_ACTIVE_PROFILE_ID,
  CONDITIONAL_DEMO_PROFILES,
  CONDITIONAL_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'oas',
  'modifiedDuration', 'dv01',
  'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'maturityDate', 'lastUpdate',
];

export function ConditionalStylingTab() {
  const { rows } = useLabRows('conditional', 'mock-positions-conditional', {
    rowCount: 500,
    updateIntervalMs: 500,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useLabDemoProfiles(
    CONDITIONAL_GRID_ID,
    CONDITIONAL_DEMO_PROFILES,
    CONDITIONAL_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Conditional Styling"
      subtitle={`${CONDITIONAL_DEMO_PROFILES.length} profiles · up to 13 rules · flash · diff · row scope · indicators`}
      help={HELP.conditionalStyling}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={CONDITIONAL_GRID_ID}
          componentName="Conditional Styling"
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
