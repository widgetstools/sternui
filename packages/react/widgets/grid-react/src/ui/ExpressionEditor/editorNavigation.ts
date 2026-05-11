import type * as MonacoNS from 'monaco-editor';

export type NavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';
export type SuggestionNavigationAction = 'selectNextSuggestion' | 'selectPrevSuggestion';

export function getSuggestionNavigationAction(key: NavigationKey): SuggestionNavigationAction | undefined {
  if (key === 'ArrowDown') return 'selectNextSuggestion';
  if (key === 'ArrowUp') return 'selectPrevSuggestion';
  return undefined;
}

export function getNavigationPosition(
  key: NavigationKey,
  position: MonacoNS.IPosition,
  model: Pick<MonacoNS.editor.ITextModel, 'getLineCount' | 'getLineMaxColumn'>,
): MonacoNS.IPosition {
  const lineCount = model.getLineCount();

  if (key === 'Home') {
    return { lineNumber: position.lineNumber, column: 1 };
  }

  if (key === 'End') {
    return {
      lineNumber: position.lineNumber,
      column: model.getLineMaxColumn(position.lineNumber),
    };
  }

  if (key === 'ArrowLeft') {
    if (position.column > 1) {
      return { lineNumber: position.lineNumber, column: position.column - 1 };
    }
    if (position.lineNumber > 1) {
      const previousLine = position.lineNumber - 1;
      return { lineNumber: previousLine, column: model.getLineMaxColumn(previousLine) };
    }
    return position;
  }

  if (key === 'ArrowRight') {
    const maxColumn = model.getLineMaxColumn(position.lineNumber);
    if (position.column < maxColumn) {
      return { lineNumber: position.lineNumber, column: position.column + 1 };
    }
    if (position.lineNumber < lineCount) {
      return { lineNumber: position.lineNumber + 1, column: 1 };
    }
    return position;
  }

  if (key === 'ArrowUp') {
    if (position.lineNumber <= 1) return position;
    const previousLine = position.lineNumber - 1;
    return {
      lineNumber: previousLine,
      column: Math.min(position.column, model.getLineMaxColumn(previousLine)),
    };
  }

  if (position.lineNumber >= lineCount) return position;
  const nextLine = position.lineNumber + 1;
  return {
    lineNumber: nextLine,
    column: Math.min(position.column, model.getLineMaxColumn(nextLine)),
  };
}
