import { describe, expect, it } from 'vitest';
import { restartOverlayChanged } from './hubHelpers.js';

describe('restartOverlayChanged', () => {
  it('late-joiner omitting __refresh does NOT restart (the multi-blotter bug)', () => {
    // First window started the provider with a nonce; a second window on the
    // running provider sends the same overlay WITHOUT __refresh.
    const active = { rowShape: 'csrm', __refresh: 1785236683698 };
    const incoming = { rowShape: 'csrm' };
    expect(restartOverlayChanged(active, incoming)).toBe(false);
  });

  it('a fresh __refresh nonce restarts (the Restart button)', () => {
    const active = { rowShape: 'csrm', __refresh: 1000 };
    const incoming = { __refresh: 2000 };
    expect(restartOverlayChanged(active, incoming)).toBe(true);
  });

  it('the same __refresh nonce does NOT restart', () => {
    const active = { rowShape: 'csrm', __refresh: 1000 };
    const incoming = { rowShape: 'csrm', __refresh: 1000 };
    expect(restartOverlayChanged(active, incoming)).toBe(false);
  });

  it('a semantic overlay change (rowShape) restarts, nonce aside', () => {
    const active = { rowShape: 'csrm', __refresh: 1000 };
    const incoming = { rowShape: 'ssrm' };
    expect(restartOverlayChanged(active, incoming)).toBe(true);
  });

  it('a semantic overlay change (asOfDate) restarts', () => {
    const active = { rowShape: 'csrm' };
    const incoming = { rowShape: 'csrm', asOfDate: '2026-01-01' };
    expect(restartOverlayChanged(active, incoming)).toBe(true);
  });

  it('two historical subscribers with the same asOfDate do NOT restart', () => {
    const active = { rowShape: 'csrm', asOfDate: '2026-01-01' };
    const incoming = { rowShape: 'csrm', asOfDate: '2026-01-01' };
    expect(restartOverlayChanged(active, incoming)).toBe(false);
  });

  it('no prior overlay + an incoming overlay restarts (first attach)', () => {
    expect(restartOverlayChanged(null, { rowShape: 'csrm' })).toBe(true);
    expect(restartOverlayChanged(undefined, { rowShape: 'csrm', __refresh: 1 })).toBe(true);
  });

  it('ignores __-key insertion order when comparing semantic overlays', () => {
    const active = { __refresh: 1, rowShape: 'csrm' };
    const incoming = { rowShape: 'csrm' };
    expect(restartOverlayChanged(active, incoming)).toBe(false);
  });
});
