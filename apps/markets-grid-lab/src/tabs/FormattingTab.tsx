import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabRows } from '../demo/useLabRows';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  FORMATTING_ACTIVE_PROFILE_ID,
  FORMATTING_DEMO_PROFILES,
  FORMATTING_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'currency', 'compositeRating', 'issuerSector',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
  'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'currentYield',
  'oas', 'zSpread',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue', 'avgCost',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'issueDate', 'maturityDate', 'lastUpdate',
];

export function FormattingTab() {
  const { rows } = useLabRows('formatting', 'mock-positions-formatting', {
    rowCount: 500,
    updateIntervalMs: 600,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const onReady = useLabDemoProfiles(
    FORMATTING_GRID_ID,
    FORMATTING_DEMO_PROFILES,
    FORMATTING_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Formatting"
      subtitle={`${FORMATTING_DEMO_PROFILES.length} profiles · preset · Excel · tick · themed overrides · globals`}
      help={HELP.formatting}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={FORMATTING_GRID_ID}
          componentName="Formatting"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowIdField="id"
          storage={labStorage}
          onReady={onReady}
          showFormattingToolbar
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}
