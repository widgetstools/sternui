import { describe, expect, it } from 'vitest';
import { getInsertionRange } from './editorTextInput';

describe('ExpressionEditor text input fallback', () => {
  it('inserts text at Monaco model position, not hidden textarea selection', () => {
    expect(getInsertionRange({ lineNumber: 1, column: 19 })).toEqual({
      startLineNumber: 1,
      startColumn: 19,
      endLineNumber: 1,
      endColumn: 19,
    });
  });
});
