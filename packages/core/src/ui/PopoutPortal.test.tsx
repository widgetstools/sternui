import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { PopoutPortal } from './PopoutPortal';

/**
 * Unit tests for PopoutPortal. `window.open` is stubbed per test so we
 * can assert the portal's behavior without relying on a real browser
 * popup (blocked by jsdom). The stub returns a fake window wrapping a
 * detached Document — enough for React's portal to mount into.
 */

interface FakePopout {
  win: Window;
  close: ReturnType<typeof vi.fn>;
  closed: boolean;
  document: Document;
}

function createFakePopout(): FakePopout {
  // A fresh document keyed off the current window's implementation.
  const doc = document.implementation.createHTMLDocument('popout');
  const close = vi.fn();
  const listeners = new Set<EventListener>();
  const state = { closed: false };
  const win: Window & { __fireUnload: () => void } = {
    document: doc,
    get closed() { return state.closed; },
    close: () => { state.closed = true; close(); },
    addEventListener: (event: string, fn: EventListener) => {
      if (event === 'beforeunload') listeners.add(fn);
    },
    removeEventListener: (event: string, fn: EventListener) => {
      if (event === 'beforeunload') listeners.delete(fn);
    },
    // Helper exposed for tests: fire beforeunload so the polling path
    // doesn't have to be exercised.
    __fireUnload: () => {
      for (const fn of listeners) fn(new Event('beforeunload'));
    },
  } as unknown as Window & { __fireUnload: () => void };
  return { win, close, closed: state.closed, document: doc };
}

describe('PopoutPortal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens a window with the name + features passed via props', async () => {
    const fake = createFakePopout();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="gc-popout-test" title="Test" width={800} height={600} onClose={() => {}}>
        <div data-testid="child">hi</div>
      </PopoutPortal>,
    );
    await act(async () => { /* flush microtask queue */ });

    expect(openSpy).toHaveBeenCalledWith(
      '',
      'gc-popout-test',
      expect.stringContaining('width=800'),
    );
    expect(openSpy).toHaveBeenCalledWith(
      '',
      'gc-popout-test',
      expect.stringContaining('height=600'),
    );
  });

  it('renders children inside the popout document via createPortal', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="t" title="T" onClose={() => {}}>
        <div data-testid="portalled-child">hello</div>
      </PopoutPortal>,
    );
    await act(async () => {});

    // The child should NOT be in the main document (we rendered into
    // the popout instead).
    expect(document.querySelector('[data-testid="portalled-child"]')).toBeNull();
    // But it SHOULD be inside the popout's document.
    expect(fake.document.querySelector('[data-testid="portalled-child"]')).not.toBeNull();
    // And inside the data-popout-root mount node.
    expect(fake.document.querySelector('[data-popout-root] [data-testid="portalled-child"]')).not.toBeNull();
  });

  it('clones stylesheets from the main document into the popout head', async () => {
    // Seed a stylesheet on the main doc.
    const seed = document.createElement('style');
    seed.id = 'popout-test-seed';
    seed.textContent = '.marker-class { color: red; }';
    document.head.appendChild(seed);
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="t2" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    // The cloned stylesheet should be present in the popout's head.
    const seededClone = fake.document.getElementById('popout-test-seed');
    expect(seededClone).not.toBeNull();
    expect(seededClone?.textContent).toContain('.marker-class');

    document.head.removeChild(seed);
  });

  it('fires onClose when the popout emits beforeunload', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);
    const onClose = vi.fn();

    render(
      <PopoutPortal name="t3" onClose={onClose}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    // Simulate the user closing the popout window.
    (fake.win as unknown as { __fireUnload: () => void }).__fireUnload();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the popout window when the portal unmounts', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    const { unmount } = render(
      <PopoutPortal name="t4" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(fake.close).not.toHaveBeenCalled();
    unmount();
    expect(fake.close).toHaveBeenCalled();
  });

  it('falls back to onClose when window.open returns null (popup blocker)', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onClose = vi.fn();

    render(
      <PopoutPortal name="t5" onClose={onClose}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(onClose).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('sets the popout document.title and syncs it when the title prop changes', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    const { rerender } = render(
      <PopoutPortal name="title-a" title="Grid Customizer — grid-A" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});
    expect(fake.document.title).toBe('Grid Customizer — grid-A');

    // Prop change should update the popout's doc title (e.g. caller
    // swapped the active gridId or appended a profile name).
    rerender(
      <PopoutPortal name="title-a" title="Grid Customizer — grid-B" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});
    expect(fake.document.title).toBe('Grid Customizer — grid-B');
  });

  it('fires onWindowOpened exactly once with the opened Window reference', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);
    const onWindowOpened = vi.fn();

    render(
      <PopoutPortal name="onopen" onClose={() => {}} onWindowOpened={onWindowOpened}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(onWindowOpened).toHaveBeenCalledTimes(1);
    expect(onWindowOpened).toHaveBeenCalledWith(fake.win);
  });

  it('uses a custom openWindow callback when provided (OpenFin path)', async () => {
    const fake = createFakePopout();
    const customOpen = vi.fn(async () => fake.win);

    render(
      <PopoutPortal name="t6" onClose={() => {}} openWindow={customOpen}>
        <div data-testid="openfin-child">via openfin</div>
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(customOpen).toHaveBeenCalledWith({ name: 't6', width: 900, height: 700 });
    // Child still lands in the fake-OpenFin document.
    expect(fake.document.querySelector('[data-testid="openfin-child"]')).not.toBeNull();
  });
});
