import { describe, expect, it } from 'vitest';
import { INITIAL_COLUMN_TEMPLATES, type ColumnTemplatesState } from './state';

describe('column-templates state', () => {
  it('INITIAL_COLUMN_TEMPLATES has empty templates and typeDefaults', () => {
    expect(INITIAL_COLUMN_TEMPLATES).toEqual({ templates: {}, typeDefaults: {} });
  });

  it('INITIAL_COLUMN_TEMPLATES is frozen — direct mutation throws in strict mode', () => {
    // ESM modules are strict by default, and vitest runs tests in strict mode
    // (the surrounding code is generated from `.ts` and emitted as ESM). Direct
    // assignment to a frozen object's property throws TypeError.
    expect(() => {
      (INITIAL_COLUMN_TEMPLATES as { templates: Record<string, unknown> }).templates['x'] = {} as never;
    }).toThrow(TypeError);
    // Belt-and-suspenders: confirm the underlying nested object was untouched.
    expect(INITIAL_COLUMN_TEMPLATES.templates).toEqual({});
  });

  it('callers must replace nested refs, not shallow-spread, to safely mutate', () => {
    // Correct pattern: build a fresh state with new nested refs.
    const fresh: ColumnTemplatesState = {
      templates: { ...INITIAL_COLUMN_TEMPLATES.templates },
      typeDefaults: { ...INITIAL_COLUMN_TEMPLATES.typeDefaults },
    };
    fresh.templates['x'] = { id: 'x', name: 'X', createdAt: 0, updatedAt: 0 };
    expect(fresh.templates).toEqual({
      x: { id: 'x', name: 'X', createdAt: 0, updatedAt: 0 },
    });
    // INITIAL is unchanged — the spread copied the values, not the reference.
    expect(INITIAL_COLUMN_TEMPLATES.templates).toEqual({});
  });
});
