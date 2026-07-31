import type { CellClassParams, ColDef, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import type { LabRow } from './types';
import { defaultColDef, fmt, pickColumns } from './columns';

/** Stress-book dimensions — toggle CSRM/SSRM against the same shape. */
export const STRESS_ROW_COUNT = 50_000;
export const STRESS_COL_COUNT = 400;

/**
 * Real FI columns (grouping dims, priced risk, P&L). Remainder of the 400
 * are synthetic `sNNN` valueGetter columns that stress wide horizontal
 * scroll / cell paint without bloating every row object with 350 extra keys.
 */
const REAL_FIELDS = [
  'cusip',
  'ticker',
  'instrumentDescription',
  'assetClass',
  'issuerSector',
  'issuerCountryCode',
  'currency',
  'compositeRating',
  'bidPrice',
  'midPrice',
  'askPrice',
  'lastPrice',
  'priceChange',
  'priceChangePct',
  'bidAskWidthBps',
  'yieldToMaturity',
  'yieldToWorst',
  'oas',
  'zSpread',
  'modifiedDuration',
  'dv01',
  'convexity',
  'quantityFace',
  'marketValue',
  'avgCost',
  'unrealizedPnL',
  'dailyPnL',
  'mtdPnL',
  'ytdPnL',
  'book',
  'trader',
  'accountName',
  'maturityDate',
  'lastUpdate',
] as const;

const GROUPABLE = new Set([
  'assetClass',
  'issuerSector',
  'issuerCountryCode',
  'currency',
  'compositeRating',
  'book',
  'trader',
  'accountName',
]);

const AGGREGATABLE = new Set([
  'bidPrice',
  'midPrice',
  'askPrice',
  'lastPrice',
  'priceChange',
  'priceChangePct',
  'bidAskWidthBps',
  'yieldToMaturity',
  'yieldToWorst',
  'oas',
  'zSpread',
  'modifiedDuration',
  'dv01',
  'convexity',
  'quantityFace',
  'marketValue',
  'avgCost',
  'unrealizedPnL',
  'dailyPnL',
  'mtdPnL',
  'ytdPnL',
]);

function hash01(id: string, salt: number): number {
  let h = (salt * 2654435761) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  }
  return (h % 10_000) / 10_000;
}

function syntheticValue(p: ValueGetterParams<LabRow>, index: number): number {
  const id = String(p.data?.id ?? '');
  const mid = Number(p.data?.midPrice);
  const base = Number.isFinite(mid) ? mid / 200 : 0.5;
  return Math.min(1, Math.max(0, base * 0.35 + hash01(id, index) * 0.65));
}

function syntheticFormatter(p: ValueFormatterParams): string {
  if (p.value == null || p.value === '') return '';
  return fmt.num2(p);
}

function syntheticCellStyle(p: CellClassParams): Record<string, string> | undefined {
  const v = Number(p.value);
  if (!Number.isFinite(v)) return undefined;
  if (v >= 0.85) return { backgroundColor: 'rgba(220, 70, 70, 0.28)', fontVariantNumeric: 'tabular-nums' };
  if (v >= 0.65) return { backgroundColor: 'rgba(220, 160, 40, 0.22)', fontVariantNumeric: 'tabular-nums' };
  if (v <= 0.15) return { backgroundColor: 'rgba(60, 140, 220, 0.22)', fontVariantNumeric: 'tabular-nums' };
  return { fontVariantNumeric: 'tabular-nums' };
}

function makeSyntheticCol(index: number): ColDef<LabRow> {
  const colId = `s${String(index).padStart(3, '0')}`;
  return {
    colId,
    headerName: colId.toUpperCase(),
    width: 88,
    minWidth: 72,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    enableValue: true,
    enablePivot: true,
    valueGetter: (p) => syntheticValue(p, index),
    valueFormatter: syntheticFormatter,
    cellStyle: syntheticCellStyle,
    // Cheap charting surface for wide-book stress.
    chartDataType: 'series',
  };
}

/** Default column behaviour for the stress tab — grouping + pivot ready. */
export const stressDefaultColDef: ColDef = {
  ...defaultColDef,
  floatingFilter: true,
  enableRowGroup: true,
  enableValue: true,
  enablePivot: true,
  minWidth: 72,
};

/**
 * Build exactly {@link STRESS_COL_COUNT} column defs: real FI fields first,
 * then synthetic stress series to pad width.
 */
export function buildStressColumnDefs(total = STRESS_COL_COUNT): ColDef<LabRow>[] {
  const real = pickColumns([...REAL_FIELDS]).map((c) => {
    const key = String(c.field ?? c.colId ?? '');
    return {
      ...c,
      enableRowGroup: GROUPABLE.has(key) || undefined,
      enableValue: AGGREGATABLE.has(key) || undefined,
      enablePivot: true,
      floatingFilter: true,
    } satisfies ColDef<LabRow>;
  });

  const pad = Math.max(0, total - real.length);
  const synthetic = Array.from({ length: pad }, (_, i) => makeSyntheticCol(i));
  return [...real, ...synthetic];
}
