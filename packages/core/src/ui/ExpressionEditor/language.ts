import type * as MonacoNS from 'monaco-editor';

/**
 * Monarch language definition for our ExpressionEngine DSL. Registered
 * exactly once per Monaco instance (idempotent guard at call site).
 *
 * Tokens (Monaco syntax-highlight classes) map to our grammar:
 *   - `[columnId]`      → `variable.column`  (new primary)
 *   - `{columnId}`      → `variable.column.deprecated`
 *   - `IDENTIFIER(`     → `support.function`
 *   - `IDENTIFIER`      → `variable` (bare `data.field` etc.)
 *   - keywords `AND OR NOT IN BETWEEN true false null`
 *   - numbers, strings (single + double), operators, parens/commas
 */
export const LANGUAGE_ID = 'gcExpression';

const KEYWORDS = ['AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'true', 'false', 'null', 'TRUE', 'FALSE', 'NULL'];

export function registerLanguage(monaco: typeof MonacoNS): void {
  if (monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) return;

  monaco.languages.register({ id: LANGUAGE_ID });

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    brackets: [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    keywords: KEYWORDS,
    operators: ['+', '-', '*', '/', '%', '==', '!=', '<>', '<', '>', '<=', '>=', '!', '&&', '||'],

    tokenizer: {
      root: [
        // Column reference (new syntax): `[identifier]`
        [/\[[A-Za-z_][A-Za-z0-9_]*\]/, 'variable.predefined'],
        // Column reference (deprecated): `{identifier}` — highlighted in a
        // muted style via theme mapping below.
        [/\{[A-Za-z_][A-Za-z0-9_]*\}/, 'variable.deprecated'],

        // Function call vs identifier — peek ahead for `(`.
        [/[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/, 'support.function'],

        // Keywords / identifiers
        [/[A-Za-z_][A-Za-z0-9_]*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],

        // Numbers
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],

        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],

        // Operators
        [/(==|!=|<>|<=|>=|&&|\|\|)/, 'operator'],
        [/[+\-*/%<>!]/, 'operator'],

        // Punctuation
        [/[(),.]/, 'delimiter'],
        [/[\[\]{}]/, '@brackets'],

        [/\s+/, 'white'],
      ],
    },
  });

  // Theme: tweak colors for readability in both light and dark modes. Monaco's
  // default themes (`vs` / `vs-dark`) already style most tokens; we only add
  // subdued color for deprecated `{col}` so it visually looks "yellowed".
  monaco.editor.defineTheme('gcExpressionDark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'variable.predefined', foreground: '7dd3fc' }, // sky-300
      { token: 'variable.deprecated', foreground: 'eab308', fontStyle: 'italic' }, // amber-500 italic
      { token: 'support.function', foreground: 'c084fc' }, // purple-400
      { token: 'keyword', foreground: 'f0b90b' }, // bn-yellow
      { token: 'operator', foreground: 'eaecef' },
      { token: 'number', foreground: 'a5d6a7' },
      { token: 'number.float', foreground: 'a5d6a7' },
      { token: 'string', foreground: 'f5a97f' },
    ],
    colors: {
      'editor.background': '#0b0e11',
      'editor.foreground': '#eaecef',
      'editorLineNumber.foreground': '#4a5568',
      'editorCursor.foreground': '#f0b90b',
    },
  });

  monaco.editor.defineTheme('gcExpressionLight', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'variable.predefined', foreground: '0369a1' },
      { token: 'variable.deprecated', foreground: 'b45309', fontStyle: 'italic' },
      { token: 'support.function', foreground: '7c3aed' },
      { token: 'keyword', foreground: 'ca8a04' },
    ],
    colors: {},
  });
}
