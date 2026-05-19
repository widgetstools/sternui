import type * as monaco from 'monaco-editor';

/**
 * Popout-safe deletion: when the hidden textarea path drops keys, apply the same
 * edit Monaco would have made via `deleteLeft` / `deleteRight`.
 */
export function deleteFromEditor(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  direction: 'backward' | 'forward',
): void {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return;

  const selection = editor.getSelection();
  const range = selection && !selection.isEmpty()
    ? selection
    : getDeletionRange(monacoApi, direction, position, model);
  if (!range) return;

  const nextPosition = {
    lineNumber: range.startLineNumber,
    column: range.startColumn,
  };
  editor.executeEdits('gcExpression-deletion-bridge', [{
    range,
    text: '',
    forceMoveMarkers: true,
  }]);
  editor.setPosition(nextPosition);
  editor.revealPositionInCenterIfOutsideViewport(nextPosition);
}

function getDeletionRange(
  monacoApi: typeof monaco,
  direction: 'backward' | 'forward',
  position: monaco.IPosition,
  model: monaco.editor.ITextModel,
): monaco.Range | null {
  if (direction === 'backward') {
    if (position.column > 1) {
      return new monacoApi.Range(
        position.lineNumber,
        position.column - 1,
        position.lineNumber,
        position.column,
      );
    }
    if (position.lineNumber <= 1) return null;
    const previousLine = position.lineNumber - 1;
    return new monacoApi.Range(
      previousLine,
      model.getLineMaxColumn(previousLine),
      position.lineNumber,
      1,
    );
  }

  const lineEnd = model.getLineMaxColumn(position.lineNumber);
  if (position.column < lineEnd) {
    return new monacoApi.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column + 1,
    );
  }
  if (position.lineNumber >= model.getLineCount()) return null;
  return new monacoApi.Range(
    position.lineNumber,
    lineEnd,
    position.lineNumber + 1,
    1,
  );
}
