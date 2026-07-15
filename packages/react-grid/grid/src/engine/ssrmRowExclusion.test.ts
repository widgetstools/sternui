import { describe, expect, it } from 'vitest';
import { compileRowExclusionKeepExpression } from './ssrmRowExclusion.js';

describe('compileRowExclusionKeepExpression', () => {
  it('wraps a compiled equality in not(...)', () => {
    const r = compileRowExclusionKeepExpression('[ccy] == "INR"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perspectiveExpression).toBe('"ccy" == "INR"');
      expect(r.keepExpression).toBe('not("ccy" == "INR")');
    }
  });

  it('fails open on empty / unsupported expressions', () => {
    expect(compileRowExclusionKeepExpression('').ok).toBe(false);
    expect(compileRowExclusionKeepExpression('  ').ok).toBe(false);
    const bad = compileRowExclusionKeepExpression('[price.old] > 0');
    expect(bad.ok).toBe(false);
  });
});
