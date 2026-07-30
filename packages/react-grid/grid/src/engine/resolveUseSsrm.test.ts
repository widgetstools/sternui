import { describe, expect, it } from 'vitest';
import { resolveUseSsrm, resolveGridSurface } from './resolveUseSsrm.js';

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
