import { describe, expect, it } from 'vitest';
import { INITIAL_COLUMN_TEMPLATES, type ColumnTemplatesState } from './state';

describe('column-templates state', () => {
  it('INITIAL_COLUMN_TEMPLATES has empty templates and typeDefaults', () => {
    expect(INITIAL_COLUMN_TEMPLATES).toEqual({ templates: {}, typeDefaults: {} });
  });

  it('INITIAL_COLUMN_TEMPLATES is a fresh object — callers can mutate spread copies', () => {
    const a: ColumnTemplatesState = { ...INITIAL_COLUMN_TEMPLATES, templates: {} };
    a.templates['x'] = {
      id: 'x', name: 'X', createdAt: 0, updatedAt: 0,
    };
    // The shared INITIAL must not have been mutated.
    expect(INITIAL_COLUMN_TEMPLATES.templates).toEqual({});
  });
});
