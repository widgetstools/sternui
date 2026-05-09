import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyTheme, getTheme } from '../src/applyTheme';

describe('applyTheme', () => {
  beforeEach(() => {
    // jsdom-less environment: stub document
    (globalThis as any).document = { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() } };
    (globalThis as any).localStorage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      };
    })();
  });

  it('sets data-theme="dark" on <html>', () => {
    applyTheme({ theme: 'dark' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  it('sets data-theme="light" on <html>', () => {
    applyTheme({ theme: 'light' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('sets data-cvd="on" when cvd: true', () => {
    applyTheme({ theme: 'dark', cvd: true });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-cvd', 'on');
  });

  it('removes data-cvd when cvd: false', () => {
    applyTheme({ theme: 'dark', cvd: false });
    expect(document.documentElement.removeAttribute).toHaveBeenCalledWith('data-cvd');
  });

  it('persists choice to localStorage under "@starui/theme"', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(localStorage.getItem('@starui/theme')).toBe(JSON.stringify({ theme: 'light', cvd: true }));
  });

  it('getTheme reads back persisted value', () => {
    applyTheme({ theme: 'light', cvd: false });
    expect(getTheme()).toEqual({ theme: 'light', cvd: false });
  });

  it('getTheme returns dark default when nothing persisted', () => {
    localStorage.removeItem('@starui/theme');
    expect(getTheme()).toEqual({ theme: 'dark' });
  });
});
