import type * as MonacoNS from 'monaco-editor';
import { LANGUAGE_ID } from './language';
import { ExpressionEngine } from '../../expression';

/**
 * Operator / keyword catalogue surfaced in the completion widget.
 *
 * Covers every structural piece of the DSL beyond columns and functions:
 *   - Logical keywords: AND, OR, NOT
 *   - Set membership: IN, BETWEEN
 *   - Comparisons: ==, !=, <>, <, >, <=, >=
 *   - Arithmetic: +, -, *, /, %
 *   - Literals: true, false, null
 *
 * Each entry carries a short `detail` line for the suggest widget's right
 * column and a `docs` block for hover preview — traders authoring predicates
 * see usage inline without opening the help palette. `snippet: true` entries
 * drop the user straight into a placeholder so `IN ` expands to `IN [$0]`
 * with the caret inside the array.
 */
interface OpSpec {
  label: string;
  detail: string;
  kind: 'keyword' | 'operator';
  /** Text inserted into the editor. Defaults to `label` when omitted. */
  insertText?: string;
  /** If true, `insertText` is interpreted as a Monaco snippet (with `$0`). */
  snippet?: boolean;
  docs?: string;
}

const OPERATORS_AND_KEYWORDS: ReadonlyArray<OpSpec> = [
  // ── Logical joiners ──────────────────────────────────────────────────
  { label: 'AND', detail: 'Logical AND', kind: 'keyword', docs: '`a AND b` — true when both operands are true. Left-to-right short-circuit.' },
  { label: 'OR',  detail: 'Logical OR',  kind: 'keyword', docs: '`a OR b` — true when either operand is true. Left-to-right short-circuit.' },
  { label: 'NOT', detail: 'Logical NOT', kind: 'keyword', docs: '`NOT expr` — negates a boolean value.' },

  // ── Set / range membership ──────────────────────────────────────────
  { label: 'IN', detail: 'Set membership', kind: 'keyword', insertText: 'IN [$0]', snippet: true, docs: '`x IN [a, b, c]` — true when x equals any element of the array.' },
  { label: 'BETWEEN', detail: 'Range check', kind: 'keyword', insertText: 'BETWEEN $1 AND $0', snippet: true, docs: '`x BETWEEN low AND high` — true when `low <= x <= high` (inclusive).' },

  // ── Literals ────────────────────────────────────────────────────────
  { label: 'true', detail: 'Boolean true', kind: 'keyword' },
  { label: 'false', detail: 'Boolean false', kind: 'keyword' },
  { label: 'null', detail: 'Null literal', kind: 'keyword' },

  // ── Comparison operators ────────────────────────────────────────────
  { label: '==', detail: 'Equal to', kind: 'operator', docs: '`a == b` — true when operands compare equal.' },
  { label: '!=', detail: 'Not equal to', kind: 'operator', docs: '`a != b` — true when operands differ. Synonym: `<>`.' },
  { label: '<>', detail: 'Not equal to (SQL-style)', kind: 'operator' },
  { label: '<',  detail: 'Less than', kind: 'operator' },
  { label: '>',  detail: 'Greater than', kind: 'operator' },
  { label: '<=', detail: 'Less than or equal', kind: 'operator' },
  { label: '>=', detail: 'Greater than or equal', kind: 'operator' },

  // ── Arithmetic ──────────────────────────────────────────────────────
  { label: '+', detail: 'Addition / concatenation', kind: 'operator', docs: 'Numeric addition. For strings, prefer `CONCAT(a, b)`.' },
  { label: '-', detail: 'Subtraction', kind: 'operator' },
  { label: '*', detail: 'Multiplication', kind: 'operator' },
  { label: '/', detail: 'Division', kind: 'operator' },
  { label: '%', detail: 'Modulus', kind: 'operator' },
];

/**
 * Register the autocomplete provider for our DSL.
 *
 * Monaco completion providers are LANGUAGE-GLOBAL — registering one per
 * editor instance produces duplicated suggestions. Instead we register the
 * provider exactly once (guarded by a module-level flag) and the provider
 * reads columns/functions from a mutable registry of callers' current
 * providers. Each editor mount pushes its providers onto the stack; the
 * provider merges across all active callers so autocomplete sees whatever
 * set of columns the currently-focused editor exposes.
 *
 * Triggers on every character and on `[`, `{`, `(`, `.`, `,`. Context-sensitive:
 *   - After an open `[` or `{` without its closer yet → only columns (the
 *     caller is opening a column reference, showing functions would be
 *     distracting).
 *   - Otherwise → merged list: `[colId]` entries (as `Variable` kind) first,
 *     then all functions (as `Function` kind) with signature as detail and
 *     description as documentation.
 *
 * Returns a disposable the caller invokes when its editor unmounts — unregisters
 * just its own providers, not the global language provider (which stays live
 * for the lifetime of the app).
 */
let _providerRegistered = false;
type ColumnsFn = () => Array<{ colId: string; headerName: string; dataType?: string }>;
type FunctionsFn = () => Array<{ name: string; category: string; signature: string; description: string }>;
const _activeColumns = new Set<ColumnsFn>();
const _activeFunctions = new Set<FunctionsFn>();

export function registerCompletions(
  monaco: typeof MonacoNS,
  getColumns: ColumnsFn,
  getFunctions: FunctionsFn,
): MonacoNS.IDisposable {
  _activeColumns.add(getColumns);
  _activeFunctions.add(getFunctions);

  if (_providerRegistered) {
    return { dispose: () => { _activeColumns.delete(getColumns); _activeFunctions.delete(getFunctions); } };
  }
  _providerRegistered = true;

  const sub = monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: ['[', '{', '(', '.', ',', ' '],
    provideCompletionItems(model, position) {
      const textBefore = model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });

      // Merge columns + functions across every registered caller. When
      // multiple editors are live (e.g. different rules in different panels),
      // they likely expose the same columns — the Map dedupe below drops
      // duplicate colIds, so we never show "Price" twice.
      const colMap = new Map<string, { colId: string; headerName: string; dataType?: string }>();
      for (const fn of _activeColumns) for (const c of fn()) colMap.set(c.colId, c);
      const cols = [...colMap.values()];

      const fnMap = new Map<string, { name: string; category: string; signature: string; description: string }>();
      for (const fn of _activeFunctions) for (const f of fn()) fnMap.set(f.name, f);
      const fns = [...fnMap.values()];

      // Find the word being typed so Monaco replaces it instead of inserting
      // in the middle of an identifier.
      const word = model.getWordUntilPosition(position);
      const range: MonacoNS.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Inside an open `[` or `{` — the user is typing a column name directly.
      // Suggest column ids only; the closing bracket will be inserted by
      // autoClosingPairs so we don't append it.
      const lastOpenBracket = findUnclosedBracket(textBefore);
      if (lastOpenBracket === '[' || lastOpenBracket === '{') {
        return {
          suggestions: cols.map((c) => ({
            label: c.headerName,
            detail: c.colId + (c.dataType ? ` · ${c.dataType}` : ''),
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: c.colId,
            range,
            sortText: '0_' + c.colId,
          })),
        };
      }

      // General position — suggest columns (wrapped in `[..]`), functions,
      // and operator / keyword snippets. Ordering via sortText prefix:
      //   0_  columns     (most common reference when authoring predicates)
      //   1_  keywords    (AND, OR, NOT, IN, BETWEEN — structural joiners)
      //   2_  operators   (>=, !=, etc. — punctuation, less commonly typed by name)
      //   3_  functions   (SUM, IF, etc. — alphabetical within)
      return {
        suggestions: [
          ...cols.map((c) => ({
            label: `[${c.colId}]`,
            detail: c.headerName + (c.dataType ? ` · ${c.dataType}` : ''),
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: `[${c.colId}]`,
            range,
            sortText: '0_' + c.colId,
          })),
          ...OPERATORS_AND_KEYWORDS.map((k) => ({
            label: k.label,
            detail: k.detail,
            documentation: k.docs ? { value: k.docs } : undefined,
            kind: k.kind === 'keyword'
              ? monaco.languages.CompletionItemKind.Keyword
              : monaco.languages.CompletionItemKind.Operator,
            insertText: k.insertText ?? k.label,
            insertTextRules: k.snippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            range,
            sortText: (k.kind === 'keyword' ? '1_' : '2_') + k.label,
          })),
          ...fns.map((f) => ({
            label: f.name,
            detail: f.signature,
            documentation: { value: `**${f.category}** — ${f.description}` },
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${f.name}($0)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: '3_' + f.name,
          })),
        ],
      };
    },
  });

  return {
    dispose: () => {
      _activeColumns.delete(getColumns);
      _activeFunctions.delete(getFunctions);
      // We intentionally DO NOT call sub.dispose() — the provider is global
      // and remains registered for the app's lifetime. If the last editor
      // unmounts, the provider has no callers and returns an empty list,
      // which is harmless.
      void sub;
    },
  };
}

/** Returns the character of the last unclosed bracket in the text (or null).
 *  Respects string literals so `"text with ["` doesn't count. Cheap left-to-right
 *  scan — fine for single-line expressions. */
function findUnclosedBracket(text: string): '[' | '{' | null {
  const stack: Array<'[' | '{'> = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    i++;
  }
  return stack[stack.length - 1] ?? null;
}

/** Default function provider — pulls from the ExpressionEngine singleton.
 *  Callers can override via the `functionsProvider` prop but 99% won't. */
let _defaultEngine: ExpressionEngine | null = null;
export function defaultFunctionsProvider() {
  _defaultEngine ??= new ExpressionEngine();
  return _defaultEngine.getFunctions().map((f) => ({
    name: f.name,
    category: f.category,
    signature: f.signature,
    description: f.description,
  }));
}
