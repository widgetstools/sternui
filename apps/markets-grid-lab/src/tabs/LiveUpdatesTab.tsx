import { useMemo, useState } from 'react';
import { MarketsGrid } from '@starui/grid';
import { Slider } from '@starui/ui';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import { LIVE_TAB_CS_RULES, FAST_FLASH } from '../seeds';

const GRID_ID = 'lab-live-v5';

const SEED = {
  'conditional-styling': { rules: LIVE_TAB_CS_RULES },
  'general-settings': FAST_FLASH,
};

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'oas',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'lastUpdate',
];

export function LiveUpdatesTab() {
  const [tickMs, setTickMs] = useState(400);
  const rows = useMockStream('mock-positions-live', { rowCount: 500, updateIntervalMs: tickMs });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Live Updates"
      subtitle={`500 rows · ${tickMs} ms tick · 3 flash rules (sky tick + emerald wins + rose losses) · 500 ms flash duration`}
      help={HELP.liveUpdates}
      actions={
        <div className="flex items-center gap-2 pr-2">
          <span className="text-[11px] text-[color:var(--ds-text-secondary)]">Tick</span>
          <Slider
            value={[tickMs]}
            min={100}
            max={1000}
            step={50}
            onValueChange={([v]) => setTickMs(v ?? 200)}
            className="w-40"
          />
          <span className="w-12 text-right text-[11px] font-mono text-[color:var(--ds-text-secondary)]">
            {tickMs}ms
          </span>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
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
