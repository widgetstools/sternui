import { describe, expect, it } from 'vitest';
import { restartExtrasEqual, stableRestartExtra, providerCfgsEqual } from './hubHelpers.js';

describe('stableRestartExtra', () => {
  it('strips __-prefixed keys and sorts remaining keys', () => {
    expect(
      stableRestartExtra({ __refresh: 1, asOfDate: '2026-04-01', rowShape: 'csrm' }),
    ).toEqual({ asOfDate: '2026-04-01', rowShape: 'csrm' });
  });

  it('returns null when only cache-busters remain', () => {
    expect(stableRestartExtra({ __refresh: Date.now() })).toBeNull();
  });
});

describe('restartExtrasEqual', () => {
  it('late-joins when active had __refresh and incoming has the same stable overlay', () => {
    expect(
      restartExtrasEqual(
        { rowShape: 'csrm', __refresh: 1 },
        { rowShape: 'csrm' },
      ),
    ).toBe(true);
  });

  it('late-joins matching asOfDate regardless of __refresh on the active slot', () => {
    expect(
      restartExtrasEqual(
        { asOfDate: '2026-04-01', rowShape: 'csrm', __refresh: 99 },
        { asOfDate: '2026-04-01', rowShape: 'csrm' },
      ),
    ).toBe(true);
  });

  it('does not late-join when stable overlay differs', () => {
    expect(
      restartExtrasEqual(
        { rowShape: 'csrm', __refresh: 1 },
        { rowShape: 'ssrm' },
      ),
    ).toBe(false);
  });

  it('ignores differing __refresh (demux noise) when stable overlay matches', () => {
    expect(
      restartExtrasEqual(
        { rowShape: 'csrm', __refresh: 1 },
        { rowShape: 'csrm', __refresh: 2 },
      ),
    ).toBe(true);
  });

  it('forces restart when incoming carries __reload', () => {
    expect(
      restartExtrasEqual(
        { rowShape: 'csrm' },
        { rowShape: 'csrm', __reload: 99 },
      ),
    ).toBe(false);
  });

  it('late-joins rowShape-only when the running slot has no recorded overlay yet', () => {
    expect(restartExtrasEqual(null, { rowShape: 'csrm' })).toBe(true);
    expect(restartExtrasEqual(undefined, { rowShape: 'csrm', __refresh: 1 })).toBe(true);
  });

  it('does not late-join asOfDate when the running slot has no recorded overlay', () => {
    expect(restartExtrasEqual(null, { asOfDate: '2026-04-01' })).toBe(false);
    expect(restartExtrasEqual(null, { rowShape: 'csrm', asOfDate: '2026-04-01' })).toBe(false);
  });

  it('still forces restart on __reload when active overlay is null', () => {
    expect(restartExtrasEqual(null, { rowShape: 'csrm', __reload: 1 })).toBe(false);
  });

  it('ignores null/undefined stable values when comparing overlays', () => {
    expect(
      restartExtrasEqual(
        { rowShape: 'csrm' },
        { rowShape: 'csrm', asOfDate: undefined as unknown as string },
      ),
    ).toBe(true);
  });
});

describe('providerCfgsEqual', () => {
  it('matches identical config objects', () => {
    const cfg = { providerType: 'mock', keyColumn: 'id' };
    expect(providerCfgsEqual(cfg, { ...cfg })).toBe(true);
  });

  it('detects connection edits', () => {
    expect(
      providerCfgsEqual(
        { providerType: 'stomp', brokerURL: 'a' },
        { providerType: 'stomp', brokerURL: 'b' },
      ),
    ).toBe(false);
  });
});
