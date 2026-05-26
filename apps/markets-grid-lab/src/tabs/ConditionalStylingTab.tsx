import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import { CONDITIONAL_TAB_CS_RULES, HEAVY_FLASH } from '../seeds';

const GRID_ID = 'lab-conditional-v6';

const SEED = {
  'conditional-styling': { rules: CONDITIONAL_TAB_CS_RULES },
  'general-settings': HEAVY_FLASH,
};

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'oas',
  'modifiedDuration', 'dv01',
  'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'maturityDate', 'lastUpdate',
];

export function ConditionalStylingTab() {
  const rows = useMockStream('mock-positions-conditional', { rowCount: 500, updateIntervalMs: 500 });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Conditional Styling"
      subtitle="9 pre-seeded rules · cell + row scope · one-shot + pulse flash · indicators in 5 positions · cells/headers/both · activeDurationMs"
      help={HELP.conditionalStyling}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
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
