import { describe, expect, it } from 'vitest';
import {
  buildStressColumnDefs,
  STRESS_COL_COUNT,
  STRESS_COLUMN_FIELDS,
  STRESS_FIELD_TYPES,
  STRESS_KEY_FIELD,
  STRESS_ROW_COUNT,
} from './stressColumns';
import { STRESS_BOOK_ID } from './stressBook';

/** Mirrors the GROUPABLE set in `stressColumns.ts`, plus the two identifiers a
 *  blotter is unusable without. */
const GROUPABLE_FOR_TEST = new Set([
  'cusip', 'ticker', 'assetClass', 'assetSubClass', 'issuerSector',
  'issuerSubSector', 'issuerCountryCode', 'currency', 'compositeRating',
  'ratingsBucket', 'securityType', 'seniority', 'couponType', 'exchange',
  'accountName', 'portfolio', 'strategy', 'desk', 'book', 'trader', 'region',
  'side', 'positionStatus', 'liquidityTier',
]);

/**
 * These assertions exist because the previous stress book measured something
 * other than what it claimed. It put 404 columns on screen over a Table of ~53
 * fields, because 366 of them were `valueGetter` columns computed in the
 * window — so "400 columns" described the grid, not the book, and every
 * wide-book number taken on it was wrong in the same direction.
 *
 * The invariant that prevents a repeat: **column count, declared Table width and
 * block width are one number.** Everything below is a way of pinning that.
 */
describe('the stress book', () => {
  it(`renders exactly ${STRESS_COL_COUNT} columns`, () => {
    expect(buildStressColumnDefs()).toHaveLength(STRESS_COL_COUNT);
  });

  it('declares one field per rendered column, plus the index column', () => {
    // If these diverge, a block is a different width from the grid and the tab
    // is back to measuring the wrong thing.
    expect(STRESS_COLUMN_FIELDS).toHaveLength(STRESS_COL_COUNT);
    expect(Object.keys(STRESS_FIELD_TYPES)).toHaveLength(STRESS_COL_COUNT + 1);
    expect(STRESS_FIELD_TYPES[STRESS_KEY_FIELD]).toBe('string');
    expect(STRESS_COLUMN_FIELDS).not.toContain(STRESS_KEY_FIELD);
  });

  it('binds every column to a declared field — and NOTHING computes', () => {
    for (const col of buildStressColumnDefs()) {
      expect(col.field).toBeTruthy();
      expect(STRESS_FIELD_TYPES[col.field as string]).toBeDefined();
      // The whole point. A computed column costs the renderer and nothing else,
      // which is the opposite of what a stress book is for.
      expect(col.valueGetter).toBeUndefined();
    }
  });

  it('uses no dotted paths', () => {
    // `ratings.sp.rating` and `keyRateDurations.1Y` both have flat twins. A dot
    // in a Perspective column name is a hazard for no gain.
    for (const field of Object.keys(STRESS_FIELD_TYPES)) {
      expect(field).not.toContain('.');
    }
  });

  it('carries every field the seeded stress curriculum names', () => {
    // A rule or profile naming a field the Table does not carry does not fail —
    // it silently answers null. These are the ones `stressCatalog` references.
    for (const field of [
      'assetClass',
      'issuerSector',
      'marketValue',
      'dailyPnL',
      'unrealizedPnL',
      'quantityFace',
      'oas',
      'dv01',
      'modifiedDuration',
    ]) {
      expect(STRESS_FIELD_TYPES[field]).toBeDefined();
    }
  });

  it('types numeric columns as numeric and leaves text alone', () => {
    const byField = new Map(buildStressColumnDefs().map((c) => [c.field as string, c]));
    expect(byField.get('marketValue')?.type).toBe('numericColumn');
    expect(byField.get('assetClass')?.type).toBeUndefined();
  });

  it('exposes the documented stress book size', () => {
    // 50,000 for session 8, and it has been both. It was cut to 20,000 because
    // the PERSPECTIVE path was dying of memory here — the SharedWorker holding
    // the Table runs in the SAME process as the page, and 50,000 x 120 put that
    // process at 1,909 MB against the ~4 GB Chrome allows a renderer. It is
    // back because the deployment's stated book is 50k-500k with 3-6 blotters,
    // and an engine decision taken at 20,000 would be taken below the size the
    // loser fails at. See the note on STRESS_ROW_COUNT before changing it.
    expect(STRESS_ROW_COUNT).toBe(50_000);
    expect(STRESS_COL_COUNT).toBe(120);
  });

  it('keys the book id by its row count', () => {
    // The worker memoises a book per id and ignores a later client's
    // `bookOptions`, and a SharedWorker outlives its pages — so a fixed id
    // hands a window the previous size, silently, with a plausible row count on
    // screen for the wrong reason.
    expect(STRESS_BOOK_ID).toContain(String(STRESS_ROW_COUNT));
  });

  it('keeps the book mostly NUMERIC, and every string a dimension', () => {
    // A float column is 8 dense bytes; a high-cardinality string column is an
    // entry per row. MEASURED at 50,000 x 121: 53 strings cost 1,015 MB against
    // 69 MB for 12. Only the index column is allowed to be per-row unique.
    const strings = Object.entries(STRESS_FIELD_TYPES).filter(([, t]) => t === 'string');
    expect(strings.length).toBeLessThanOrEqual(20);
    for (const [field] of strings) {
      expect(
        field === STRESS_KEY_FIELD || GROUPABLE_FOR_TEST.has(field),
        `${field} is a string but not a grouping dimension — high-cardinality strings are what this book cannot afford`,
      ).toBe(true);
    }
  });
});
