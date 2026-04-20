import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFinWindowOpener } from './openFin';

/**
 * Unit tests for the `openFinWindowOpener` factory — specifically
 * its handling of the name-collision retry path. The real symptom
 * we're guarding against: `fin.Window.create` rejects with
 * "Trying to create a Window with name-uuid combination already in
 * use" when the name is already registered (typically from React
 * StrictMode's double-invoke of the open effect).
 *
 * The opener's contract:
 *   1. Look up any existing window under (uuid, name) via
 *      `Window.wrap(...).getInfo()`; if registered, close it.
 *   2. Create the new window.
 *   3. On "already in use" error, back off briefly and retry once.
 *   4. If still failing, return null so the caller can fall back.
 */

type FinMock = {
  Window: {
    wrap: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  me: { identity: { uuid: string } };
};

function setupFin(custom: Partial<FinMock> = {}): FinMock {
  const fin: FinMock = {
    Window: {
      wrap: vi.fn(() => ({
        getInfo: vi.fn().mockRejectedValue(new Error('not found')),
        close: vi.fn().mockResolvedValue(undefined),
      })),
      create: vi.fn().mockResolvedValue({
        getWebWindow: () => ({ /* fake Window */ } as unknown as Window),
      }),
    },
    me: { identity: { uuid: 'test-app' } },
    ...custom,
  };
  (window as unknown as { fin: FinMock }).fin = fin;
  return fin;
}

describe('openFinWindowOpener', () => {
  afterEach(() => {
    delete (window as unknown as { fin?: FinMock }).fin;
  });

  it('returns undefined when not running inside OpenFin', () => {
    expect(openFinWindowOpener()).toBeUndefined();
  });

  it('closes any pre-existing window under the same (uuid,name) before creating', async () => {
    // Simulate an existing window: getInfo resolves (→ registered),
    // close is recorded.
    const existingClose = vi.fn().mockResolvedValue(undefined);
    const fin = setupFin({
      Window: {
        wrap: vi.fn(() => ({
          getInfo: vi.fn().mockResolvedValue({ /* info */ }),
          close: existingClose,
        })),
        create: vi.fn().mockResolvedValue({
          getWebWindow: () => ({} as Window),
        }),
      },
    });

    const opener = openFinWindowOpener();
    await opener!({ name: 'p', width: 100, height: 100 });

    expect(fin.Window.wrap).toHaveBeenCalledWith({ uuid: 'test-app', name: 'p' });
    expect(existingClose).toHaveBeenCalledWith(true);
    expect(fin.Window.create).toHaveBeenCalled();
  });

  it('retries once after a name-collision error, then succeeds', async () => {
    let callCount = 0;
    const fin = setupFin({
      Window: {
        wrap: vi.fn(() => ({
          getInfo: vi.fn().mockRejectedValue(new Error('not found')),
          close: vi.fn(),
        })),
        create: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Trying to create a Window with name-uuid combination already in use');
          }
          return { getWebWindow: () => ({} as Window) };
        }),
      },
    });

    const opener = openFinWindowOpener();
    const result = await opener!({ name: 'p', width: 100, height: 100 });

    expect(result).not.toBeNull();
    expect(fin.Window.create).toHaveBeenCalledTimes(2);
  });

  it('returns null after 2 failed create attempts (gives up, caller falls back)', async () => {
    const fin = setupFin({
      Window: {
        wrap: vi.fn(() => ({
          getInfo: vi.fn().mockRejectedValue(new Error('not found')),
          close: vi.fn(),
        })),
        create: vi.fn().mockRejectedValue(
          new Error('Trying to create a Window with name-uuid combination already in use'),
        ),
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const opener = openFinWindowOpener();
    const result = await opener!({ name: 'p', width: 100, height: 100 });

    expect(result).toBeNull();
    expect(fin.Window.create).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      '[openFin] Window.create failed — falling back to window.open',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('does NOT retry on non-collision errors (fails fast)', async () => {
    const fin = setupFin({
      Window: {
        wrap: vi.fn(() => ({
          getInfo: vi.fn().mockRejectedValue(new Error('not found')),
          close: vi.fn(),
        })),
        create: vi.fn().mockRejectedValue(new Error('something totally different')),
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const opener = openFinWindowOpener();
    const result = await opener!({ name: 'p', width: 100, height: 100 });

    expect(result).toBeNull();
    expect(fin.Window.create).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('passes alwaysOnTop + processAffinity through to Window.create', async () => {
    const fin = setupFin();
    const opener = openFinWindowOpener({ alwaysOnTop: true });
    await opener!({ name: 'p', width: 900, height: 120, alwaysOnTop: true });

    expect(fin.Window.create).toHaveBeenCalledWith(
      expect.objectContaining({
        alwaysOnTop: true,
        processAffinity: expect.stringMatching(/^gc-popout/),
      }),
    );
  });
});
