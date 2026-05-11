import type * as MonacoNS from 'monaco-editor';

export function getInsertionRange(position: MonacoNS.IPosition): MonacoNS.IRange {
  return {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };
}

export type DeletionKey = 'Backspace' | 'Delete';

export interface TextDeletionEdit {
  range: MonacoNS.IRange;
  position: MonacoNS.IPosition;
}

type TextDeletionModel = Pick<MonacoNS.editor.ITextModel, 'getLineCount' | 'getLineMaxColumn'>;

export function getDeletionEdit(
  key: DeletionKey,
  selection: MonacoNS.IRange | null,
  position: MonacoNS.IPosition,
  model: TextDeletionModel,
): TextDeletionEdit | undefined {
  if (selection && !isCollapsedRange(selection)) {
    return {
      range: selection,
      position: {
        lineNumber: selection.startLineNumber,
        column: selection.startColumn,
      },
    };
  }

  if (key === 'Backspace') {
    if (position.column > 1) {
      return {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column - 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        position: {
          lineNumber: position.lineNumber,
          column: position.column - 1,
        },
      };
    }

    if (position.lineNumber <= 1) return undefined;
    const previousLine = position.lineNumber - 1;
    const previousLineEnd = model.getLineMaxColumn(previousLine);
    return {
      range: {
        startLineNumber: previousLine,
        startColumn: previousLineEnd,
        endLineNumber: position.lineNumber,
        endColumn: 1,
      },
      position: {
        lineNumber: previousLine,
        column: previousLineEnd,
      },
    };
  }

  const lineEnd = model.getLineMaxColumn(position.lineNumber);
  if (position.column < lineEnd) {
    return {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column + 1,
      },
      position,
    };
  }

  if (position.lineNumber >= model.getLineCount()) return undefined;
  return {
    range: {
      startLineNumber: position.lineNumber,
      startColumn: lineEnd,
      endLineNumber: position.lineNumber + 1,
      endColumn: 1,
    },
    position,
  };
}

export function shouldUseColumnSuggestionFallback(
  hasBracketPrefix: boolean,
): boolean {
  return hasBracketPrefix;
}

function isCollapsedRange(range: MonacoNS.IRange): boolean {
  return range.startLineNumber === range.endLineNumber
    && range.startColumn === range.endColumn;
}
