import { describe, expect, it } from 'vitest';
import {
  getDeletionEdit,
  getInsertionRange,
  shouldUseColumnSuggestionFallback,
} from './editorTextInput';

function model(lineMaxColumns: number[]) {
  return {
    getLineCount: () => lineMaxColumns.length,
    getLineMaxColumn: (lineNumber: number) => lineMaxColumns[lineNumber - 1],
  };
}

describe('ExpressionEditor text input fallback', () => {
  it('inserts text at Monaco model position, not hidden textarea selection', () => {
    expect(getInsertionRange({ lineNumber: 1, column: 19 })).toEqual({
      startLineNumber: 1,
      startColumn: 19,
      endLineNumber: 1,
      endColumn: 19,
    });
  });

  it('deletes a selected range before deleting adjacent characters', () => {
    expect(getDeletionEdit(
      'Backspace',
      { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 5 },
      { lineNumber: 1, column: 8 },
      model([10]),
    )).toEqual({
      range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 5 },
      position: { lineNumber: 1, column: 2 },
    });
  });

  it('deletes before and after the caret for Backspace and Delete', () => {
    expect(getDeletionEdit('Backspace', null, { lineNumber: 1, column: 4 }, model([8]))).toEqual({
      range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 4 },
      position: { lineNumber: 1, column: 3 },
    });

    expect(getDeletionEdit('Delete', null, { lineNumber: 1, column: 4 }, model([8]))).toEqual({
      range: { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 5 },
      position: { lineNumber: 1, column: 4 },
    });
  });

  it('joins lines when deletion crosses a line boundary', () => {
    expect(getDeletionEdit('Backspace', null, { lineNumber: 2, column: 1 }, model([4, 5]))).toEqual({
      range: { startLineNumber: 1, startColumn: 4, endLineNumber: 2, endColumn: 1 },
      position: { lineNumber: 1, column: 4 },
    });

    expect(getDeletionEdit('Delete', null, { lineNumber: 1, column: 4 }, model([4, 5]))).toEqual({
      range: { startLineNumber: 1, startColumn: 4, endLineNumber: 2, endColumn: 1 },
      position: { lineNumber: 1, column: 4 },
    });
  });

  it('only uses the column fallback when a bracket prefix exists', () => {
    expect(shouldUseColumnSuggestionFallback(false)).toBe(false);
    expect(shouldUseColumnSuggestionFallback(true)).toBe(true);
  });
});
