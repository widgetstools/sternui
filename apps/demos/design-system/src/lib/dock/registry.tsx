import type { WidgetProps } from '@widgetstools/react-dock-manager';
import type { ComponentType } from 'react';
import OrderBook from '../../panels/OrderBook';
import { RecentPrints } from '../../panels/RecentPrints';
import { BlotterWidget, PriceChartWidget } from '../../panels/MarketWidgets';
import { DesignSystemTab } from '../../tabs/DesignSystemTab';
import { OasDurationScatter } from '../../panels/analytics/OasDurationScatter';
import { DurationBuckets } from '../../panels/analytics/DurationBuckets';
import { SectorDonut } from '../../panels/analytics/SectorDonut';
import { HistoricalOas } from '../../panels/analytics/HistoricalOas';
import { OasDistribution } from '../../panels/analytics/OasDistribution';
import { PnlAttribution } from '../../panels/analytics/PnlAttribution';
import { RiskKpiStrip } from '../../panels/risk/RiskKpiStrip';
import { BookRisk } from '../../panels/risk/BookRisk';
import { Dv01ByBook } from '../../panels/risk/Dv01ByBook';
import { RateScenarios } from '../../panels/risk/RateScenarios';
import { VarTrend } from '../../panels/risk/VarTrend';
import { RiskLimits } from '../../panels/risk/RiskLimits';

function DesignSystemWidget(_props: WidgetProps) { return <DesignSystemTab />; }

export type WidgetId =
  | 'blotter' | 'priceChart' | 'orderBook' | 'recentPrints'
  | 'ordersBlotter' | 'orderEntry'
  | 'oasDuration' | 'durationBuckets' | 'sectorDonut' | 'historicalOas' | 'oasDistribution' | 'pnlAttribution'
  | 'riskKpi' | 'bookRisk' | 'dv01ByBook' | 'rateScenarios' | 'varTrend' | 'riskLimits'
  | 'researchList' | 'noteDetail'
  | 'designSystem';

function Placeholder({ panel }: WidgetProps) {
  return (
    <div className="flex h-full w-full items-center justify-center text-[12px] text-[color:var(--ds-text-secondary)]">
      {panel.title}
    </div>
  );
}

export const WIDGETS: Record<WidgetId, ComponentType<WidgetProps>> = {
  blotter: BlotterWidget, priceChart: PriceChartWidget, orderBook: OrderBook, recentPrints: RecentPrints,
  ordersBlotter: Placeholder, orderEntry: Placeholder,
  oasDuration: OasDurationScatter, durationBuckets: DurationBuckets, sectorDonut: SectorDonut,
  historicalOas: HistoricalOas, oasDistribution: OasDistribution, pnlAttribution: PnlAttribution,
  riskKpi: RiskKpiStrip, bookRisk: BookRisk, dv01ByBook: Dv01ByBook,
  rateScenarios: RateScenarios, varTrend: VarTrend, riskLimits: RiskLimits,
  researchList: Placeholder, noteDetail: Placeholder,
  designSystem: DesignSystemWidget,
};
