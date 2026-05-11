import type * as monaco from 'monaco-editor';
import { ensurePlaceholderStyle } from './editorDom';

/**
 * Empty-model placeholder via decoration (Monaco has no native placeholder).
 */
export function installExpressionPlaceholder(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  text: string | undefined,
  doc: Document,
): { dispose: () => void } {
  if (!text) return { dispose: () => {} };

  let decorations: string[] = [];
  const render = () => {
    const empty = editor.getValue().length === 0;
    decorations = editor.deltaDecorations(decorations, empty ? [{
      range: new monacoApi.Range(1, 1, 1, 1),
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
  ensurePlaceholderStyle(doc);

  return {
    dispose: () => {
      sub.dispose();
      editor.deltaDecorations(decorations, []);
    },
  };
}
