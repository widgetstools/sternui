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
    // Force the legacy hidden-textarea (`.inputarea`) input path.
    //
    // Monaco >= 0.50 defaults to the new EditContext API for input.
    // Inside our popped settings sheet — and any host shell using
    // transform / overflow:hidden / position:fixed wrappers — that
    // path drops keystrokes ~10–20% of the time. The legacy textarea
    // path routes through standard keydown/keypress/input events that
    // our editor.addCommand key bridges already hook
    // (see expressionEditorKeyBridges.ts), so it's reliable.
    //
    // TIME-BOMB: this is a WORKAROUND, not a root-cause fix. Monaco
    // will eventually deprecate the legacy input path. When this
    // option stops being honored, the keystroke-drop bug must be
    // solved at the actual root cause — most likely host-shell
    // key-event swallowing in popped windows and transform-using
    // containers — rather than re-discovered as a mysterious
    // flakiness regression after a Monaco upgrade.
    //
    // See docs/UX_NUANCES.md §N31.6 for the full context and the
    // 7-symptom rewrite checklist that verifies parity. The Monaco
    // key-routing chain is the clearest "layered workaround" example
    // in the catalogue: N31.4 (key bridges) + N31.5 (Escape gating) +
    // N31.6 (editContext:false) are three workarounds sitting on top
    // of one underlying issue.
    editContext: false,
  };
}
