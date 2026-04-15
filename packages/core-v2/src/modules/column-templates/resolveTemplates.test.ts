import { describe, expect, it } from 'vitest';
import { resolveTemplates } from './resolveTemplates';
import type { ColumnTemplate, ColumnTemplatesState } from './state';
import type { ColumnAssignment } from '../column-customization/state';

const baseAssignment = (over: Partial<ColumnAssignment> = {}): ColumnAssignment => ({
  colId: 'price',
  ...over,
});

const tpl = (id: string, over: Partial<ColumnTemplate> = {}): ColumnTemplate => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const emptyState: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

describe('resolveTemplates — identity / no-op paths', () => {
  it('test 1 — no templateIds and no typeDefault → returns assignment unchanged (identity)', () => {
    const a = baseAssignment({ headerName: 'Price' });
    expect(resolveTemplates(a, emptyState, undefined)).toBe(a);
  });

  it('test 2 — empty templateIds: [] and no typeDefault → returns assignment unchanged', () => {
    const a = baseAssignment({ templateIds: [] });
    expect(resolveTemplates(a, emptyState, undefined)).toBe(a);
  });

  it('test 16 — empty template (only id/name/timestamps) in chain → no-op merge, doesn\'t clear existing fields', () => {
    const a = baseAssignment({ headerName: 'Price', sortable: true, templateIds: ['empty'] });
    const state: ColumnTemplatesState = {
      templates: { empty: tpl('empty') },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.headerName).toBe('Price');
    expect(out.sortable).toBe(true);
  });
});

describe('resolveTemplates — chain composition', () => {
  it('test 3 — single templateId → fields from template appear on resolved', () => {
    const a = baseAssignment({ templateIds: ['t1'] });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true, filterable: false }) },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(true);
    expect(out.filterable).toBe(false);
  });

  it('test 4 — two templateIds → later wins for last-writer-wins fields', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { sortable: true, filterable: true, resizable: false }),
        t2: tpl('t2', { sortable: false, resizable: true }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(false);     // t2 won
    expect(out.filterable).toBe(true);    // only t1 set it; survives
    expect(out.resizable).toBe(true);     // t2 won
  });

  it('test 5 — overlapping cellStyleOverrides.typography → per-field merge (later bold wins, earlier fontSize survives)', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { cellStyleOverrides: { typography: { bold: false, fontSize: 14 } } }),
        t2: tpl('t2', { cellStyleOverrides: { typography: { bold: true } } }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.typography?.bold).toBe(true);
    expect(out.cellStyleOverrides?.typography?.fontSize).toBe(14);
  });

  it('test 6 — overlapping colors AND non-overlapping borders → both merged into one composed style', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellStyleOverrides: {
            colors: { background: '#000', text: '#fff' },
            borders: { top: { width: 1, style: 'solid', color: '#ccc' } },
          },
        }),
        t2: tpl('t2', {
          cellStyleOverrides: {
            colors: { background: '#111' },
            borders: { bottom: { width: 2, style: 'dashed', color: '#888' } },
          },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.colors).toEqual({ background: '#111', text: '#fff' });
    expect(out.cellStyleOverrides?.borders?.top).toEqual({ width: 1, style: 'solid', color: '#ccc' });
    expect(out.cellStyleOverrides?.borders?.bottom).toEqual({ width: 2, style: 'dashed', color: '#888' });
  });
});

describe('resolveTemplates — assignment wins last', () => {
  it('test 7 — assignment override of a styling sub-field beats template (per-field)', () => {
    const a = baseAssignment({
      templateIds: ['t1'],
      cellStyleOverrides: { typography: { bold: false } },
    });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { cellStyleOverrides: { typography: { bold: true, fontSize: 14 } } }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.typography?.bold).toBe(false);     // assignment won
    expect(out.cellStyleOverrides?.typography?.fontSize).toBe(14);    // template's value survives
  });

  it('test 8 — assignment override of a behavior flag beats template', () => {
    const a = baseAssignment({ templateIds: ['t1'], sortable: false });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true }) },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(false);
  });

  it('test 9 — assignment valueFormatterTemplate beats template (entire union replaced)', () => {
    const a = baseAssignment({
      templateIds: ['t1'],
      valueFormatterTemplate: { kind: 'preset', preset: 'currency' },
    });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { valueFormatterTemplate: { kind: 'preset', preset: 'percent' } }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'currency' });
  });
});

describe('resolveTemplates — unknown ids and typeDefaults', () => {
  it('test 10 — templateIds references unknown id → silently skipped, other ids still apply', () => {
    const a = baseAssignment({ templateIds: ['ghost', 't1'] });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true }) },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(true);
  });

  it('test 11 — templateIds undefined AND typeDefault exists for column dataType → typeDefault applies', () => {
    const a = baseAssignment(); // no templateIds
    const state: ColumnTemplatesState = {
      templates: { numericTpl: tpl('numericTpl', { sortable: true }) },
      typeDefaults: { numeric: 'numericTpl' },
    };
    const out = resolveTemplates(a, state, 'numeric');
    expect(out.sortable).toBe(true);
  });

  it('test 12 — templateIds: [] (explicit empty) AND typeDefault exists → typeDefault does NOT apply (explicit opt-out)', () => {
    const a = baseAssignment({ templateIds: [] });
    const state: ColumnTemplatesState = {
      templates: { numericTpl: tpl('numericTpl', { sortable: true }) },
      typeDefaults: { numeric: 'numericTpl' },
    };
    const out = resolveTemplates(a, state, 'numeric');
    expect(out.sortable).toBeUndefined();
  });

  it('test 13 — typeDefault references unknown templateId → silently no-op', () => {
    const a = baseAssignment();
    const state: ColumnTemplatesState = {
      templates: {},
      typeDefaults: { numeric: 'ghost' },
    };
    const out = resolveTemplates(a, state, 'numeric');
    expect(out).toBe(a); // identity short-circuit
  });

  it('test 14 — typeDefault for numeric applies; columns of other dataTypes unaffected', () => {
    const a = baseAssignment();
    const state: ColumnTemplatesState = {
      templates: { numTpl: tpl('numTpl', { filterable: true }) },
      typeDefaults: { numeric: 'numTpl' },
    };
    expect(resolveTemplates(a, state, 'string').filterable).toBeUndefined();
    expect(resolveTemplates(a, state, 'date').filterable).toBeUndefined();
    expect(resolveTemplates(a, state, 'numeric').filterable).toBe(true);
  });

  it('test 15 — typeDefault composition: column with no templateIds, only typeDefault → resolved fields match the typeDefault template', () => {
    const a = baseAssignment();
    const state: ColumnTemplatesState = {
      templates: {
        d: tpl('d', {
          sortable: true,
          cellStyleOverrides: { alignment: { horizontal: 'right' } },
        }),
      },
      typeDefaults: { date: 'd' },
    };
    const out = resolveTemplates(a, state, 'date');
    expect(out.sortable).toBe(true);
    expect(out.cellStyleOverrides?.alignment?.horizontal).toBe('right');
  });
});

describe('resolveTemplates — purity, borders, opaque params', () => {
  it('test 17 — pure function: same input produces equal output values', () => {
    const a = baseAssignment({ templateIds: ['t1'], sortable: false });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true, filterable: true }) },
      typeDefaults: {},
    };
    const out1 = resolveTemplates(a, state, undefined);
    const out2 = resolveTemplates(a, state, undefined);
    expect(out1).toEqual(out2);
  });

  it('test 18 — borders: t1 sets only top, t2 sets only bottom → both present in resolved', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellStyleOverrides: { borders: { top: { width: 1, style: 'solid', color: '#aaa' } } },
        }),
        t2: tpl('t2', {
          cellStyleOverrides: { borders: { bottom: { width: 2, style: 'dashed', color: '#bbb' } } },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.borders?.top).toEqual({ width: 1, style: 'solid', color: '#aaa' });
    expect(out.cellStyleOverrides?.borders?.bottom).toEqual({ width: 2, style: 'dashed', color: '#bbb' });
  });

  it('test 19 — borders: t1 sets top, t2 also sets top → t2\'s full BorderSpec wins (per-side replace, not per-property)', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellStyleOverrides: { borders: { top: { width: 1, style: 'solid', color: '#aaa' } } },
        }),
        t2: tpl('t2', {
          cellStyleOverrides: { borders: { top: { width: 3, style: 'dotted', color: '#ccc' } } },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    // t2 wholesale replaced t1's top-border spec — including the color.
    expect(out.cellStyleOverrides?.borders?.top).toEqual({ width: 3, style: 'dotted', color: '#ccc' });
  });

  it('test 20 — cellEditorParams replaced wholesale by later template (not deep-merged) — opaque-object semantic', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellEditorName: 'agSelectCellEditor',
          cellEditorParams: { values: ['A', 'B'], placeholder: 'pick' },
        }),
        t2: tpl('t2', {
          cellEditorParams: { values: ['X', 'Y'] },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    // t2's params replaced t1's wholesale — `placeholder` is gone.
    expect(out.cellEditorParams).toEqual({ values: ['X', 'Y'] });
    // But cellEditorName came from t1 and is unchanged (t2 didn't set it).
    expect(out.cellEditorName).toBe('agSelectCellEditor');
  });
});
