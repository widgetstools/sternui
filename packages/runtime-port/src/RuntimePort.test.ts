import { describe, it, expect } from 'vitest';
import type {
  IdentitySnapshot,
  RuntimePort,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from './index.js';

/**
 * Smoke test: confirm a minimal in-memory implementation can satisfy the
 * `RuntimePort` contract. This is not a real runtime — it exists so the
 * test asserts the interface is implementable, the exported types are
 * sufficient, and the lifecycle semantics (`dispose()` clears listeners)
 * round-trip correctly.
 */
class FakeRuntime implements RuntimePort {
  readonly name = 'fake';

  private theme: Theme = 'light';
  private themeListeners = new Set<(t: Theme) => void>();
  private shownListeners = new Set<() => void>();
  private closingListeners = new Set<() => void>();
  private customDataListeners = new Set<(cd: Readonly<Record<string, unknown>>) => void>();
  private disposed = false;

  resolveIdentity(): IdentitySnapshot {
    return {
      instanceId: 'fake-1',
      appId: 'app-1',
      userId: 'user-1',
      componentType: 'TestComponent',
      componentSubType: '',
      isTemplate: false,
      singleton: false,
      roles: [],
      permissions: [],
      customData: {},
    };
  }

  async openSurface(spec: SurfaceSpec): Promise<SurfaceHandle> {
    const closedListeners = new Set<() => void>();
    return {
      kind: spec.kind,
      id: 'fake-surface-1',
      close: () => {
        for (const fn of closedListeners) fn();
        closedListeners.clear();
      },
      onClosed: (fn) => {
        closedListeners.add(fn);
        return () => closedListeners.delete(fn);
      },
    };
  }

  getTheme(): Theme {
    return this.theme;
  }

  setThemeForTest(theme: Theme): void {
    this.theme = theme;
    for (const fn of this.themeListeners) fn(theme);
  }

  emitShownForTest(): void {
    for (const fn of this.shownListeners) fn();
  }

  emitClosingForTest(): void {
    for (const fn of this.closingListeners) fn();
  }

  emitCustomDataForTest(cd: Readonly<Record<string, unknown>>): void {
    for (const fn of this.customDataListeners) fn(cd);
  }

  onThemeChanged(fn: (t: Theme) => void): Unsubscribe {
    this.themeListeners.add(fn);
    return () => this.themeListeners.delete(fn);
  }

  onWindowShown(fn: () => void): Unsubscribe {
    this.shownListeners.add(fn);
    return () => this.shownListeners.delete(fn);
  }

  onWindowClosing(fn: () => void): Unsubscribe {
    this.closingListeners.add(fn);
    return () => this.closingListeners.delete(fn);
  }

  onCustomDataChanged(fn: (cd: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    this.customDataListeners.add(fn);
    return () => this.customDataListeners.delete(fn);
  }

  dispose(): void {
    this.disposed = true;
    this.themeListeners.clear();
    this.shownListeners.clear();
    this.closingListeners.clear();
    this.customDataListeners.clear();
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

describe('RuntimePort interface', () => {
  it('FakeRuntime satisfies the RuntimePort interface (compile-time check)', () => {
    const port: RuntimePort = new FakeRuntime();
    expect(port.name).toBe('fake');
    expect(port.getTheme()).toBe('light');
  });

  it('resolveIdentity returns a frozen-shaped IdentitySnapshot', () => {
    const port = new FakeRuntime();
    const id = port.resolveIdentity();
    expect(id.instanceId).toBe('fake-1');
    expect(id.roles).toEqual([]);
    expect(id.customData).toEqual({});
  });

  it('onThemeChanged delivers updates and unsubscribe stops them', () => {
    const port = new FakeRuntime();
    const events: Theme[] = [];
    const unsub = port.onThemeChanged((t) => events.push(t));
    port.setThemeForTest('dark');
    port.setThemeForTest('light');
    unsub();
    port.setThemeForTest('dark');
    expect(events).toEqual(['dark', 'light']);
  });

  it('onWindowShown / onWindowClosing fire and unsubscribe respects cleanup', () => {
    const port = new FakeRuntime();
    let shown = 0, closing = 0;
    const unsub1 = port.onWindowShown(() => shown++);
    const unsub2 = port.onWindowClosing(() => closing++);
    port.emitShownForTest();
    port.emitClosingForTest();
    unsub1();
    unsub2();
    port.emitShownForTest();
    port.emitClosingForTest();
    expect(shown).toBe(1);
    expect(closing).toBe(1);
  });

  it('onCustomDataChanged delivers payloads and dispose clears listeners', () => {
    const port = new FakeRuntime();
    const captured: Array<Readonly<Record<string, unknown>>> = [];
    port.onCustomDataChanged((cd) => captured.push(cd));
    port.emitCustomDataForTest({ foo: 1 });
    port.dispose();
    port.emitCustomDataForTest({ foo: 2 });
    expect(captured).toEqual([{ foo: 1 }]);
    expect(port.isDisposed()).toBe(true);
  });

  it('openSurface returns a handle whose close() fires onClosed listeners', async () => {
    const port = new FakeRuntime();
    const handle = await port.openSurface({ kind: 'popout', url: '/x' });
    let closed = 0;
    handle.onClosed(() => closed++);
    handle.close();
    expect(closed).toBe(1);
  });
});
