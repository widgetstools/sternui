/** MockDataProvider — generates sample trading data rows. Pure TS, no framework deps. */

const INSTRUMENTS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'BAC', 'GS'];
const SIDES = ['Buy', 'Sell'];
const STATUSES = ['New', 'PartiallyFilled', 'Filled', 'Cancelled'];

export function generateSnapshot(type: string, count = 50): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `order-${i + 1}`,
    orderId: `ORD-${String(i + 1).padStart(6, '0')}`,
    instrument: INSTRUMENTS[i % INSTRUMENTS.length],
    side: SIDES[i % 2],
    quantity: Math.round(Math.random() * 10000),
    price: +(Math.random() * 500 + 50).toFixed(2),
    filledQty: Math.round(Math.random() * 5000),
    status: STATUSES[i % STATUSES.length],
    timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    trader: `Trader-${(i % 5) + 1}`,
    desk: type || 'Equity Trading',
  }));
}

export function generateUpdate(rows: Record<string, unknown>[]): Record<string, unknown> {
  const row = { ...rows[Math.floor(Math.random() * rows.length)] };
  row['price'] = +((row['price'] as number) + (Math.random() - 0.5) * 2).toFixed(2);
  row['filledQty'] = Math.min(
    (row['filledQty'] as number) + Math.round(Math.random() * 100),
    row['quantity'] as number,
  );
  if ((row['filledQty'] as number) >= (row['quantity'] as number)) row['status'] = 'Filled';
  row['timestamp'] = new Date().toISOString();
  return row;
}
