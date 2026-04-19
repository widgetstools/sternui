/**
 * Unit tests for `snapshotTemplate` + `addTemplateReducer`.
 *
 * Pin down the behaviour the v2/v3 FormattingToolbar shipped as one
 * monolithic `saveCurrentAsTemplate` helper — the pair is about to
 * replace the inline helper, so these tests are the safety net for
 * that swap.
 */
import { describe, expect, it } from 'vitest';
import type {
  ColumnAssignment,
  ColumnCustomizationState,
} from '../column-customization/state';
import type {
  ColumnTemplate,
  ColumnTemplatesState,
} from './state';
import { addTemplateReducer, snapshotTemplate } from './snapshotTemplate';

// Deterministic deps so id + timestamps are pinnable.
const pinnedDeps = (now = 1_700_000_000_000, suffix = 'abcd') => ({
  now: () => now,
  idSuffix: () => suffix,
});

// ─── snapshotTemplate — early-out cases ────────────────────────────────

describe('snapshotTemplate — early outs', () => {
  const cust: ColumnCustomizationState = {
    assignments: {
      price: {
        colId: 'price',
        cellStyleOverrides: { typography: { bold: true } },
      },
    },
  };
  const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

  it('returns undefined for empty colId', () => {
    expect(snapshotTemplate(cust, tpls, '', 'Name', undefined, pinnedDeps())).toBeUndefined();
  });

  it('returns undefined for empty / whitespace-only name', () => {
    expect(snapshotTemplate(cust, tpls, 'price', '', undefined, pinnedDeps())).toBeUndefined();
    expect(
      snapshotTemplate(cust, tpls, 'price', '   ', undefined, pinnedDeps()),
    ).toBeUndefined();
  });

  it('returns undefined when the column has no assignment', () => {
    expect(
      snapshotTemplate(cust, tpls, 'unknownCol', 'My template', undefined, pinnedDeps()),
    ).toBeUndefined();
  });

  it('returns undefined when cust is entirely missing', () => {
    expect(
      snapshotTemplate(undefined, tpls, 'price', 'My template', undefined, pinnedDeps()),
    ).toBeUndefined();
  });

  it('returns undefined when the resolved assignment has nothing to save', () => {
    // Column exists but has only a colId — no style, no formatter.
    const empty: ColumnCustomizationState = {
      assignments: { price: { colId: 'price' } },
    };
    expect(
      snapshotTemplate(empty, tpls, 'price', 'My template', undefined, pinnedDeps()),
    ).toBeUndefined();
  });
});

// ─── snapshotTemplate — happy paths ────────────────────────────────────

describe('snapshotTemplate — happy paths', () => {
  const tpls: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

  it('captures cell overrides when only cell styling is set', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true, fontSize: 14 } },
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Bold 14px', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    expect(tpl!.id).toBe('tpl_1700000000000_abcd');
    expect(tpl!.name).toBe('Bold 14px');
    expect(tpl!.description).toBe('Saved from price');
    expect(tpl!.createdAt).toBe(1_700_000_000_000);
    expect(tpl!.updatedAt).toBe(1_700_000_000_000);
    expect(tpl!.cellStyleOverrides?.typography).toEqual({ bold: true, fontSize: 14 });
    expect(tpl!.headerStyleOverrides).toBeUndefined();
    expect(tpl!.valueFormatterTemplate).toBeUndefined();
  });

  it('captures header overrides when only header styling is set', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          headerStyleOverrides: { alignment: { horizontal: 'right' } },
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Right header', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides).toBeUndefined();
    expect(tpl!.headerStyleOverrides?.alignment).toEqual({ horizontal: 'right' });
  });

  it('captures valueFormatterTemplate when only a formatter is set', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: {
            kind: 'preset',
            preset: 'currency',
            options: { currency: 'USD', decimals: 2 },
          },
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'USD2', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides).toBeUndefined();
    expect(tpl!.headerStyleOverrides).toBeUndefined();
    expect(tpl!.valueFormatterTemplate).toEqual({
      kind: 'preset',
      preset: 'currency',
      options: { currency: 'USD', decimals: 2 },
    });
  });

  it('trims whitespace from the name', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true } },
        },
      },
    };
    const tpl = snapshotTemplate(
      cust,
      tpls,
      'price',
      '  Trimmed  ',
      undefined,
      pinnedDeps(),
    );
    expect(tpl!.name).toBe('Trimmed');
  });

  it('produces an id of shape tpl_<ts>_<suffix>', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true } },
        },
      },
    };
    const tpl = snapshotTemplate(
      cust,
      tpls,
      'price',
      'X',
      undefined,
      { now: () => 42, idSuffix: () => 'zzzz' },
    );
    expect(tpl!.id).toBe('tpl_42_zzzz');
  });

  it('defaults: uses Date.now() and Math.random() when deps omitted', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true } },
        },
      },
    };
    const before = Date.now();
    const tpl = snapshotTemplate(cust, tpls, 'price', 'X', undefined);
    const after = Date.now();
    expect(tpl).toBeDefined();
    // id is tpl_<ts>_<4chars>.
    expect(tpl!.id).toMatch(/^tpl_\d+_[a-z0-9]{1,4}$/);
    expect(tpl!.createdAt).toBeGreaterThanOrEqual(before);
    expect(tpl!.createdAt).toBeLessThanOrEqual(after);
    expect(tpl!.updatedAt).toBe(tpl!.createdAt);
  });
});

// ─── snapshotTemplate — template resolution ────────────────────────────

describe('snapshotTemplate — resolved effective appearance', () => {
  it('folds a templateId chain into the snapshot (effective, not just overrides)', () => {
    // Base template paints bold.
    const baseTpl: ColumnTemplate = {
      id: 'base',
      name: 'Base bold',
      cellStyleOverrides: { typography: { bold: true } },
      createdAt: 0,
      updatedAt: 0,
    };
    const tpls: ColumnTemplatesState = {
      templates: { base: baseTpl },
      typeDefaults: {},
    };
    // Assignment references the template + adds italic via override.
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          templateIds: ['base'],
          cellStyleOverrides: { typography: { italic: true } },
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Merged', undefined, pinnedDeps());

    expect(tpl).toBeDefined();
    // Both the template's bold AND the assignment's italic should be
    // captured — that's the "effective appearance" contract.
    expect(tpl!.cellStyleOverrides?.typography).toEqual({ bold: true, italic: true });
  });

  it('folds in a typeDefault when templateIds is unset AND dataType is provided', () => {
    const numericDefault: ColumnTemplate = {
      id: 'num-default',
      name: 'Numeric',
      valueFormatterTemplate: {
        kind: 'preset',
        preset: 'number',
        options: { decimals: 2, thousands: true },
      },
      createdAt: 0,
      updatedAt: 0,
    };
    const tpls: ColumnTemplatesState = {
      templates: { 'num-default': numericDefault },
      typeDefaults: { numeric: 'num-default' },
    };
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true } },
          // NOTE: no templateIds field at all — triggers the typeDefault.
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'Combined', 'numeric', pinnedDeps());

    expect(tpl!.cellStyleOverrides?.typography).toEqual({ bold: true });
    expect(tpl!.valueFormatterTemplate).toEqual({
      kind: 'preset',
      preset: 'number',
      options: { decimals: 2, thousands: true },
    });
  });

  it('does NOT fold in a typeDefault when dataType is undefined', () => {
    const numericDefault: ColumnTemplate = {
      id: 'num-default',
      name: 'Numeric',
      valueFormatterTemplate: {
        kind: 'preset',
        preset: 'number',
        options: { decimals: 2, thousands: true },
      },
      createdAt: 0,
      updatedAt: 0,
    };
    const tpls: ColumnTemplatesState = {
      templates: { 'num-default': numericDefault },
      typeDefaults: { numeric: 'num-default' },
    };
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true } },
        },
      },
    };
    const tpl = snapshotTemplate(cust, tpls, 'price', 'NoType', undefined, pinnedDeps());

    expect(tpl!.cellStyleOverrides?.typography).toEqual({ bold: true });
    expect(tpl!.valueFormatterTemplate).toBeUndefined();
  });

  it('tolerates tpls === undefined by treating it as empty', () => {
    const cust: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { typography: { bold: true } },
        },
      },
    };
    const tpl = snapshotTemplate(cust, undefined, 'price', 'X', undefined, pinnedDeps());
    expect(tpl).toBeDefined();
    expect(tpl!.cellStyleOverrides?.typography).toEqual({ bold: true });
  });
});

// ─── addTemplateReducer ────────────────────────────────────────────────

describe('addTemplateReducer', () => {
  const makeTpl = (id: string): ColumnTemplate => ({
    id,
    name: `Template ${id}`,
    cellStyleOverrides: { typography: { bold: true } },
    createdAt: 1,
    updatedAt: 1,
  });

  it('inserts into an empty templates map', () => {
    const reducer = addTemplateReducer(makeTpl('a'));
    const next = reducer({ templates: {}, typeDefaults: {} });
    expect(Object.keys(next.templates)).toEqual(['a']);
  });

  it('preserves existing templates', () => {
    const existing = makeTpl('existing');
    const reducer = addTemplateReducer(makeTpl('new'));
    const next = reducer({
      templates: { existing },
      typeDefaults: {},
    });
    expect(Object.keys(next.templates).sort()).toEqual(['existing', 'new']);
    expect(next.templates['existing']).toBe(existing);
  });

  it('preserves typeDefaults', () => {
    const reducer = addTemplateReducer(makeTpl('new'));
    const next = reducer({
      templates: {},
      typeDefaults: { numeric: 'num-default' },
    });
    expect(next.typeDefaults).toEqual({ numeric: 'num-default' });
  });

  it('replaces a template with the same id (last-write-wins)', () => {
    const original = { ...makeTpl('a'), name: 'Original' };
    const replacement = { ...makeTpl('a'), name: 'Replacement' };
    const reducer = addTemplateReducer(replacement);
    const next = reducer({ templates: { a: original }, typeDefaults: {} });
    expect(next.templates['a'].name).toBe('Replacement');
    expect(Object.keys(next.templates)).toEqual(['a']);
  });

  it('tolerates undefined prev (fresh-module first write)', () => {
    const reducer = addTemplateReducer(makeTpl('fresh'));
    const next = reducer(undefined);
    expect(next.templates['fresh']).toBeDefined();
    expect(next.typeDefaults).toEqual({});
  });
});
