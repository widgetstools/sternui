import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';
import { registerLanguage, LANGUAGE_ID } from './language';
import { registerCompletions, defaultFunctionsProvider } from './completions';
import { attachDiagnostics } from './diagnostics';
import { Palette, type PaletteItem } from './Palette';
import { HelpOverlay } from './HelpOverlay';

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

// ─── Body-mounted overflow-widgets container ─────────────────────────────
// Monaco's suggestion / hover / parameter-hints widgets render inside the
// editor's DOM tree by default, so they get clipped by the settings sheet's
// `overflow: hidden` AND — the real bug — get captured by the sheet's
// `transform: translate(...)` centering transform, which creates a new
// containing block for `position: fixed`. Under that ancestor, Monaco's
// supposed-to-be-viewport-fixed suggestion widget drifts hundreds of
// pixels below the cursor.
//
// Setting `fixedOverflowWidgets: true` alone isn't enough — Monaco still
// attaches the container inside the editor unless we hand it an explicit
// DOM node. Mount one lazily on document.body so the widget escapes every
// transformed / clipped ancestor and renders in viewport coordinates.
let _monacoOverflowHost: HTMLDivElement | null = null;
function getMonacoOverflowHost(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  if (_monacoOverflowHost && _monacoOverflowHost.isConnected) return _monacoOverflowHost;
  const host = document.createElement('div');
  host.className = 'monaco-editor monaco-editor-overflow-widgets-host';
  host.setAttribute('data-gc-monaco-overflow', '');
  // Keep it out of the way until Monaco fills it with positioned children.
  host.style.position = 'absolute';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  // Use a high stacking context so the widget always paints above the sheet.
  host.style.zIndex = '2147483646';
  document.body.appendChild(host);
  _monacoOverflowHost = host;
  return host;
}

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
    registerLanguage(monaco);

    const editor = monaco.editor.create(hostRef.current, {
      value,
      language: LANGUAGE_ID,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'gcExpressionDark' : 'gcExpressionLight',
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
      fontSize,
      fontFamily: "'JetBrains Mono', Menlo, monospace",
      wordWrap: multiline ? 'on' : 'off',
      padding: { top: 4, bottom: 4 },
      readOnly,
      contextmenu: false,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      // Escape the settings-sheet's transformed / clipped containers by
      // rendering overflow widgets (suggestions, hovers, parameter hints)
      // into a body-level host — see `getMonacoOverflowHost` above.
      overflowWidgetsDomNode: getMonacoOverflowHost(),
      suggest: { showStatusBar: false, preview: false, insertMode: 'replace' },
      quickSuggestions: { other: true, comments: false, strings: false },
    });
    editorRef.current = editor;

    // Placeholder (Monaco doesn't have native placeholder support — we draw
    // it via a decoration on the empty line).
    const placeholderContrib = multiline ? null : installPlaceholder(editor, placeholder);

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
    void colCmd; void fnCmd; void helpCmd;

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
    const apply = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      monaco.editor.setTheme(dark ? 'gcExpressionDark' : 'gcExpressionLight');
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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
    if (!ed) return;
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
          border: '1px solid var(--gc-border, #313944)',
          borderRadius: 4,
          background: 'var(--gc-bg, #0b0e11)',
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
function installPlaceholder(editor: monaco.editor.IStandaloneCodeEditor, text: string | undefined) {
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
          inlineClassName: 'gc-expr-placeholder',
        },
      },
    }] : []);
  };
  render();
  const sub = editor.onDidChangeModelContent(render);
  // Minimal style injection for the placeholder.
  if (!document.getElementById('gc-expr-placeholder-style')) {
    const style = document.createElement('style');
    style.id = 'gc-expr-placeholder-style';
    style.textContent = `.gc-expr-placeholder { color: var(--gc-text-faint, #4a5568); font-style: italic; pointer-events: none; }`;
    document.head.appendChild(style);
  }
  return { dispose: () => { sub.dispose(); editor.deltaDecorations(decorations, []); } };
}
