import { describe, it, expect } from 'vitest';
import { RowCache } from './rowCache';

interface Position {
  positionId: string;
  instrument: string;
  quantity: number;
  currentPrice?: number | null;
}

describe('RowCache — upsert / get / size', () => {
  it('stores incoming rows keyed by keyColumn', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    const result = c.upsert([
      { positionId: 'P1', instrument: 'AAPL', quantity: 100 },
      { positionId: 'P2', instrument: 'GOOGL', quantity: 50 },
    ]);
    expect(result).toEqual({ accepted: 2, skipped: 0 });
    expect(c.size).toBe(2);
    expect(c.get('P1')?.instrument).toBe('AAPL');
    expect(c.get('P2')?.quantity).toBe(50);
  });

  it('overwrites existing rows on repeat upsert (the whole point)', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    c.upsert([{ positionId: 'P1', instrument: 'AAPL', quantity: 100 }]);
    c.upsert([{ positionId: 'P1', instrument: 'AAPL', quantity: 175 }]);
    expect(c.size).toBe(1);
    expect(c.get('P1')?.quantity).toBe(175);
  });

  it('skips rows with a null/undefined keyColumn value', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    const result = c.upsert([
      { positionId: 'P1', instrument: 'AAPL', quantity: 100 },
      { positionId: null as unknown as string, instrument: 'BAD', quantity: 0 },
      { positionId: undefined as unknown as string, instrument: 'BAD', quantity: 0 },
    ]);
    expect(result).toEqual({ accepted: 1, skipped: 2 });
    expect(c.size).toBe(1);
    expect(c.get('P1')?.instrument).toBe('AAPL');
  });

  it('coerces non-string keys to string (numeric id still works)', () => {
    const c = new RowCache({ keyColumn: 'id' });
    c.upsert([{ id: 42, name: 'ok' }]);
    expect(c.get('42')).toEqual({ id: 42, name: 'ok' });
  });

  it('copies the row on upsert (caller mutation does not leak into cache)', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    const row = { positionId: 'P1', instrument: 'AAPL', quantity: 100 };
    c.upsert([row]);
    row.quantity = 99_999;
    expect(c.get('P1')?.quantity).toBe(100);
  });
});

describe('RowCache — remove', () => {
  it('drops rows whose keys match', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    c.upsert([
      { positionId: 'P1', instrument: 'AAPL', quantity: 100 },
      { positionId: 'P2', instrument: 'GOOGL', quantity: 50 },
      { positionId: 'P3', instrument: 'MSFT', quantity: 200 },
    ]);
    const removed = c.remove([
      { positionId: 'P1', instrument: 'AAPL', quantity: 100 },
      { positionId: 'P3', instrument: 'MSFT', quantity: 200 },
      { positionId: 'P99', instrument: 'ghost', quantity: 0 }, // not present
    ]);
    expect(removed).toBe(2);
    expect(c.size).toBe(1);
    expect(c.get('P2')?.instrument).toBe('GOOGL');
  });
});

describe('RowCache — getAll + clear', () => {
  it('getAll returns a fresh array each call (independent copies)', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    c.upsert([{ positionId: 'P1', instrument: 'AAPL', quantity: 100 }]);
    const a = c.getAll();
    const b = c.getAll();
    expect(a).not.toBe(b); // different array identity
    expect(a).toEqual(b);
  });

  it('clear empties the cache and resets size to 0', () => {
    const c = new RowCache<Position>({ keyColumn: 'positionId' });
    c.upsert([
      { positionId: 'P1', instrument: 'AAPL', quantity: 100 },
      { positionId: 'P2', instrument: 'GOOGL', quantity: 50 },
    ]);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.getAll()).toEqual([]);
  });
});
