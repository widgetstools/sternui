import { describe, expect, it } from 'vitest';
import { csvEscapeCell, rowsToCsv } from '../../pull/exportRows.js';

describe('csvEscapeCell', () => {
  it('passes plain text through unquoted', () => {
    expect(csvEscapeCell('BOOKA')).toBe('BOOKA');
    expect(csvEscapeCell(42.5)).toBe('42.5');
  });

  it('quotes delimiters, quotes and newlines; doubles embedded quotes', () => {
    expect(csvEscapeCell('a,b')).toBe('"a,b"');
    expect(csvEscapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('null/undefined are empty cells; Dates are ISO', () => {
    expect(csvEscapeCell(null)).toBe('');
    expect(csvEscapeCell(undefined)).toBe('');
    expect(csvEscapeCell(new Date('2026-07-25T00:00:00.000Z'))).toBe('2026-07-25T00:00:00.000Z');
  });

  it('honors a custom delimiter', () => {
    expect(csvEscapeCell('a;b', ';')).toBe('"a;b"');
    expect(csvEscapeCell('a,b', ';')).toBe('a,b');
  });
});

describe('rowsToCsv', () => {
  const rows = [
    { positionId: 'POS1', pnl: 10.5, book: 'A,B' },
    { positionId: 'POS2', pnl: null, book: 'C' },
  ];
  const columns = [
    { field: 'positionId', headerName: 'Position' },
    { field: 'pnl' },
    { field: 'book', headerName: 'Book' },
  ];

  it('emits a header + one CRLF line per row in column order', () => {
    expect(rowsToCsv(rows, columns)).toBe(
      'Position,pnl,Book\r\nPOS1,10.5,"A,B"\r\nPOS2,,C',
    );
  });

  it('can omit the header', () => {
    expect(rowsToCsv(rows, columns, { includeHeader: false }).split('\r\n')).toHaveLength(2);
  });

  it('empty row set is just the header', () => {
    expect(rowsToCsv([], columns)).toBe('Position,pnl,Book');
  });
});
