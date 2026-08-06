import { describe, expect, it } from 'vitest';
import { resolveUseSsrm, resolveGridSurface, resolveEngineKind } from './resolveUseSsrm.js';
import { isServerSideEngine } from './types.js';

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

describe('resolveGridSurface', () => {
  it('mounts NOTHING while the Perspective Table is attaching', () => {
    // The invariant: exactly one grid may mount per GridPlatform, ever.
    // Falling through to CSRM here mounts a stand-in grid that attaches the
    // api and activates every module, then unmounts when the Table lands —
    // and `onGridPreDestroyed` destroys the platform permanently, so the real
    // grid's `onGridReady` is a no-op and every platform-driven feature
    // (formatting toolbar, auto-formatter, saved-filter "+", profiles) is
    // silently dead while the grid itself looks perfectly healthy.
    expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable: null })).toBe('pending');
  });

  it('mounts the Perspective surface once the Table has attached', () => {
    expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable: {} })).toBe(
      'perspective',
    );
  });

  it('treats `undefined` as "not using this seam", not as "attaching"', () => {
    // `usePerspectiveTable` answers `null` while attaching. `undefined` means
    // the caller never opted in, and must not strand them on an empty slot.
    expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable: undefined })).toBe(
      'csrm',
    );
  });

  it('never waits when the row model is not perspective', () => {
    expect(resolveGridSurface({ rowModel: 'client', perspectiveTable: null })).toBe('csrm');
    expect(resolveGridSurface({ rowModel: 'server', perspectiveTable: null })).toBe('ssrm');
  });

  it('falls back to the SSRM/CSRM choice, honouring the legacy boolean', () => {
    expect(resolveGridSurface({ useSSRM: true })).toBe('ssrm');
    expect(resolveGridSurface({ useSSRM: false, rowModel: 'server' })).toBe('csrm');
    expect(resolveGridSurface({})).toBe('csrm');
  });

  it('lets an explicit perspective row model win over the legacy boolean', () => {
    expect(
      resolveGridSurface({ rowModel: 'perspective', useSSRM: true, perspectiveTable: {} }),
    ).toBe('perspective');
  });
});

/**
 * ══ WHICH ENGINE THE MODULES ARE TOLD THEY ARE ON ══
 *
 * A defect, not a tidy-up. Both MarketsGrid mounts computed
 * `perspective ? 'perspective' : useSSRM ? 'ssrm' : 'csrm'` inline and neither
 * consulted `resolveSsrmEngine`, so `rowModel: 'ssrm-engine'` — the surface
 * that SHIPS — reported `'csrm'`. Everything gated on `isServerSideEngine()`
 * then treated a grid holding ~100 rows of a 50,000-row book as one holding the
 * whole thing; the measurable consequence was a saved-filter badge counting the
 * loaded blocks.
 */
describe('resolveEngineKind', () => {
  it('reports ssrm-engine for the surface that ships', () => {
    expect(resolveEngineKind({ rowModel: 'ssrm-engine', ssrmEngineClient: {} })).toBe(
      'ssrm-engine',
    );
    expect(isServerSideEngine(resolveEngineKind({ rowModel: 'ssrm-engine', ssrmEngineClient: {} })))
      .toBe(true);
  });

  it('keeps every other answer exactly where it was', () => {
    expect(resolveEngineKind({ rowModel: 'perspective', perspectiveTable: {} })).toBe(
      'perspective',
    );
    expect(resolveEngineKind({ rowModel: 'server' })).toBe('ssrm');
    expect(resolveEngineKind({ useSSRM: true })).toBe('ssrm');
    expect(resolveEngineKind({ rowModel: 'client' })).toBe('csrm');
    expect(resolveEngineKind({})).toBe('csrm');
  });

  it('agrees with the SURFACE choice, which is the point of one definition', () => {
    // A kind that disagreed with the mounted surface is the defect wearing a
    // different hat: the modules would be told one thing and the rows supplied
    // by another.
    for (const opts of [
      { rowModel: 'ssrm-engine' as const, ssrmEngineClient: {} },
      { rowModel: 'perspective' as const, perspectiveTable: {} },
      { rowModel: 'server' as const },
      { rowModel: 'client' as const },
      { useSSRM: true },
    ]) {
      const surface = resolveGridSurface(opts);
      if (surface === 'pending') continue;
      expect(resolveEngineKind(opts)).toBe(surface);
    }
  });

  it('is CSRM while the client has not arrived — and no grid is mounted then', () => {
    // `undefined` is "not using this seam"; `null` is "attaching", and during
    // it `resolveGridSurface` answers `'pending'` so nothing reads the kind.
    expect(resolveEngineKind({ rowModel: 'ssrm-engine' })).toBe('csrm');
    expect(resolveGridSurface({ rowModel: 'ssrm-engine', ssrmEngineClient: null })).toBe('pending');
  });
});
