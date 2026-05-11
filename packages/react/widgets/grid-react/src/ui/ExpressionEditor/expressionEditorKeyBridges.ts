import type * as monaco from 'monaco-editor';
import { hasVisibleSuggestion } from './editorDom';

/**
 * Re-bind a few chords through `editor.addCommand` so they reach Monaco even when
 * a host shell (e.g. popped-out settings) would otherwise hand Tab / Ctrl+Space to
 * native focus traversal or browser defaults. Core typing stays on Monaco; we do
 * not replace Backspace, Delete, or Shift+arrow selection.
 */
export function registerExpressionEditorKeyBridges(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  doc: Document,
): void {
  void editor.addCommand(monacoApi.KeyCode.Tab, () => {
    editor.trigger(
      'keyboard',
      hasVisibleSuggestion(doc) ? 'acceptSelectedSuggestion' : 'tab',
      {},
    );
  });
  void editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyCode.Tab, () => {
    editor.trigger('keyboard', 'outdent', {});
  });
  void editor.addCommand(monacoApi.KeyMod.WinCtrl | monacoApi.KeyCode.Space, () => {
    editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
  });
}
