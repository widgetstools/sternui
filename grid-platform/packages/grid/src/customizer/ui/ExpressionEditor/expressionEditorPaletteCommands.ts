import type * as monaco from 'monaco-editor';

export interface ExpressionPaletteCallbacks {
  onOpenColumns: () => void;
  onOpenFunctions: () => void;
  onOpenHelp: () => void;
}

/**
 * Editor-scoped palette shortcuts only. All other keys stay on Monaco defaults.
 */
export function registerExpressionPaletteCommands(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  callbacks: ExpressionPaletteCallbacks,
): void {
  void editor.addCommand(
    monacoApi.KeyMod.CtrlCmd | monacoApi.KeyMod.Shift | monacoApi.KeyCode.KeyC,
    callbacks.onOpenColumns,
  );
  void editor.addCommand(
    monacoApi.KeyMod.CtrlCmd | monacoApi.KeyMod.Shift | monacoApi.KeyCode.KeyF,
    callbacks.onOpenFunctions,
  );
  void editor.addCommand(monacoApi.KeyCode.F1, callbacks.onOpenHelp);
}
