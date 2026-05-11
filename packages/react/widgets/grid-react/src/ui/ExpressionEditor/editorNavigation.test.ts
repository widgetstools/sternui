import { describe, expect, it } from 'vitest';
import {
  getNavigationPosition,
  getSuggestionNavigationAction,
} from './editorNavigation';

function model(lineMaxColumns: number[]) {
  return {
    getLineCount: () => lineMaxColumns.length,
    getLineMaxColumn: (lineNumber: number) => lineMaxColumns[lineNumber - 1],
  };
}

describe('ExpressionEditor keyboard navigation fallback', () => {
  it('moves horizontally within a line', () => {
    const m = model([20]);

    expect(getNavigationPosition('ArrowLeft', { lineNumber: 1, column: 8 }, m)).toEqual({
      lineNumber: 1,
      column: 7,
    });
    expect(getNavigationPosition('ArrowRight', { lineNumber: 1, column: 8 }, m)).toEqual({
      lineNumber: 1,
      column: 9,
    });
  });

  it('supports home and end keys', () => {
    const m = model([20]);

    expect(getNavigationPosition('Home', { lineNumber: 1, column: 8 }, m)).toEqual({
      lineNumber: 1,
      column: 1,
    });
    expect(getNavigationPosition('End', { lineNumber: 1, column: 8 }, m)).toEqual({
      lineNumber: 1,
      column: 20,
    });
  });

  it('moves across line boundaries', () => {
    const m = model([6, 10]);

    expect(getNavigationPosition('ArrowLeft', { lineNumber: 2, column: 1 }, m)).toEqual({
      lineNumber: 1,
      column: 6,
    });
    expect(getNavigationPosition('ArrowRight', { lineNumber: 1, column: 6 }, m)).toEqual({
      lineNumber: 2,
      column: 1,
    });
  });

  it('maps vertical arrows to suggestion traversal actions when suggestions are open', () => {
    expect(getSuggestionNavigationAction('ArrowDown')).toBe('selectNextSuggestion');
    expect(getSuggestionNavigationAction('ArrowUp')).toBe('selectPrevSuggestion');
    expect(getSuggestionNavigationAction('ArrowLeft')).toBeUndefined();
    expect(getSuggestionNavigationAction('ArrowRight')).toBeUndefined();
  });
});
