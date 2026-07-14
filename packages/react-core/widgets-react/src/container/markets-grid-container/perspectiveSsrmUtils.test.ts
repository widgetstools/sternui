import { describe, expect, it } from 'vitest';
import {
  PERSPECTIVE_COMPOSITE_INDEX,
  resolvePerspectiveIndexColumn,
  stampPerspectiveRows,
} from './perspectiveSsrmUtils';

describe('perspectiveSsrmUtils', () => {
  it('resolves single-column index', () => {
    expect(resolvePerspectiveIndexColumn('cusip')).toBe('cusip');
  });

  it('resolves composite index column', () => {
    expect(resolvePerspectiveIndexColumn(['desk', 'book'])).toBe(PERSPECTIVE_COMPOSITE_INDEX);
  });

  it('stamps composite row ids', () => {
    const rows = stampPerspectiveRows(
      [{ desk: 'A', book: 'B', pnl: 1 }],
      ['desk', 'book'],
    );
    expect(rows[0]?.[PERSPECTIVE_COMPOSITE_INDEX]).toBe('A-B');
  });
});
