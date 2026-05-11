import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import './monaco-overflow.css';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';
import { registerLanguage, LANGUAGE_ID } from './language';
import { registerCompletions, defaultFunctionsProvider } from './completions';
import { attachDiagnostics } from './diagnostics';
import { Palette, type PaletteItem } from './Palette';
import { HelpOverlay } from './HelpOverlay';
import {
  ensurePlaceholderStyle,
  getElementDomContext,
  getExpressionTheme,
  getMonacoOverflowHost,
  hasVisibleSuggestion,
} from './editorDom';
import { createExpressionEditorOptions } from './editorOptions';
import {
  getNavigationPosition,
  getSuggestionNavigationAction,
  type NavigationKey,
} from './editorNavigation';
import {
  getDeletionEdit,
  getInsertionRange,
  shouldUseColumnSuggestionFallback,
  type DeletionKey,
} from './editorTextInput';

/**
 * Monaco-hosting expression editor. Code-split from the public wrapper so
 * Monaco's payload only downloads when the user opens an editor.
 *
 * Uses `monaco-editor` directly (not @monaco-editor/react) — Vite bundles
 * it cleanly as a dynamic chunk. No CDN, no AMD loader, no workers yet (we
 * run with the main thread for tokenization since our DSL is tiny).
 */

// ─── Disable Monaco workers ──────────────────────────────────────────────
// We don't use TypeScript / JSON / CSS / HTML language services, so there's
// no need to ship web workers. Point Monaco at a stub getWorker that throws
// — it will fall back to main-thread execution for any feature that *does*
// need a worker (our DSL needs none). Guarded so this is set once globally.
interface MonacoWorkerWindow extends Window { MonacoEnvironment?: unknown; monaco?: typeof monaco }
const w = globalThis as unknown as MonacoWorkerWindow;
if (!w.MonacoEnvironment) {
  w.MonacoEnvironment = {
    getWorker() {
      // Return a no-op worker to satisfy Monaco's internal plumbing without
      // spinning up a real Worker (which Vite would need extra config for).
      return {
        postMessage: () => {},
        terminate: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    },
  };
}
// Expose for in-browser inspection / testing.
w.monaco = monaco;

export default function ExpressionEditorInner(
  props: ExpressionEditorProps & { handleRef?: React.Ref<ExpressionEditorHandle> },
) {
  const {
    value,
    onCommit,
    onChange,
    placeholder,
    multiline,
    lines = 4,
    fontSize = 11,
    columnsProvider,
    functionsProvider,
    validate = true,
    warnDeprecated = true,
    readOnly,
    'data-testid': dataTestId,
    handleRef,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const textRef = useRef(value);
  const providersRef = useRef({ columnsProvider, functionsProvider });
  providersRef.current = { columnsProvider, functionsProvider };

  // Palette visibility — exactly one is open at a time. `null` = nothing open.
  // Hotkeys set this; the palettes themselves clear it via onClose / onPick.
  const [activePalette, setActivePalette] = useState<'columns' | 'functions' | 'help' | null>(null);

  // Ensure language + theme are registered once globally.
  useEffect(() => {
    registerLanguage(monaco);
  }, []);

  // Mount the editor ONCE per component instance.
  useEffect(() => {
    if (!hostRef.current) return;
    const dom = getElementDomContext(hostRef.current);
    if (!dom) return;
    registerLanguage(monaco);

    const editor = monaco.editor.create(hostRef.current, createExpressionEditorOptions({
      value,
      fontSize,
      multiline,
      readOnly,
      document: dom.document,
    }));
    editorRef.current = editor;

    // Placeholder (Monaco doesn't have native placeholder support — we draw
    // it via a decoration on the empty line).
    const placeholderContrib = multiline ? null : installPlaceholder(editor, placeholder, dom.document);

    const disposers: Array<() => void> = [];
    disposers.push(registerCompletions(
      monaco,
      () => providersRef.current.columnsProvider?.() ?? [],
      () => providersRef.current.functionsProvider?.() ?? defaultFunctionsProvider(),
    ).dispose);

    // ── Palette hotkeys ─────────────────────────────────────────────
    // Ctrl/Cmd+Shift+C → column palette
    // Ctrl/Cmd+Shift+F → function palette
    // F1               → help overlay
    //
    // Monaco's `addCommand` binds at the editor level (only fires when this
    // editor has focus), which is exactly what we want — don't steal these
    // chords globally. The `KeyMod.CtrlCmd` flag maps to Ctrl on
    // Windows/Linux and ⌘ on macOS, matching platform conventions.
    const acceptSuggestionWithFallback = () => {
      if (readOnly) return;
      if (hasColumnCompletionPrefix(editor)) {
        editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
        acceptColumnSuggestionFallback(monaco, editor, dom.document, providersRef.current.columnsProvider?.() ?? []);
        return;
      }
      if (hasVisibleSuggestion(dom.document) && hasTypedCompletionPrefix(editor)) {
        editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
      }
    };
    const applyDeletion = (key: DeletionKey) => {
      if (readOnly) return false;
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return false;
      const edit = getDeletionEdit(key, editor.getSelection(), position, model);
      if (!edit) return false;
      editor.executeEdits('gcExpression-delete-input', [{
        range: edit.range,
        text: '',
        forceMoveMarkers: true,
      }]);
      editor.setPosition(edit.position);
      editor.revealPositionInCenterIfOutsideViewport(edit.position);
      return true;
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      const isTab = event.key === 'Tab';
      const isSpace = event.key === ' ';
      const isDeletionKey = event.key === 'Backspace' || event.key === 'Delete';
      const isTriggerSuggest = event.key === 'Escape' && event.altKey;
      const isNavigationKey = isExpressionNavigationKey(event.key);
      if (!isTab && !isSpace && !isDeletionKey && !isTriggerSuggest && !isNavigationKey) return;
      const active = dom.document.activeElement;
      const editorHasFocus =
        editor.hasTextFocus()
        || active?.classList.contains('inputarea') === true;
      if (!editorHasFocus) return;
      event.preventDefault();
      event.stopPropagation();
      if (isTab) {
        acceptSuggestionWithFallback();
        return;
      }
      if (isTriggerSuggest) {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
        return;
      }
      if (isSpace && !hasVisibleSuggestion(dom.document)) {
        if (readOnly) return;
        const position = editor.getPosition();
        if (!position) return;
        event.preventDefault();
        event.stopPropagation();
        editor.executeEdits('gcExpression-space-input', [{
          range: getInsertionRange(position),
          text: ' ',
          forceMoveMarkers: true,
        }]);
        editor.setPosition({ lineNumber: position.lineNumber, column: position.column + 1 });
        return;
      }
      if (isDeletionKey) {
        applyDeletion(event.key as DeletionKey);
        return;
      }
      const suggestionAction = event.shiftKey
        ? undefined
        : getSuggestionNavigationAction(event.key as NavigationKey);
      if (suggestionAction && hasVisibleSuggestion(dom.document)) {
        editor.trigger('keyboard', suggestionAction, {});
        return;
      }
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;
      const nextPosition = getNavigationPosition(event.key as NavigationKey, position, model);
      if (event.shiftKey) {
        const selection = editor.getSelection();
        const anchor = selection && !selection.isEmpty()
          ? {
              lineNumber: selection.selectionStartLineNumber,
              column: selection.selectionStartColumn,
            }
          : position;
        editor.setSelection(new monaco.Selection(
          anchor.lineNumber,
          anchor.column,
          nextPosition.lineNumber,
          nextPosition.column,
        ));
      } else {
        editor.setPosition(nextPosition);
      }
      editor.revealPositionInCenterIfOutsideViewport(nextPosition);
    };
    dom.document.addEventListener('keydown', onDocumentKeyDown, true);
    dom.window.addEventListener('keydown', onDocumentKeyDown, true);
    disposers.push(() => {
      dom.document.removeEventListener('keydown', onDocumentKeyDown, true);
      dom.window.removeEventListener('keydown', onDocumentKeyDown, true);
    });
    const tabCmd = editor.addCommand(monaco.KeyCode.Tab, acceptSuggestionWithFallback);
    const backspaceCmd = editor.addCommand(monaco.KeyCode.Backspace, () => applyDeletion('Backspace'));
    const deleteCmd = editor.addCommand(monaco.KeyCode.Delete, () => applyDeletion('Delete'));
    const colCmd = editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC,
      () => setActivePalette('columns'),
    );
    const fnCmd = editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => setActivePalette('functions'),
    );
    const helpCmd = editor.addCommand(monaco.KeyCode.F1, () => setActivePalette('help'));
    // `addCommand` returns the command id; nothing to dispose explicitly —
    // commands are removed when the editor is disposed.
    void tabCmd; void backspaceCmd; void deleteCmd; void colCmd; void fnCmd; void helpCmd;

    const model = editor.getModel();
    if (model && validate) {
      disposers.push(attachDiagnostics(monaco, model, { warnDeprecated }));
    }

    const commit = () => {
      const current = editor.getValue();
      if (current !== textRef.current) {
        textRef.current = current;
        onCommit(current);
      }
    };

    // Commit on blur.
    disposers.push(editor.onDidBlurEditorText(commit).dispose);

    // Enter commits (single-line); Ctrl/Cmd+Enter (multiline).
    disposers.push(editor.onKeyDown((e) => {
      if (e.keyCode !== monaco.KeyCode.Enter) return;
      if (hasVisibleSuggestion(dom.document)) {
        e.preventDefault();
        editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
        return;
      }
      if (multiline && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      commit();
    }).dispose);

    if (onChange) {
      disposers.push(editor.onDidChangeModelContent(() => {
        onChange(editor.getValue());
      }).dispose);
    }

    // Single-line: suppress newline insertion from any source.
    if (!multiline) {
      disposers.push(editor.onDidChangeModelContent((e) => {
        if (e.changes.some((c) => c.text.includes('\n'))) {
          const v = editor.getValue().replace(/\n/g, ' ');
          editor.setValue(v);
        }
      }).dispose);
    }

    return () => {
      disposers.forEach((d) => { try { d(); } catch { /* */ } });
      placeholderContrib?.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync value changes from parent after mount.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (value !== ed.getValue()) {
      ed.setValue(value);
      textRef.current = value;
    }
  }, [value]);

  // Theme follows <html data-theme="dark">.
  useEffect(() => {
    const dom = getElementDomContext(hostRef.current);
    if (!dom) return;
    const apply = () => {
      monaco.editor.setTheme(getExpressionTheme(dom.document));
      getMonacoOverflowHost(dom.document);
    };
    apply();
    const MutationObserverCtor =
      (dom.window as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver
      ?? MutationObserver;
    const mo = new MutationObserverCtor(apply);
    mo.observe(dom.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  useImperativeHandle(handleRef, () => ({
    focus: () => editorRef.current?.focus(),
    getValue: () => editorRef.current?.getValue() ?? textRef.current,
  }), []);

  const heightPx = multiline ? Math.max(lines * (fontSize + 6), 60) : Math.max(fontSize + 14, 24);

  // Insert text at the editor's current cursor position and refocus. Used
  // by both palettes on pick. Relies on Monaco's undo stack so the user can
  // Ctrl+Z an unwanted insertion.
  const insertAtCursor = (text: string) => {
    const ed = editorRef.current;
    if (!ed || readOnly) return;
    const pos = ed.getPosition();
    if (!pos) return;
    ed.executeEdits('gcExpression-palette', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text,
      forceMoveMarkers: true,
    }]);
    ed.focus();
  };

  // Build column palette items lazily — only when the palette is open.
  const columnItems: PaletteItem[] = activePalette === 'columns'
    ? (providersRef.current.columnsProvider?.() ?? []).map((c) => ({
        id: c.colId,
        label: `[${c.colId}]`,
        detail: c.headerName + (c.dataType ? ` · ${c.dataType}` : ''),
        description: `Reference the "${c.headerName}" column of the current row.`,
        keywords: [c.colId, c.headerName],
      }))
    : [];

  // Build function palette items — grouped by category.
  const functionItems: PaletteItem[] = activePalette === 'functions'
    ? (providersRef.current.functionsProvider?.() ?? defaultFunctionsProvider())
        .slice()
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((f) => ({
          id: f.name,
          label: f.name,
          detail: f.signature,
          description: f.description,
          group: f.category,
          keywords: [f.name, f.category],
        }))
    : [];

  return (
    <>
      <div
        ref={hostRef}
        data-testid={dataTestId}
        style={{
          height: heightPx,
          border: '1px solid var(--ds-border-primary)',
          borderRadius: 4,
          background: 'var(--ds-surface-ground)',
          overflow: 'hidden',
        }}
      />
      {activePalette === 'columns' && (
        <Palette
          title="Columns"
          subtitle="Ctrl+Shift+C"
          placeholder="Filter columns…"
          items={columnItems}
          onPick={(it) => {
            insertAtCursor(it.label); // already wrapped in [..]
            setActivePalette(null);
          }}
          onClose={() => setActivePalette(null)}
        />
      )}
      {activePalette === 'functions' && (
        <Palette
          title="Functions"
          subtitle="Ctrl+Shift+F · 45+ built-ins grouped by category"
          placeholder="Filter functions…"
          items={functionItems}
          onPick={(it) => {
            insertAtCursor(`${it.label}()`);
            // Put cursor between the parens so the user can type args immediately.
            const ed = editorRef.current;
            if (ed) {
              const pos = ed.getPosition();
              if (pos) ed.setPosition({ lineNumber: pos.lineNumber, column: pos.column - 1 });
            }
            setActivePalette(null);
          }}
          onClose={() => setActivePalette(null)}
        />
      )}
      {activePalette === 'help' && (
        <HelpOverlay onClose={() => setActivePalette(null)} />
      )}
    </>
  );
}

/**
 * Install a placeholder decoration that shows `text` when the model is empty.
 * Removed on first input; re-shown on clear. Returns a disposer.
 */
function installPlaceholder(editor: monaco.editor.IStandaloneCodeEditor, text: string | undefined, doc: Document) {
  if (!text) return { dispose: () => {} };
  let decorations: string[] = [];
  const render = () => {
    const empty = editor.getValue().length === 0;
    decorations = editor.deltaDecorations(decorations, empty ? [{
      range: new monaco.Range(1, 1, 1, 1),
      options: {
        isWholeLine: false,
        after: {
          content: text,
          inlineClassName: 'ds-expr-placeholder',
        },
      },
    }] : []);
  };
  render();
  const sub = editor.onDidChangeModelContent(render);
  // Minimal style injection for the placeholder.
  ensurePlaceholderStyle(doc);
  return { dispose: () => { sub.dispose(); editor.deltaDecorations(decorations, []); } };
}

function acceptColumnSuggestionFallback(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  doc: Document,
  columns: Array<{ colId: string; headerName: string }>,
): boolean {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return false;

  const line = model.getLineContent(pos.lineNumber);
  const beforeCursor = line.slice(0, pos.column - 1);
  const bracketMatch = beforeCursor.match(/\[([^\]\s]*)$/);

  const suggestionVisible = hasVisibleSuggestion(doc);
  const focusedText = suggestionVisible
    ? (
        doc.querySelector('.suggest-widget .monaco-list-row.focused')?.textContent
        ?? doc.querySelector('.suggest-widget .monaco-list-row')?.textContent
        ?? ''
      )
    : '';
  const focusedColumnId = focusedText.match(/\[([^\]]+)\]/)?.[1];
  const prefix = bracketMatch?.[1].toLowerCase() ?? '';
  if (!shouldUseColumnSuggestionFallback(bracketMatch !== undefined)) {
    return false;
  }
  const column =
    (focusedColumnId ? columns.find((c) => c.colId === focusedColumnId) : undefined)
    ?? columns.find((c) => c.colId.toLowerCase().startsWith(prefix))
    ?? columns.find((c) => c.headerName.toLowerCase().startsWith(prefix));

  if (!column) return false;

  const startColumn = bracketMatch ? pos.column - bracketMatch[0].length : pos.column;
  editor.executeEdits('gcExpression-tab-completion', [{
    range: new monacoApi.Range(pos.lineNumber, startColumn, pos.lineNumber, pos.column),
    text: `[${column.colId}]`,
    forceMoveMarkers: true,
  }]);
  return true;
}

function hasColumnCompletionPrefix(editor: monaco.editor.IStandaloneCodeEditor): boolean {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return false;

  const line = model.getLineContent(pos.lineNumber);
  const beforeCursor = line.slice(0, pos.column - 1);
  return /\[([^\]\s]*)$/.test(beforeCursor);
}

function hasTypedCompletionPrefix(editor: monaco.editor.IStandaloneCodeEditor): boolean {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return false;
  return model.getWordUntilPosition(pos).word.length > 0;
}

function isExpressionNavigationKey(key: string): key is NavigationKey {
  return key === 'ArrowLeft'
    || key === 'ArrowRight'
    || key === 'ArrowUp'
    || key === 'ArrowDown'
    || key === 'Home'
    || key === 'End';
}
