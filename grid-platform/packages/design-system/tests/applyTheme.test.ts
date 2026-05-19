import { describe, it, expect, beforeEach, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@stargrid/types';
import { applyTheme, getTheme } from '../src/applyTheme';

const CVD_KEY = 'stargrid:cvd';

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

  it('persists theme under the canonical storage key as a bare string', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(localStorage.getItem(CVD_KEY)).toBe('on');
  });

  it('clears cvd key when cvd is false', () => {
    applyTheme({ theme: 'light', cvd: true });
    applyTheme({ theme: 'light', cvd: false });
    expect(localStorage.getItem(CVD_KEY)).toBeNull();
  });

  it('getTheme reads back theme + cvd from canonical keys', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(getTheme()).toEqual({ theme: 'light', cvd: true });
  });

  it('getTheme omits cvd when not persisted', () => {
    applyTheme({ theme: 'light', cvd: false });
    expect(getTheme()).toEqual({ theme: 'light' });
  });

  it('getTheme returns dark default when nothing persisted', () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem(CVD_KEY);
    expect(getTheme()).toEqual({ theme: 'dark' });
  });

  it('migrates from the legacy "@starui/theme" JSON blob on first read', () => {
    localStorage.setItem('@starui/theme', JSON.stringify({ theme: 'light', cvd: true }));
    expect(getTheme()).toEqual({ theme: 'light', cvd: true });
    applyTheme({ theme: 'light', cvd: true });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(localStorage.getItem(CVD_KEY)).toBe('on');
    expect(localStorage.getItem('@starui/theme')).toBeNull();
  });
});
