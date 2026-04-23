import type { IBlotterDataProvider } from '@marketsui/widgets-react';

/**
 * MockDataProvider — generates sample trading data for development.
 * Replace with StompDataProvider or RestDataProvider in production.
 */
export class MockDataProvider implements IBlotterDataProvider {
  private snapshotHandlers: Set<(rows: Record<string, unknown>[]) => void> = new Set();
  private updateHandlers: Set<(row: Record<string, unknown>) => void> = new Set();
  private errorHandlers: Set<(error: Error) => void> = new Set();
  private connected = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  connect(providerId: string): void {
    if (this.connected) return;
    this.connected = true;

    // Generate initial snapshot
    const rows = this.generateSnapshot(providerId);
    this.snapshotHandlers.forEach(handler => handler(rows));

    // Simulate streaming updates every 2 seconds
    this.interval = setInterval(() => {
      const row = this.generateUpdate(rows);
      this.updateHandlers.forEach(handler => handler(row));
    }, 2000);
  }

  disconnect(): void {
    this.connected = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  onSnapshot(handler: (rows: Record<string, unknown>[]) => void): () => void {
    this.snapshotHandlers.add(handler);
    return () => this.snapshotHandlers.delete(handler);
  }

  onUpdate(handler: (row: Record<string, unknown>) => void): () => void {
    this.updateHandlers.add(handler);
    return () => this.updateHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private generateSnapshot(providerId: string): Record<string, unknown>[] {
    const instruments = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'BAC', 'GS'];
    const sides = ['Buy', 'Sell'];
    const statuses = ['New', 'PartiallyFilled', 'Filled', 'Cancelled'];

    return Array.from({ length: 50 }, (_, i) => ({
      id: `order-${i + 1}`,
      orderId: `ORD-${String(i + 1).padStart(6, '0')}`,
      instrument: instruments[i % instruments.length],
      side: sides[i % 2],
      quantity: Math.round(Math.random() * 10000),
      price: +(Math.random() * 500 + 50).toFixed(2),
      filledQty: Math.round(Math.random() * 5000),
      status: statuses[i % statuses.length],
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      trader: `Trader-${(i % 5) + 1}`,
      desk: providerId || 'Equity Trading',
    }));
  }

  private generateUpdate(existingRows: Record<string, unknown>[]): Record<string, unknown> {
    const row = { ...existingRows[Math.floor(Math.random() * existingRows.length)] };
    row.price = +((row.price as number) + (Math.random() - 0.5) * 2).toFixed(2);
    row.filledQty = Math.min(
      (row.filledQty as number) + Math.round(Math.random() * 100),
      row.quantity as number
    );
    if ((row.filledQty as number) >= (row.quantity as number)) {
      row.status = 'Filled';
    }
    row.timestamp = new Date().toISOString();
    return row;
  }
}
