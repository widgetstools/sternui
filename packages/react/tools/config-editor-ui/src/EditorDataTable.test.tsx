/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import {
  EditorDataTable,
  type EditorTableColumn,
} from './EditorDataTable';

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
  count: number;
}

const ROWS: Row[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `Name ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
  count: (i * 7) % 17,
}));

const COLS: EditorTableColumn<Row>[] = [
  { key: 'id', header: 'ID', sortValue: (r) => r.id, width: '6rem' },
  { key: 'name', header: 'Name', sortValue: (r) => r.name },
  {
    key: 'count',
    header: 'Count',
    sortValue: (r) => r.count,
    align: 'right',
  },
];

describe('EditorDataTable', () => {
  it('paginates rows according to pageSize', () => {
    render(
      <EditorDataTable
        rows={ROWS}
        columns={COLS}
        rowKey={(r) => r.id}
        testIdPrefix="t"
        defaultPageSize={5}
      />,
    );
    // First page — 5 rows visible.
    expect(screen.queryByTestId('t-row-r1')).toBeTruthy();
    expect(screen.queryByTestId('t-row-r5')).toBeTruthy();
    expect(screen.queryByTestId('t-row-r6')).toBeNull();
    // Advance two pages.
    fireEvent.click(screen.getByTestId('t-page-next'));
    expect(screen.queryByTestId('t-row-r6')).toBeTruthy();
    expect(screen.queryByTestId('t-row-r1')).toBeNull();
    fireEvent.click(screen.getByTestId('t-page-next'));
    expect(screen.queryByTestId('t-row-r11')).toBeTruthy();
    fireEvent.click(screen.getByTestId('t-page-prev'));
    expect(screen.queryByTestId('t-row-r6')).toBeTruthy();
  });

  it('filters rows by case-insensitive substring across columns', () => {
    render(
      <EditorDataTable
        rows={ROWS}
        columns={COLS}
        rowKey={(r) => r.id}
        testIdPrefix="t"
        defaultPageSize={20}
      />,
    );
    fireEvent.change(screen.getByTestId('t-filter'), {
      target: { value: 'r12' },
    });
    expect(screen.queryByTestId('t-row-r12')).toBeTruthy();
    expect(screen.queryByTestId('t-row-r1')).toBeNull();
  });

  it('sorts ascending then descending then clears on third click', () => {
    render(
      <EditorDataTable
        rows={ROWS}
        columns={COLS}
        rowKey={(r) => r.id}
        testIdPrefix="t"
        defaultPageSize={20}
      />,
    );
    const sortButton = screen.getByTestId('t-sort-count');
    fireEvent.click(sortButton);
    // First row should now be the smallest count (count=0 → r1 has count 0).
    const firstRowAsc = document.querySelector(
      '[data-testid^="t-row-"]',
    ) as HTMLElement;
    expect(firstRowAsc).toBeTruthy();
    const ascId = firstRowAsc.getAttribute('data-testid');
    fireEvent.click(sortButton);
    const firstRowDesc = document.querySelector(
      '[data-testid^="t-row-"]',
    ) as HTMLElement;
    const descId = firstRowDesc.getAttribute('data-testid');
    expect(descId).not.toBe(ascId);
    fireEvent.click(sortButton);
    const firstRowReset = document.querySelector(
      '[data-testid^="t-row-"]',
    ) as HTMLElement;
    // Reset returns the original order — first row is the seed's first row.
    expect(firstRowReset.getAttribute('data-testid')).toBe('t-row-r1');
  });
});
