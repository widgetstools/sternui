import type * as MonacoNS from 'monaco-editor';
import { LANGUAGE_ID } from './language';
import { ExpressionEngine } from '../../expression';

/**
 * Attach a parse-error marker provider to a single Monaco model. Re-runs on
 * every content change (debounced 150 ms); emits at most one `Error` marker
 * at the position returned by `ExpressionEngine.validate()`, plus `Info`
 * markers for each `{col}` deprecated syntax occurrence when `warnDeprecated`
 * is on.
 *
 * Returns a disposer; caller must invoke it on unmount to clear markers and
 * kill the content-change listener.
 */
export function attachDiagnostics(
  monaco: typeof MonacoNS,
  model: MonacoNS.editor.ITextModel,
  options: { warnDeprecated: boolean },
): () => void {
  const engine = getEngine();
  const OWNER = 'gcExpression';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    const text = model.getValue();
    const markers: MonacoNS.editor.IMarkerData[] = [];

    // Parse validation
    const result = engine.validate(text);
    if (!result.valid && result.errors.length > 0) {
      const err = result.errors[0];
      const start = positionAt(model, err.position);
      const end = positionAt(model, err.position + Math.max(1, err.length));
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      });
    }

    // Deprecation warnings for {col} syntax
    if (options.warnDeprecated) {
      const re = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const start = positionAt(model, m.index);
        const end = positionAt(model, m.index + m[0].length);
        const inner = m[0].slice(1, -1);
        markers.push({
          severity: monaco.MarkerSeverity.Info,
          message: `\`{${inner}}\` is deprecated — use \`[${inner}]\` instead.`,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        });
      }
    }

    monaco.editor.setModelMarkers(model, OWNER, markers);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 150);
  };

  const sub = model.onDidChangeContent(schedule);
  run();

  return () => {
    sub.dispose();
    if (timer) clearTimeout(timer);
    monaco.editor.setModelMarkers(model, OWNER, []);
  };
}

function positionAt(model: MonacoNS.editor.ITextModel, offset: number): MonacoNS.Position {
  const clamped = Math.max(0, Math.min(offset, model.getValue().length));
  return model.getPositionAt(clamped);
}

let _engine: ExpressionEngine | null = null;
function getEngine(): ExpressionEngine {
  return (_engine ??= new ExpressionEngine());
}

// Re-export for the language module to use the same id constant.
export { LANGUAGE_ID };
