import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import './monaco-overflow.css';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';
import { registerLanguage } from './language';
import { registerCompletions, defaultFunctionsProvider } from './completions';
import { attachDiagnostics } from './diagnostics';
import { Palette, type PaletteItem } from './Palette';
import { HelpOverlay } from './HelpOverlay';
import { getElementDomContext, getExpressionTheme, getMonacoOverflowHost } from './editorDom';
import { createExpressionEditorOptions } from './editorOptions';
import { ensureMonacoWorkerEnvironment } from './monacoEnvironment';
import { installExpressionPlaceholder } from './expressionEditorPlaceholder';
import { registerExpressionPaletteCommands } from './expressionEditorPaletteCommands';
import { registerExpressionEditorKeyBridges } from './expressionEditorKeyBridges';

/**
 * Monaco-hosting expression editor. Code-split from the public wrapper so
 * Monaco's payload only downloads when the user opens an editor.
 *
 * Uses `monaco-editor` directly (not @monaco-editor/react) — Vite bundles
 * it cleanly as a dynamic chunk. Thin shell: language, completions,
 * diagnostics, overflow host, placeholder decoration, and palette chords
 * only; all other keys stay on Monaco defaults (same as stock editor demos).
 */

ensureMonacoWorkerEnvironment(monaco);

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
    className,
    style: hostStyle,
    'data-testid': dataTestId,
    handleRef,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const textRef = useRef(value);
  const providersRef = useRef({ columnsProvider, functionsProvider });
  providersRef.current = { columnsProvider, functionsProvider };

  const [activePalette, setActivePalette] = useState<'columns' | 'functions' | 'help' | null>(null);

  useEffect(() => {
    registerLanguage(monaco);
  }, []);

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

    const placeholderContrib = multiline
      ? null
      : installExpressionPlaceholder(monaco, editor, placeholder, dom.document);

    const disposers: Array<() => void> = [];
    disposers.push(registerCompletions(
      monaco,
      () => providersRef.current.columnsProvider?.() ?? [],
      () => providersRef.current.functionsProvider?.() ?? defaultFunctionsProvider(),
    ).dispose);

    registerExpressionEditorKeyBridges(monaco, editor, dom.document);
    registerExpressionPaletteCommands(monaco, editor, {
      onOpenColumns: () => setActivePalette('columns'),
      onOpenFunctions: () => setActivePalette('functions'),
      onOpenHelp: () => setActivePalette('help'),
    });

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

    disposers.push(editor.onDidBlurEditorText(commit).dispose);

    if (onChange) {
      disposers.push(editor.onDidChangeModelContent(() => {
        onChange(editor.getValue());
      }).dispose);
    }

    return () => {
      disposers.forEach((d) => {
        try {
          d();
        } catch {
          /* dispose best-effort */
        }
      });
      placeholderContrib?.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (value !== ed.getValue()) {
      ed.setValue(value);
      textRef.current = value;
    }
  }, [value]);

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

  const columnItems: PaletteItem[] = activePalette === 'columns'
    ? (providersRef.current.columnsProvider?.() ?? []).map((c) => ({
        id: c.colId,
        label: `[${c.colId}]`,
        detail: c.headerName + (c.dataType ? ` · ${c.dataType}` : ''),
        description: `Reference the "${c.headerName}" column of the current row.`,
        keywords: [c.colId, c.headerName],
      }))
    : [];

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
        className={className}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: heightPx,
          border: '1px solid var(--ds-border-primary)',
          borderRadius: 4,
          background: 'var(--ds-surface-ground)',
          overflow: 'hidden',
          ...hostStyle,
        }}
      />
      {activePalette === 'columns' && (
        <Palette
          title="Columns"
          subtitle="Ctrl+Shift+C"
          placeholder="Filter columns…"
          items={columnItems}
          onPick={(it) => {
            insertAtCursor(it.label);
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
