import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgGridTheme } from '@starui/design-system/adapters/ag-grid';
import { useAgGridTheme } from '../useAgGridTheme.js';

vi.mock('@starui/design-system/adapters/ag-grid', () => ({
  buildAgGridTheme: vi.fn(() => ({ __brand: 'ag-theme' })),
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  vi.clearAllMocks();
});

describe('useAgGridTheme — palette + mode', () => {
  it('builds ultra-density theme from document palette and mode', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-palette', 'teal');
    renderHook(() => useAgGridTheme('auto'));
    expect(buildAgGridTheme).toHaveBeenCalledWith({
      palette: 'teal',
      mode: 'dark',
      density: 'ultra',
    });
  });

  it('rebuilds when [data-palette] changes', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-palette', 'slate');
    const { result } = renderHook(() => useAgGridTheme('auto'));
    const first = result.current;

    await act(async () => {
      document.documentElement.setAttribute('data-palette', 'indigo');
      await Promise.resolve();
    });

    expect(buildAgGridTheme).toHaveBeenLastCalledWith({
      palette: 'indigo',
      mode: 'dark',
      density: 'ultra',
    });
    expect(result.current).not.toBe(first);
  });

  it('explicit light mode ignores document theme attribute', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-palette', 'amber');
    renderHook(() => useAgGridTheme('light'));
    expect(buildAgGridTheme).toHaveBeenCalledWith({
      palette: 'amber',
      mode: 'light',
      density: 'ultra',
    });
  });
});

describe('useAgGridTheme — context reactivity', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-palette', 'slate');
  });

  it('switches theme when [data-theme] flips on <html>', async () => {
    const { result } = renderHook(() => useAgGridTheme('auto'));
    const darkTheme = result.current;

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      await Promise.resolve();
    });

    expect(result.current).not.toBe(darkTheme);
    expect(buildAgGridTheme).toHaveBeenLastCalledWith({
      palette: 'slate',
      mode: 'light',
      density: 'ultra',
    });
  });
});
