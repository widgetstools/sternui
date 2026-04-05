import { useState, useCallback, useRef, useMemo } from 'react';
import { DockManagerCore, type WidgetProps, type DockManagerCoreHandle } from '@widgetstools/react-dock-manager';
import { type DockManagerState, slateDark, vsCodeLight } from '@widgetstools/dock-manager-core';

// ── Layout persistence helpers ──
const STORAGE_PREFIX = 'fi-dock-';

function getSavedLayout(tab: string): DockManagerState | null {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + tab);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore malformed data */ }
  return null;
}

function saveLayout(tab: string, state: DockManagerState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tab, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}
import '@widgetstools/react-dock-manager/styles.css';

import type { Bond, RfqRequest } from '@/data/tradingData';
import { BONDS } from '@/data/tradingData';
import { useTheme } from '@/context/ThemeContext';
import { TopBar } from '@/components/TopBar';
import { CandlestickChart } from '@/components/CandlestickChart';
import { OrderBook } from '@/components/OrderBook';
import { TradeTicket } from '@/components/TradeTicket';
import { BottomOrderPanel } from '@/components/BottomOrderPanel';
import { RfqPanel } from '@/components/RfqSimulator';
import { BondBlotter } from '@/components/BondBlotter';

// Sub-panel components
import { RiskKpiStrip, BookRiskSummary, Dv01Chart, ScenarioChart, VarTrend, RiskLimits } from '@/components/panels/RiskPanels';
import { MarketIndices, EconomicCalendar, IntradayChart, YieldCurvePanel } from '@/components/panels/MarketPanels';
import { OrdersProvider, OrderKpis, OrderBlotter, OrderDetail } from '@/components/panels/OrdersPanels';
import { OasVsDuration, DurationBuckets, SectorAllocation, HistoricalOas, OasDistribution, PnlAttribution } from '@/components/panels/AnalyticsPanels';
import { ResearchProvider, ResearchList, NoteDetail } from '@/components/panels/ResearchPanels';
import { DesignSystemTab } from '@/components/DesignSystemTab';

// ── Shared state ──
interface SharedState {
  selectedBond: Bond;
  setSelectedBond: (b: Bond) => void;
  rfqRequests: RfqRequest[];
  setRfqRequests: React.Dispatch<React.SetStateAction<RfqRequest[]>>;
  showRfq: boolean;
  setShowRfq: (v: boolean) => void;
  clickedPrice: number | undefined;
  setClickedPrice: (p: number | undefined) => void;
}
let _shared: SharedState | null = null;
function getShared(): SharedState { return _shared!; }

// ── Widget wrappers ──
// Trade
function W_Chart(_p: WidgetProps) { const s = getShared(); return <CandlestickChart bond={s.selectedBond} />; }
function W_OrderBook(_p: WidgetProps) { const s = getShared(); return <OrderBook bond={s.selectedBond} onClickPrice={p => s.setClickedPrice(p)} />; }
function W_TradeTicket(_p: WidgetProps) { const s = getShared(); return <TradeTicket bond={s.selectedBond} onSendRfq={() => s.setShowRfq(true)} clickedPrice={s.clickedPrice} />; }
function W_Blotter(_p: WidgetProps) { const s = getShared(); return <BottomOrderPanel bond={s.selectedBond} />; }
function W_Rfq(_p: WidgetProps) { const s = getShared(); return <RfqPanel selectedBond={s.selectedBond} requests={s.rfqRequests} setRequests={s.setRfqRequests} onClose={() => s.setShowRfq(false)} />; }
// Risk
function W_RiskKpi(_p: WidgetProps) { return <RiskKpiStrip />; }
function W_BookRisk(_p: WidgetProps) { return <BookRiskSummary />; }
function W_Dv01(_p: WidgetProps) { return <Dv01Chart />; }
function W_Scenario(_p: WidgetProps) { return <ScenarioChart />; }
function W_Var(_p: WidgetProps) { return <VarTrend />; }
function W_RiskLimits(_p: WidgetProps) { return <RiskLimits />; }
// Market
function W_Indices(_p: WidgetProps) { return <MarketIndices />; }
function W_EconCal(_p: WidgetProps) { return <EconomicCalendar />; }
function W_Intraday(_p: WidgetProps) { return <IntradayChart />; }
function W_YieldCurve(_p: WidgetProps) { return <YieldCurvePanel />; }
// Orders
function W_OrderKpi(_p: WidgetProps) { return <OrderKpis />; }
function W_OrderBlotter(_p: WidgetProps) { return <OrderBlotter />; }
function W_OrderDetail(_p: WidgetProps) { return <OrderDetail />; }
// Analytics
function W_OasDur(_p: WidgetProps) { return <OasVsDuration />; }
function W_DurBuckets(_p: WidgetProps) { return <DurationBuckets />; }
function W_Sectors(_p: WidgetProps) { return <SectorAllocation />; }
function W_HistOas(_p: WidgetProps) { return <HistoricalOas />; }
function W_OasDist(_p: WidgetProps) { return <OasDistribution />; }
function W_Pnl(_p: WidgetProps) { return <PnlAttribution />; }
// Research
function W_ResearchList(_p: WidgetProps) { return <ResearchList />; }
function W_NoteDetail(_p: WidgetProps) { return <NoteDetail />; }
// Prices
function W_BondBlotter(_p: WidgetProps) { const s = getShared(); return <BondBlotter onSelectBond={s.setSelectedBond} />; }
// Design System
function W_DesignSystem(_p: WidgetProps) { return <DesignSystemTab />; }

const WIDGETS: Record<string, React.ComponentType<WidgetProps>> = {
  chart: W_Chart, orderBook: W_OrderBook, tradeTicket: W_TradeTicket, blotter: W_Blotter, rfq: W_Rfq,
  riskKpi: W_RiskKpi, bookRisk: W_BookRisk, dv01: W_Dv01, scenario: W_Scenario, varTrend: W_Var, riskLimits: W_RiskLimits,
  indices: W_Indices, econCal: W_EconCal, intraday: W_Intraday, yieldCurve: W_YieldCurve,
  orderKpi: W_OrderKpi, orderBlotter: W_OrderBlotter, orderDetail: W_OrderDetail,
  oasDur: W_OasDur, durBuckets: W_DurBuckets, sectors: W_Sectors, histOas: W_HistOas, oasDist: W_OasDist, pnl: W_Pnl,
  researchList: W_ResearchList, noteDetail: W_NoteDetail,
  bondBlotter: W_BondBlotter,
  designSystem: W_DesignSystem,
};

// ── Helpers ──
const p = (id: string, title: string, wt: string, closable = false) => ({ id, title, widgetType: wt, closable });
const tg = (id: string, panels: string[], active?: string) => ({ type: 'tabgroup' as const, id, panels, activePanel: active || panels[0] });
const sp = (id: string, dir: 'horizontal' | 'vertical', sizes: number[], children: any[]) => ({ type: 'split' as const, id, direction: dir, sizes, children });
const base = (layout: any, panels: Record<string, any>, active: string): DockManagerState => ({
  layout, panels, floatingPanels: [], popoutPanels: [], unpinnedPanels: [], nextZIndex: 100, activePaneId: active,
});

// ── Per-tab layouts ──

function tradeLayout(): DockManagerState {
  // Layout follows the trading workflow:
  //   Scan (blotter) → Analyze (chart) → Depth (order book) → Monitor (orders)
  //   RFQ + Trade Ticket are floating panels invoked via header buttons
  //
  //  ┌──────────────────┬─────────────────────────┐
  //  │  Bond Blotter     │  Price Chart             │
  //  │  (scan universe)  │  (technical analysis)    │
  //  ├──────────────────┼─────────────────────────┤
  //  │  Order Book       │  Orders                  │
  //  │  (depth/levels)   │  (monitor fills)         │
  //  └──────────────────┴─────────────────────────┘
  return base(
    sp('root', 'vertical', [55, 45], [
      sp('top', 'horizontal', [32, 68], [
        tg('tg-blotter', ['bondBlotter']),
        tg('tg-chart', ['chart']),
      ]),
      sp('bottom', 'horizontal', [32, 68], [
        tg('tg-ob', ['orderBook']),
        tg('tg-orders', ['blotter']),
      ]),
    ]),
    {
      bondBlotter: p('bondBlotter','Bond Blotter','bondBlotter'),
      chart: p('chart','Chart','chart'),
      orderBook: p('orderBook','Order Book','orderBook'),
      blotter: p('blotter','Orders','blotter'),
    },
    'bondBlotter',
  );
}

function pricesLayout(): DockManagerState {
  return base(
    sp('root', 'vertical', [65, 35], [
      tg('tg-blotter', ['bondBlotter']),
      sp('bottom', 'horizontal', [60, 40], [
        tg('tg-chart', ['chart']),
        tg('tg-ob', ['orderBook']),
      ]),
    ]),
    { bondBlotter: p('bondBlotter','Bond Blotter','bondBlotter'), chart: p('chart','Chart','chart'), orderBook: p('orderBook','Order Book','orderBook') },
    'bondBlotter',
  );
}

function riskLayout(): DockManagerState {
  return base(
    sp('root', 'vertical', [12, 88], [
      tg('tg-kpi', ['riskKpi']),
      sp('body', 'horizontal', [25, 50, 25], [
        tg('tg-book', ['bookRisk']),
        sp('charts', 'vertical', [50, 50], [
          sp('charts-top', 'horizontal', [50, 50], [
            tg('tg-dv01', ['dv01']),
            tg('tg-scenario', ['scenario']),
          ]),
          tg('tg-var', ['varTrend']),
        ]),
        tg('tg-limits', ['riskLimits']),
      ]),
    ]),
    { riskKpi: p('riskKpi','Risk KPIs','riskKpi'), bookRisk: p('bookRisk','Book Risk & Heatmap','bookRisk'), dv01: p('dv01','DV01 by Book','dv01'), scenario: p('scenario','Rate Scenarios','scenario'), varTrend: p('varTrend','VaR Trend','varTrend'), riskLimits: p('riskLimits','Risk Limits','riskLimits') },
    'riskKpi',
  );
}

function marketLayout(): DockManagerState {
  return base(
    sp('root', 'horizontal', [30, 70], [
      sp('left', 'vertical', [60, 40], [
        tg('tg-idx', ['indices']),
        tg('tg-cal', ['econCal']),
      ]),
      sp('right', 'vertical', [55, 45], [
        tg('tg-intra', ['intraday']),
        tg('tg-yc', ['yieldCurve']),
      ]),
    ]),
    { indices: p('indices','Market Indices','indices'), econCal: p('econCal','Economic Calendar','econCal'), intraday: p('intraday','Intraday Chart','intraday'), yieldCurve: p('yieldCurve','Yield Curve','yieldCurve') },
    'indices',
  );
}

function ordersLayout(): DockManagerState {
  return base(
    sp('root', 'vertical', [12, 88], [
      tg('tg-kpi', ['orderKpi']),
      sp('body', 'horizontal', [75, 25], [
        tg('tg-blot', ['orderBlotter']),
        tg('tg-det', ['orderDetail']),
      ]),
    ]),
    { orderKpi: p('orderKpi','Order KPIs','orderKpi'), orderBlotter: p('orderBlotter','Order Blotter','orderBlotter'), orderDetail: p('orderDetail','Order Detail','orderDetail') },
    'orderBlotter',
  );
}

function analyticsLayout(): DockManagerState {
  return base(
    sp('root', 'vertical', [50, 50], [
      sp('row1', 'horizontal', [34, 33, 33], [
        tg('tg-oas', ['oasDur']),
        tg('tg-dur', ['durBuckets']),
        tg('tg-sec', ['sectors']),
      ]),
      sp('row2', 'horizontal', [34, 33, 33], [
        tg('tg-hist', ['histOas']),
        tg('tg-dist', ['oasDist']),
        tg('tg-pnl', ['pnl']),
      ]),
    ]),
    { oasDur: p('oasDur','OAS vs Duration','oasDur'), durBuckets: p('durBuckets','Duration Buckets','durBuckets'), sectors: p('sectors','Sector Allocation','sectors'), histOas: p('histOas','CDX IG/HY Historical','histOas'), oasDist: p('oasDist','OAS Distribution','oasDist'), pnl: p('pnl','P&L Attribution','pnl') },
    'oasDur',
  );
}

function researchLayout(): DockManagerState {
  return base(
    sp('root', 'horizontal', [30, 70], [
      tg('tg-list', ['researchList']),
      tg('tg-detail', ['noteDetail']),
    ]),
    { researchList: p('researchList','Research Notes','researchList'), noteDetail: p('noteDetail','Note Detail','noteDetail') },
    'researchList',
  );
}

function designSystemLayout(): DockManagerState {
  return base(
    tg('tg-ds', ['designSystem']),
    { designSystem: p('designSystem', 'Design System', 'designSystem') },
    'designSystem',
  );
}

const TAB_LAYOUTS: Record<string, () => DockManagerState> = {
  Trade: tradeLayout, Prices: pricesLayout,
  Risk: riskLayout, Market: marketLayout,
  Research: researchLayout, Orders: ordersLayout,
  Analytics: analyticsLayout, 'Design System': designSystemLayout,
};

// ── Tabs that need context providers wrapping the dock manager ──
function PassThrough({ children }: { children: React.ReactNode }) { return <>{children}</>; }

const TAB_WRAPPERS: Record<string, React.ComponentType<{children: React.ReactNode}>> = {
  Trade: PassThrough,
  Prices: PassThrough,
  Risk: PassThrough,
  Market: PassThrough,
  Orders: OrdersProvider,
  Research: ResearchProvider,
  Analytics: PassThrough,
  'Design System': PassThrough,
};

export default function App() {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('Trade');
  const [selectedBond, setSelectedBond] = useState<Bond>(BONDS[0]);
  const [rfqRequests, setRfqRequests] = useState<RfqRequest[]>([]);
  const [showRfq, setShowRfq] = useState(false);
  const [clickedPrice, setClickedPrice] = useState<number | undefined>();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const dockRef = useRef<DockManagerCoreHandle>(null);

  _shared = { selectedBond, setSelectedBond, rfqRequests, setRfqRequests, showRfq, setShowRfq, clickedPrice, setClickedPrice };

  const handleTabChange = useCallback((t: string) => { setActiveTab(t); if (t !== 'Trade') setShowRfq(false); }, []);

  const handleStateChange = useCallback((state: DockManagerState) => {
    saveLayout(activeTab, state);
  }, [activeTab]);

  const handleSaveLayout = useCallback(() => {
    const state = dockRef.current?.getState();
    if (state) saveLayout(activeTab, state);
  }, [activeTab]);

  const handleResetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_PREFIX + activeTab);
    setLayoutVersion(v => v + 1);
  }, [activeTab]);

  const handleNewOrder = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    if (api.hasPanel('tradeTicket')) {
      const gid = api.getGroupForPanel('tradeTicket');
      if (gid) api.setActivePanel(gid, 'tradeTicket');
      api.setActivePane('tradeTicket');
    } else {
      api.addPanel({ id: 'tradeTicket', title: 'Trade Ticket', widgetType: 'tradeTicket', closable: true, dockable: false });
      api.floatPanel({ panelId: 'tradeTicket', x: 300, y: 80, width: 280, height: 520 });
    }
  }, []);

  const handleOpenRfq = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    if (api.hasPanel('rfq')) {
      const gid = api.getGroupForPanel('rfq');
      if (gid) api.setActivePanel(gid, 'rfq');
      api.setActivePane('rfq');
      api.bringToFront('rfq');
    } else {
      api.addPanel({ id: 'rfq', title: 'RFQ Workbench', widgetType: 'rfq', closable: true, dockable: false });
      api.floatPanel({ panelId: 'rfq', x: 80, y: 50, width: 820, height: 540 });
    }
  }, []);

  const currentLayout = useMemo(() => {
    const saved = getSavedLayout(activeTab);
    if (saved) return saved;
    return (TAB_LAYOUTS[activeTab] || tradeLayout)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, layoutVersion]);
  const dockTheme = isDark ? slateDark : vsCodeLight;
  const Wrapper = TAB_WRAPPERS[activeTab] || PassThrough;
  const isTrading = activeTab === 'Trade' || activeTab === 'Prices';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bn-bg)' }}>
      <TopBar activeTab={activeTab} onTabChange={handleTabChange} selectedBond={selectedBond} onNewOrder={isTrading ? handleNewOrder : undefined} onOpenRfq={isTrading ? handleOpenRfq : undefined} onSaveLayout={handleSaveLayout} onResetLayout={handleResetLayout} />
      <Wrapper>
        <div className="dock-manager-container" style={{ flex: 1, overflow: 'hidden' }}>
          <DockManagerCore key={`${activeTab}-${layoutVersion}`} ref={dockRef} initialState={currentLayout} widgets={WIDGETS} theme={dockTheme} onStateChange={handleStateChange} />
        </div>
      </Wrapper>
    </div>
  );
}
