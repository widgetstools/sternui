import { describe, expect, it } from 'vitest';
import { columnTemplatesModule, INITIAL_COLUMN_TEMPLATES } from './index';
import type { ColumnTemplatesState } from './state';

describe('column-templates module — metadata', () => {
  it('declares stable id and schemaVersion 1', () => {
    expect(columnTemplatesModule.id).toBe('column-templates');
    expect(columnTemplatesModule.schemaVersion).toBe(1);
  });

  it('declares no module dependencies (pure state holder)', () => {
    expect(columnTemplatesModule.dependencies ?? []).toEqual([]);
  });

  it('runs before column-customization in the transform pipeline (priority < 10)', () => {
    expect(columnTemplatesModule.priority).toBeLessThan(10);
  });

  it('exposes no transformColumnDefs and no SettingsPanel (column-customization owns the walker; UI lands in sub-project #4)', () => {
    expect(columnTemplatesModule.transformColumnDefs).toBeUndefined();
    expect(columnTemplatesModule.SettingsPanel).toBeUndefined();
  });

  it('getInitialState returns a fresh object each call (no shared frozen inner refs)', () => {
    const a = columnTemplatesModule.getInitialState();
    const b = columnTemplatesModule.getInitialState();
    expect(a).not.toBe(b);
    expect(a.templates).not.toBe(b.templates);
    expect(a.typeDefaults).not.toBe(b.typeDefaults);
    // And critically — the returned state must be mutable (Module contract).
    expect(() => {
      a.templates['x'] = { id: 'x', name: 'X', createdAt: 0, updatedAt: 0 };
    }).not.toThrow();
  });
});

describe('column-templates module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: ColumnTemplatesState = {
      templates: {
        n1: { id: 'n1', name: 'Numeric', sortable: true, createdAt: 1, updatedAt: 2 },
      },
      typeDefaults: { numeric: 'n1' },
    };
    expect(columnTemplatesModule.deserialize(columnTemplatesModule.serialize(state))).toEqual(state);
  });

  it('tolerates null / undefined / non-object payloads → INITIAL', () => {
    expect(columnTemplatesModule.deserialize(null)).toEqual(INITIAL_COLUMN_TEMPLATES);
    expect(columnTemplatesModule.deserialize(undefined)).toEqual(INITIAL_COLUMN_TEMPLATES);
    expect(columnTemplatesModule.deserialize('garbage')).toEqual(INITIAL_COLUMN_TEMPLATES);
  });

  it('drops malformed templates / typeDefaults sub-fields', () => {
    const out = columnTemplatesModule.deserialize({
      templates: 'not an object',
      typeDefaults: 42,
    });
    expect(out).toEqual(INITIAL_COLUMN_TEMPLATES);
  });

  it('deserialize(null) returns a fresh mutable shape, not a frozen INITIAL spread', () => {
    const out = columnTemplatesModule.deserialize(null);
    // Same mutability guarantee that `getInitialState` provides.
    expect(() => {
      out.templates['x'] = { id: 'x', name: 'X', createdAt: 0, updatedAt: 0 };
    }).not.toThrow();
    // Two calls must not alias each other.
    expect(columnTemplatesModule.deserialize(null)).not.toBe(out);
  });
});
