import type { WidgetProps } from '@widgetstools/react-dock-manager';
import type { ComponentType } from 'react';
import OrderBook from '../../panels/OrderBook';
import { RecentPrints } from '../../panels/RecentPrints';

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
  blotter: Placeholder, priceChart: Placeholder, orderBook: OrderBook, recentPrints: RecentPrints,
  ordersBlotter: Placeholder, orderEntry: Placeholder,
  oasDuration: Placeholder, durationBuckets: Placeholder, sectorDonut: Placeholder,
  historicalOas: Placeholder, oasDistribution: Placeholder, pnlAttribution: Placeholder,
  riskKpi: Placeholder, bookRisk: Placeholder, dv01ByBook: Placeholder, rateScenarios: Placeholder,
  varTrend: Placeholder, riskLimits: Placeholder,
  researchList: Placeholder, noteDetail: Placeholder,
  designSystem: Placeholder,
};
