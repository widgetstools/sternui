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
});
