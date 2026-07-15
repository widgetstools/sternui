import { describe, expect, it } from 'vitest';
import { resolveUseSsrm } from './resolveUseSsrm.js';

describe('resolveUseSsrm', () => {
  it('defaults to CSRM when neither prop is set', () => {
    expect(resolveUseSsrm({})).toBe(false);
  });

  it('honors useSSRM boolean', () => {
    expect(resolveUseSsrm({ useSSRM: true })).toBe(true);
    expect(resolveUseSsrm({ useSSRM: false })).toBe(false);
  });

  it('maps rowModel server/client', () => {
    expect(resolveUseSsrm({ rowModel: 'server' })).toBe(true);
    expect(resolveUseSsrm({ rowModel: 'client' })).toBe(false);
  });

  it('lets useSSRM win when both are set', () => {
    expect(resolveUseSsrm({ useSSRM: false, rowModel: 'server' })).toBe(false);
    expect(resolveUseSsrm({ useSSRM: true, rowModel: 'client' })).toBe(true);
  });
});
