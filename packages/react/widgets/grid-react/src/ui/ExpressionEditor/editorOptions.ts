import type * as MonacoNS from 'monaco-editor';
import { LANGUAGE_ID } from './language';
import {
  getExpressionTheme,
  getMonacoOverflowHost,
} from './editorDom';

export interface ExpressionEditorOptionsInput {
  value: string;
  multiline: boolean | undefined;
  fontSize: number;
  readOnly: boolean | undefined;
  document: Document;
}

export function createExpressionEditorOptions({
  value,
  multiline,
  fontSize,
  readOnly,
  document,
}: ExpressionEditorOptionsInput): MonacoNS.editor.IStandaloneEditorConstructionOptions {
  return {
    value,
    language: LANGUAGE_ID,
    theme: getExpressionTheme(document),
    minimap: { enabled: false },
    lineNumbers: multiline ? 'on' : 'off',
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: multiline ? 8 : 2,
    lineNumbersMinChars: multiline ? 3 : 0,
    scrollBeyondLastLine: false,
    scrollbar: { vertical: multiline ? 'auto' : 'hidden', horizontal: 'hidden', handleMouseWheel: true },
    overviewRulerLanes: 0,
    renderLineHighlight: 'none',
    renderWhitespace: 'none',
    guides: {
      indentation: false,
      highlightActiveIndentation: false,
      bracketPairs: false,
      bracketPairsHorizontal: false,
    },
    fontSize,
    fontFamily: "'JetBrains Mono', Menlo, monospace",
    wordWrap: multiline ? 'on' : 'off',
    padding: { top: 4, bottom: 4 },
    readOnly,
    contextmenu: false,
    automaticLayout: true,
    fixedOverflowWidgets: true,
    overflowWidgetsDomNode: getMonacoOverflowHost(document),
    suggest: { showStatusBar: false, preview: false, insertMode: 'replace' },
    quickSuggestions: { other: true, comments: false, strings: false },
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    tabFocusMode: false,
    cursorBlinking: 'blink',
    cursorStyle: 'line',
    // Force the legacy hidden-textarea (`.inputarea`) input path. Monaco
    // >= 0.50 enables the new EditContext-API input by default; in our
    // settings sheet, that path has proven unreliable for keystrokes.
    editContext: false,
  };
}
