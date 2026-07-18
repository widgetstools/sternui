import { describe, expect, it } from 'vitest';
import { SSRM_GRID_PACKAGE } from '../index.js';

describe('@wellsfargo-starui/ssrm-grid', () => {
  it('exports package id', () => {
    expect(SSRM_GRID_PACKAGE).toBe('@wellsfargo-starui/ssrm-grid');
  });
});
