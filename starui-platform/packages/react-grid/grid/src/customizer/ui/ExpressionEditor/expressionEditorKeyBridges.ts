import type * as monaco from 'monaco-editor';
import { hasVisibleSuggestion } from './editorDom';
import { deleteFromEditor } from './expressionEditorDeletion';

export interface ExpressionEditorKeyBridgeOptions {
  readOnly: boolean;
}

/**
 * Re-bind chords through `editor.addCommand` so they reach Monaco when a host
 * shell (popped-out settings, transformed containing blocks, etc.) would
 * otherwise swallow keys before the hidden textarea sees them.
 *
 * Includes: Tab/suggest, arrows + shift-selection, suggestion list navigation,
 * and model-level Backspace/Delete (same behavior as stock Monaco when native
 * input works).
 */
export function registerExpressionEditorKeyBridges(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  doc: Document,
  options: ExpressionEditorKeyBridgeOptions,
): void {
  const { readOnly } = options;
  const trig = (commandId: string) => {
    editor.trigger('gcExpression-key-bridge', commandId, {});
  };

  const suggestOpen = () => hasVisibleSuggestion(doc);

  void editor.addCommand(monacoApi.KeyCode.Tab, () => {
    trig(suggestOpen() ? 'acceptSelectedSuggestion' : 'tab');
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.Tab, () => {
    trig('outdent');
  });
  void editor.addCommand(monacoApi.KeyMod.WinCtrl | monacoApi.KeyCode.Space, () => {
    trig('editor.action.triggerSuggest');
  });

  void editor.addCommand(monacoApi.KeyCode.DownArrow, () => {
    trig(suggestOpen() ? 'selectNextSuggestion' : 'cursorDown');
  });
  void editor.addCommand(monacoApi.KeyCode.UpArrow, () => {
    trig(suggestOpen() ? 'selectPrevSuggestion' : 'cursorUp');
  });
  void editor.addCommand(monacoApi.KeyCode.LeftArrow, () => {
    trig('cursorLeft');
  });
  void editor.addCommand(monacoApi.KeyCode.RightArrow, () => {
    trig('cursorRight');
  });
  void editor.addCommand(monacoApi.KeyCode.Home, () => {
    trig(suggestOpen() ? 'selectFirstSuggestion' : 'cursorHome');
  });
  void editor.addCommand(monacoApi.KeyCode.End, () => {
    trig(suggestOpen() ? 'selectLastSuggestion' : 'cursorEnd');
  });

  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.DownArrow, () => {
    trig(suggestOpen() ? 'selectNextSuggestion' : 'cursorDownSelect');
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.UpArrow, () => {
    trig(suggestOpen() ? 'selectPrevSuggestion' : 'cursorUpSelect');
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.LeftArrow, () => {
    trig('cursorLeftSelect');
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.RightArrow, () => {
    trig('cursorRightSelect');
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.Home, () => {
    trig('cursorHomeSelect');
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.End, () => {
    trig('cursorEndSelect');
  });

  void editor.addCommand(monacoApi.KeyCode.Backspace, () => {
    if (readOnly) return;
    deleteFromEditor(monacoApi, editor, 'backward');
  });
  void editor.addCommand(monacoApi.KeyCode.Delete, () => {
    if (readOnly) return;
    deleteFromEditor(monacoApi, editor, 'forward');
  });

  const hostWin = editor.getDomNode()?.ownerDocument?.defaultView ?? window;
  const auxiliaryPopout = hostWin.opener != null && hostWin.opener !== hostWin;
  if (auxiliaryPopout) {
    void editor.addCommand(monacoApi.KeyCode.Escape, () => {
      if (suggestOpen()) {
        trig('hideSuggestWidget');
      }
    });
  }
}
