import { describe, expect, it } from 'vitest';
import { shouldSuggestSsrm } from './shouldSuggestSsrm.js';

describe('shouldSuggestSsrm', () => {
  it('is off when already on SSRM, dismissed, or no threshold', () => {
    expect(
      shouldSuggestSsrm({ useSSRM: true, rowCount: 50_000, threshold: 10_000 }),
    ).toBe(false);
    expect(
      shouldSuggestSsrm({
        useSSRM: false,
        rowCount: 50_000,
        threshold: 10_000,
        dismissed: true,
      }),
    ).toBe(false);
    expect(shouldSuggestSsrm({ useSSRM: false, rowCount: 50_000 })).toBe(false);
  });

  it('shows when CSRM row count meets threshold', () => {
    expect(
      shouldSuggestSsrm({ useSSRM: false, rowCount: 10_000, threshold: 10_000 }),
    ).toBe(true);
    expect(
      shouldSuggestSsrm({ useSSRM: false, rowCount: 9_999, threshold: 10_000 }),
    ).toBe(false);
  });
});
