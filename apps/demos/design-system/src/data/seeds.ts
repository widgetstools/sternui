import type {
  Instrument,
  Order,
  OrderStatus,
  Position,
  Quote,
  TerminalState,
} from './types';

/** Deterministic LCG PRNG — stable across runs so seeds/tests never flake. */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/** ~16 realistic fixed-income instruments across sectors and ratings. */
export const SEED_INSTRUMENTS: Instrument[] = [
  { id: 'i01', cusip: '912828Z78', ticker: 'T 2.5 02/45', description: 'US Treasury 2.5% 2045', coupon: 2.5, maturity: '2045-02-15', rating: 'AAA', sector: 'Government', currency: 'USD' },
  { id: 'i02', cusip: '912810TM0', ticker: 'T 1.875 11/51', description: 'US Treasury 1.875% 2051', coupon: 1.875, maturity: '2051-11-15', rating: 'AAA', sector: 'Government', currency: 'USD' },
  { id: 'i03', cusip: '037833DX5', ticker: 'AAPL 3.25 02/30', description: 'Apple Inc 3.25% 2030', coupon: 3.25, maturity: '2030-02-23', rating: 'AA+', sector: 'Technology', currency: 'USD' },
  { id: 'i04', cusip: '594918BR4', ticker: 'MSFT 2.4 08/26', description: 'Microsoft 2.4% 2026', coupon: 2.4, maturity: '2026-08-08', rating: 'AAA', sector: 'Technology', currency: 'USD' },
  { id: 'i05', cusip: '46625HRL6', ticker: 'JPM 4.25 10/27', description: 'JPMorgan 4.25% 2027', coupon: 4.25, maturity: '2027-10-01', rating: 'A-', sector: 'Financials', currency: 'USD' },
  { id: 'i06', cusip: '06051GHF9', ticker: 'BAC 3.95 04/28', description: 'Bank of America 3.95% 2028', coupon: 3.95, maturity: '2028-04-21', rating: 'A-', sector: 'Financials', currency: 'USD' },
  { id: 'i07', cusip: '30231GBH5', ticker: 'XOM 3.482 03/30', description: 'Exxon Mobil 3.482% 2030', coupon: 3.482, maturity: '2030-03-19', rating: 'AA-', sector: 'Energy', currency: 'USD' },
  { id: 'i08', cusip: '166764BW9', ticker: 'CVX 3.078 05/50', description: 'Chevron 3.078% 2050', coupon: 3.078, maturity: '2050-05-11', rating: 'AA-', sector: 'Energy', currency: 'USD' },
  { id: 'i09', cusip: '478160CN2', ticker: 'JNJ 2.45 03/26', description: 'Johnson & Johnson 2.45% 2026', coupon: 2.45, maturity: '2026-03-01', rating: 'AAA', sector: 'Healthcare', currency: 'USD' },
  { id: 'i10', cusip: '58933YBG6', ticker: 'MRK 2.75 02/51', description: 'Merck 2.75% 2051', coupon: 2.75, maturity: '2051-02-10', rating: 'A+', sector: 'Healthcare', currency: 'USD' },
  { id: 'i11', cusip: '254687FK6', ticker: 'DIS 3.8 03/30', description: 'Walt Disney 3.8% 2030', coupon: 3.8, maturity: '2030-03-22', rating: 'A-', sector: 'Consumer', currency: 'USD' },
  { id: 'i12', cusip: '191216CL2', ticker: 'KO 2.875 05/41', description: 'Coca-Cola 2.875% 2041', coupon: 2.875, maturity: '2041-05-05', rating: 'A+', sector: 'Consumer', currency: 'USD' },
  { id: 'i13', cusip: '92826CAC8', ticker: 'V 3.15 12/25', description: 'Visa 3.15% 2025', coupon: 3.15, maturity: '2025-12-14', rating: 'AA-', sector: 'Financials', currency: 'USD' },
  { id: 'i14', cusip: '532457BV3', ticker: 'LLY 3.95 03/49', description: 'Eli Lilly 3.95% 2049', coupon: 3.95, maturity: '2049-03-15', rating: 'A+', sector: 'Healthcare', currency: 'USD' },
  { id: 'i15', cusip: '00206RKM5', ticker: 'T 4.3 02/30', description: 'AT&T 4.3% 2030', coupon: 4.3, maturity: '2030-02-15', rating: 'BBB', sector: 'Telecom', currency: 'USD' },
  { id: 'i16', cusip: '459200KS9', ticker: 'IBM 4.15 05/39', description: 'IBM 4.15% 2039', coupon: 4.15, maturity: '2039-05-15', rating: 'A-', sector: 'Technology', currency: 'USD' },
];

const ORDER_PLAN: { idx: number; side: 'buy' | 'sell'; qty: number; status: OrderStatus }[] = [
  { idx: 0, side: 'buy', qty: 5_000_000, status: 'working' },
  { idx: 2, side: 'buy', qty: 2_000_000, status: 'filled' },
  { idx: 4, side: 'sell', qty: 1_000_000, status: 'working' },
  { idx: 5, side: 'sell', qty: 3_000_000, status: 'cancelled' },
  { idx: 7, side: 'buy', qty: 4_000_000, status: 'filled' },
  { idx: 9, side: 'sell', qty: 1_500_000, status: 'working' },
  { idx: 12, side: 'buy', qty: 2_500_000, status: 'filled' },
  { idx: 14, side: 'sell', qty: 2_000_000, status: 'working' },
];

const POSITION_PLAN: { idx: number; qty: number }[] = [
  { idx: 0, qty: 10_000_000 }, { idx: 2, qty: 6_000_000 }, { idx: 4, qty: -4_000_000 },
  { idx: 6, qty: 8_000_000 }, { idx: 9, qty: 5_000_000 }, { idx: 11, qty: -2_000_000 },
  { idx: 13, qty: 7_000_000 }, { idx: 15, qty: 3_000_000 },
];

function buildQuote(inst: Instrument, rng: () => number): Quote {
  const mid = 92 + rng() * 16;            // 92–108
  const spread = 0.05 + rng() * 0.2;
  const ytm = inst.coupon + (rng() - 0.5) * 1.5;
  return {
    id: inst.id,
    bid: round3(mid - spread / 2),
    mid: round3(mid),
    ask: round3(mid + spread / 2),
    last: round3(mid),
    ytm: round3(Math.max(0.2, ytm)),
    oas: Math.round(20 + rng() * 180),
    dv01: round2(5 + rng() * 12),
    changePct: round2((rng() - 0.5) * 1.2),
    dir: 'flat',
  };
}

export function seedState(now: number): TerminalState {
  const rng = makeRng(0xc0ffee);
  const instruments = SEED_INSTRUMENTS;
  const quotes: Record<string, Quote> = {};
  const history: Record<string, number[]> = {};
  for (const inst of instruments) {
    const q = buildQuote(inst, rng);
    quotes[inst.id] = q;
    history[inst.id] = Array.from({ length: 40 }, (_, k) => round3(q.mid + (rng() - 0.5) * 0.6 + Math.sin(k / 6) * 0.3));
  }
  const orders: Order[] = ORDER_PLAN.map((o, k) => {
    const inst = instruments[o.idx];
    return { id: `o${k + 1}`, instrumentId: inst.id, ticker: inst.ticker, side: o.side, qty: o.qty, price: quotes[inst.id].mid, status: o.status, ts: now - k * 60_000 };
  });
  const positions: Position[] = POSITION_PLAN.map((p) => {
    const inst = instruments[p.idx];
    const q = quotes[inst.id];
    const avgCost = round3(q.mid - (rng() - 0.5) * 2);
    return { instrumentId: inst.id, ticker: inst.ticker, qty: p.qty, avgCost, marketValue: Math.round((p.qty * q.mid) / 100), unrealizedPnl: Math.round((p.qty * (q.mid - avgCost)) / 100), dv01: round2((Math.abs(p.qty) / 1_000_000) * q.dv01) };
  });
  const curve = [1, 2, 3, 5, 7, 10, 20, 30].map((tenor) => ({ tenor, yield: round3(1.6 + Math.log(tenor + 1) * 1.15 + rng() * 0.1) }));
  return { instruments, quotes, orders, positions, curve, history };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }
