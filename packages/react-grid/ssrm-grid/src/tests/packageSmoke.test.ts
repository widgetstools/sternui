import { describe, expect, it } from 'vitest';
import { SSRM_GRID_PACKAGE } from '../index.js';

describe('@starui/ssrm-grid', () => {
  it('exports package id', () => {
    expect(SSRM_GRID_PACKAGE).toBe('@starui/ssrm-grid');
  });
});
