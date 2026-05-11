import type * as MonacoNS from 'monaco-editor';

export function getInsertionRange(position: MonacoNS.IPosition): MonacoNS.IRange {
  return {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };
}
