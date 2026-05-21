/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readDocumentThemeMode,
  readStockfluxPalette,
  readHostAppearance,
} from '../src/readHostAppearance';

describe('readHostAppearance', () => {
  const html = document.documentElement;

  beforeEach(() => {
    html.removeAttribute('data-theme');
    html.removeAttribute('data-palette');
  });

  afterEach(() => {
    html.removeAttribute('data-theme');
    html.removeAttribute('data-palette');
  });

  it('defaults to dark + slate', () => {
    expect(readHostAppearance()).toEqual({ theme: 'dark', palette: 'slate' });
  });

  it('reads light mode from data-theme', () => {
    html.dataset.theme = 'light';
    expect(readDocumentThemeMode()).toBe('light');
  });

  it('reads palette from data-palette', () => {
    html.setAttribute('data-palette', 'indigo');
    expect(readStockfluxPalette()).toBe('indigo');
  });

  it('ignores invalid data-palette', () => {
    html.setAttribute('data-palette', 'neon');
    expect(readStockfluxPalette()).toBe('slate');
  });
});
