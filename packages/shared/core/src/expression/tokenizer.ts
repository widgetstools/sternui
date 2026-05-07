import type { Token, TokenType } from './types';

const KEYWORDS: Record<string, { type: TokenType; value: string }> = {
  true: { type: 'BOOLEAN', value: 'true' },
  false: { type: 'BOOLEAN', value: 'false' },
  null: { type: 'NULL', value: 'null' },
  AND: { type: 'LOGICAL', value: 'AND' },
  OR: { type: 'LOGICAL', value: 'OR' },
  NOT: { type: 'LOGICAL', value: 'NOT' },
  IN: { type: 'COMPARISON', value: 'IN' },
  BETWEEN: { type: 'COMPARISON', value: 'BETWEEN' },
};

const COMPARISON_OPS = new Set(['>', '<', '>=', '<=', '==', '!=']);
const OPERATORS = new Set(['+', '-', '*', '/', '%']);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    // Skip whitespace
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }

    const pos = i;

    // Column reference: {columnId}
    if (source[i] === '{') {
      const end = source.indexOf('}', i + 1);
      if (end === -1) throw new SyntaxError(`Unterminated column reference at position ${i}`);
      tokens.push({ type: 'COLUMN_REF', value: source.slice(i + 1, end), position: pos });
      i = end + 1;
      continue;
    }

    // String literal: 'text' or "text"
    if (source[i] === "'" || source[i] === '"') {
      const quote = source[i];
      let j = i + 1;
      let str = '';
      while (j < source.length && source[j] !== quote) {
        if (source[j] === '\\' && j + 1 < source.length) {
          j++;
          str += source[j];
        } else {
          str += source[j];
        }
        j++;
      }
      if (j >= source.length) throw new SyntaxError(`Unterminated string at position ${i}`);
      tokens.push({ type: 'STRING', value: str, position: pos });
      i = j + 1;
      continue;
    }

    // Number
    if (/[0-9]/.test(source[i]) || (source[i] === '.' && i + 1 < source.length && /[0-9]/.test(source[i + 1]))) {
      let j = i;
      let hasDot = false;
      while (j < source.length && (/[0-9]/.test(source[j]) || (source[j] === '.' && !hasDot))) {
        if (source[j] === '.') hasDot = true;
        j++;
      }
      tokens.push({ type: 'NUMBER', value: source.slice(i, j), position: pos });
      i = j;
      continue;
    }

    // Two-character comparison operators
    if (i + 1 < source.length) {
      const twoChar = source.slice(i, i + 2);
      if (COMPARISON_OPS.has(twoChar)) {
        tokens.push({ type: 'COMPARISON', value: twoChar, position: pos });
        i += 2;
        continue;
      }
      if (twoChar === '&&') {
        tokens.push({ type: 'LOGICAL', value: 'AND', position: pos });
        i += 2;
        continue;
      }
      if (twoChar === '||') {
        tokens.push({ type: 'LOGICAL', value: 'OR', position: pos });
        i += 2;
        continue;
      }
    }

    // Single-character comparison
    if (source[i] === '>' || source[i] === '<') {
      tokens.push({ type: 'COMPARISON', value: source[i], position: pos });
      i++;
      continue;
    }

    // Single char tokens
    const singleMap: Record<string, TokenType> = {
      '(': 'LPAREN',
      ')': 'RPAREN',
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      ',': 'COMMA',
      '?': 'QUESTION',
      ':': 'COLON',
      '.': 'DOT',
    };
    if (singleMap[source[i]]) {
      tokens.push({ type: singleMap[source[i]], value: source[i], position: pos });
      i++;
      continue;
    }

    // Operators
    if (OPERATORS.has(source[i])) {
      tokens.push({ type: 'OPERATOR', value: source[i], position: pos });
      i++;
      continue;
    }

    // Exclamation (NOT or !=)
    if (source[i] === '!') {
      if (i + 1 < source.length && source[i + 1] === '=') {
        tokens.push({ type: 'COMPARISON', value: '!=', position: pos });
        i += 2;
      } else {
        tokens.push({ type: 'LOGICAL', value: 'NOT', position: pos });
        i++;
      }
      continue;
    }

    // Equals
    if (source[i] === '=') {
      if (i + 1 < source.length && source[i + 1] === '=') {
        tokens.push({ type: 'COMPARISON', value: '==', position: pos });
        i += 2;
      } else {
        tokens.push({ type: 'COMPARISON', value: '==', position: pos });
        i++;
      }
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(source[i])) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_$]/.test(source[j])) {
        j++;
      }
      const word = source.slice(i, j);
      const keyword = KEYWORDS[word];
      if (keyword) {
        tokens.push({ ...keyword, position: pos });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: word, position: pos });
      }
      i = j;
      continue;
    }

    throw new SyntaxError(`Unexpected character '${source[i]}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', position: i });
  return tokens;
}
