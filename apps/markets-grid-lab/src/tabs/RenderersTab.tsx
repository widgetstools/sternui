import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, fmt, pickColumns } from '../data/columns';
import type { LabRow } from '../data/types';
import { useMockStream } from '../data/useMockStream';
import { labStorage } from '../data/storage';
import { HELP } from '../help';

// Rating → pill colour. Matches investment-grade / high-yield ladder.
const RATING_PILL = {
  rules: [
    { value: 'AAA',  bg: { dark: '#103418', light: '#d6f4dd' }, fg: { dark: '#7fdf9b', light: '#1f5d34' } },
    { value: 'AA+',  bg: { dark: '#0e3046', light: '#dbeefd' }, fg: { dark: '#7cc7f9', light: '#0f4d75' } },
    { value: 'AA',   bg: { dark: '#0e3046', light: '#dbeefd' }, fg: { dark: '#7cc7f9', light: '#0f4d75' } },
    { value: 'AA-',  bg: { dark: '#0e3046', light: '#dbeefd' }, fg: { dark: '#7cc7f9', light: '#0f4d75' } },
    { value: 'A+',   bg: { dark: '#102e3a', light: '#dfeef4' }, fg: { dark: '#7ec4d8', light: '#10495a' } },
    { value: 'A',    bg: { dark: '#102e3a', light: '#dfeef4' }, fg: { dark: '#7ec4d8', light: '#10495a' } },
    { value: 'A-',   bg: { dark: '#102e3a', light: '#dfeef4' }, fg: { dark: '#7ec4d8', light: '#10495a' } },
    { value: 'BBB+', bg: { dark: '#33310c', light: '#f7f1cc' }, fg: { dark: '#e5dd6f', light: '#5d551a' } },
    { value: 'BBB',  bg: { dark: '#33310c', light: '#f7f1cc' }, fg: { dark: '#e5dd6f', light: '#5d551a' } },
    { value: 'BBB-', bg: { dark: '#33310c', light: '#f7f1cc' }, fg: { dark: '#e5dd6f', light: '#5d551a' } },
    { value: 'BB+',  bg: { dark: '#3a2614', light: '#fbe7d7', }, fg: { dark: '#f0a576', light: '#7a3b14' } },
    { value: 'BB',   bg: { dark: '#3a2614', light: '#fbe7d7', }, fg: { dark: '#f0a576', light: '#7a3b14' } },
    { value: 'B+',   bg: { dark: '#3a1818', light: '#fcdada' }, fg: { dark: '#ee8e8e', light: '#7a1f1f' } },
    { value: 'B',    bg: { dark: '#3a1818', light: '#fcdada' }, fg: { dark: '#ee8e8e', light: '#7a1f1f' } },
    { value: 'CCC',  bg: { dark: '#3a1818', light: '#fcdada' }, fg: { dark: '#ee8e8e', light: '#7a1f1f' } },
  ],
  fallback: { bg: { dark: '#1f2733', light: '#e8edf2' }, fg: { dark: '#9aa6b2', light: '#3d4753' } },
};

const SECTOR_PILL = {
  rules: [
    { value: 'Financials',  bg: { dark: '#0f2b3f', light: '#dbeaf6' }, fg: { dark: '#7fc1ef', light: '#0e466b' } },
    { value: 'Utilities',   bg: { dark: '#102e22', light: '#d8edd9' }, fg: { dark: '#79d3a3', light: '#1d5b2f' } },
    { value: 'Energy',      bg: { dark: '#3a2310', light: '#fbe5cc' }, fg: { dark: '#f0a576', light: '#7a3a13' } },
    { value: 'Industrials', bg: { dark: '#1f2733', light: '#e8edf2' }, fg: { dark: '#9aa6b2', light: '#3d4753' } },
    { value: 'Sovereign',   bg: { dark: '#23123a', light: '#ebdcf8' }, fg: { dark: '#b88bf0', light: '#4e1b86' } },
  ],
  fallback: { bg: { dark: '#1f2733', light: '#e8edf2' }, fg: { dark: '#9aa6b2', light: '#3d4753' } },
};

function buildColumns(): ColDef<LabRow>[] {
  // Pick the base set, then layer renderer configs onto specific columns.
  const cols = pickColumns([
    'cusip', 'ticker', 'instrumentDescription',
    'assetClass', 'issuerSector', 'issuerCountryCode', 'currency', 'compositeRating',
    'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
    'yieldToMaturity', 'oas',
    'modifiedDuration', 'krdSparkline',
    'marketValue', 'unrealizedPnL', 'dailyPnL', 'ytdPnL',
    'lastUpdate',
  ]);

  return cols.map((c): ColDef<LabRow> => {
    switch (c.field ?? c.colId) {
      case 'compositeRating':
        return { ...c, cellRenderer: 'pill', cellRendererParams: RATING_PILL };
      case 'issuerSector':
        return { ...c, cellRenderer: 'pill', cellRendererParams: SECTOR_PILL };
      case 'issuerCountryCode':
        return { ...c, cellRenderer: 'country-flag', cellRendererParams: { codeField: 'issuerCountryCode' } };
      case 'currency':
        return { ...c, cellRenderer: 'country-flag', cellRendererParams: { codeField: 'currency' } };
      case 'priceChangePct':
        return {
          ...c,
          cellRenderer: 'trend-arrow',
          cellRendererParams: {
            threshold: 0,
            valueFormatter: (v: number) => `${v.toFixed(3)}%`,
            colorScale: {
              up:   { dark: '#7fdf9b', light: '#1f7a34' },
              down: { dark: '#ee8e8e', light: '#a02a2a' },
              flat: { dark: '#9aa6b2', light: '#5a6068' },
            },
          },
        };
      case 'modifiedDuration':
        return {
          ...c,
          cellRenderer: 'percent-bar',
          cellRendererParams: {
            max: 30,
            barColor: { dark: '#7cc7f9', light: '#1e6fb8' },
            showValue: true,
            valueFormatter: fmt.num2,
          },
        };
      case 'krdSparkline':
        return {
          ...c,
          cellRenderer: 'sparkline',
          cellRendererParams: {
            lineColor: { dark: '#9aa6b2', light: '#3d4753' },
            fillColor: { dark: '#2a3340', light: '#e2e8ee' },
            strokeWidth: 1.25,
          },
        };
      case 'oas':
        return {
          ...c,
          cellRenderer: 'heatmap',
          cellRendererParams: {
            domain: { min: 20, max: 600 },
            colorScale: {
              min: { dark: '#0f2b1c', light: '#e8f4ec' },
              mid: { dark: '#3a3010', light: '#fbf0cf' },
              max: { dark: '#3a1818', light: '#fcdada' },
            },
            textColor: { dark: '#e8edf2', light: '#1f2733' },
          },
        };
      case 'marketValue':
        return {
          ...c,
          cellRenderer: 'percent-bar',
          cellRendererParams: {
            fromField: { max: 50_000_000 },
            barColor: { dark: '#7cc7f9', light: '#1e6fb8' },
            showValue: true,
            valueFormatter: fmt.money,
          },
        };
      case 'unrealizedPnL':
      case 'dailyPnL':
      case 'ytdPnL':
        return { ...c, cellRenderer: 'pnl-value' };
      case 'lastUpdate':
        return {
          ...c,
          cellRenderer: 'time-since',
          cellRendererParams: { sourceField: 'lastUpdate' },
        };
      default:
        return c;
    }
  });
}

export function RenderersTab() {
  const rows = useMockStream('mock-positions-renderers', { rowCount: 500, updateIntervalMs: 600 });
  const columnDefs = useMemo(() => buildColumns(), []);

  return (
    <TabContainer
      title="Cell Renderers"
      subtitle="Pills · heatmaps · sparklines · percent bars · trend arrows · flags · pnl"
      help={HELP.renderers}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId="lab-renderers-v1"
          componentName="Renderers"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ ...defaultColDef, autoHeight: false }}
          rowIdField="id"
          storage={labStorage}
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}
