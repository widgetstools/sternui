import type { Token, ExpressionNode } from './types';

/**
 * Pratt parser (precedence climbing) for expression language.
 * Handles operator precedence correctly without nested if/else chains.
 */
export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ExpressionNode {
    const node = this.parseExpression(0);
    if (this.peek().type !== 'EOF') {
      throw new SyntaxError(`Unexpected token '${this.peek().value}' at position ${this.peek().position}`);
    }
    return node;
  }

  private parseExpression(minPrec: number): ExpressionNode {
    let left = this.parseUnary();

    while (true) {
      const token = this.peek();

      // Ternary
      if (token.type === 'QUESTION' && minPrec <= 1) {
        this.advance();
        const consequent = this.parseExpression(0);
        this.expect('COLON');
        const alternate = this.parseExpression(1);
        left = { type: 'ternary', condition: left, consequent, alternate };
        continue;
      }

      // Logical OR
      if (token.type === 'LOGICAL' && token.value === 'OR' && minPrec <= 2) {
        this.advance();
        const right = this.parseExpression(3);
        left = { type: 'binary', operator: 'OR', left, right };
        continue;
      }

      // Logical AND
      if (token.type === 'LOGICAL' && token.value === 'AND' && minPrec <= 4) {
        this.advance();
        const right = this.parseExpression(5);
        left = { type: 'binary', operator: 'AND', left, right };
        continue;
      }

      // Comparison
      if (token.type === 'COMPARISON' && minPrec <= 6) {
        this.advance();
        // Special: IN [list]
        if (token.value === 'IN') {
          this.expect('LBRACKET');
          const elements: ExpressionNode[] = [];
          while (this.peek().type !== 'RBRACKET') {
            if (elements.length > 0) this.expect('COMMA');
            elements.push(this.parseExpression(0));
          }
          this.expect('RBRACKET');
          left = { type: 'binary', operator: 'IN', left, right: { type: 'array', elements } };
          continue;
        }
        // Special: BETWEEN a AND b
        if (token.value === 'BETWEEN') {
          const low = this.parseExpression(7);
          this.expectKeyword('AND');
          const high = this.parseExpression(7);
          left = {
            type: 'binary',
            operator: 'BETWEEN',
            left,
            right: { type: 'array', elements: [low, high] },
          };
          continue;
        }
        const right = this.parseExpression(7);
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }

      // Addition/Subtraction
      if (token.type === 'OPERATOR' && (token.value === '+' || token.value === '-') && minPrec <= 8) {
        this.advance();
        const right = this.parseExpression(9);
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }

      // Multiplication/Division/Modulus
      if (token.type === 'OPERATOR' && (token.value === '*' || token.value === '/' || token.value === '%') && minPrec <= 10) {
        this.advance();
        const right = this.parseExpression(11);
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }

      // Member access (dot)
      if (token.type === 'DOT' && minPrec <= 14) {
        this.advance();
        const prop = this.expect('IDENTIFIER');
        left = { type: 'member', object: left, property: prop.value };
        continue;
      }

      break;
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();

    // Unary NOT
    if (token.type === 'LOGICAL' && token.value === 'NOT') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', operator: 'NOT', operand };
    }

    // Unary minus
    if (token.type === 'OPERATOR' && token.value === '-') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', operator: '-', operand };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.advance();
      const expr = this.parseExpression(0);
      this.expect('RPAREN');
      return expr;
    }

    // Number literal
    if (token.type === 'NUMBER') {
      this.advance();
      return { type: 'literal', value: Number(token.value) };
    }

    // String literal
    if (token.type === 'STRING') {
      this.advance();
      return { type: 'literal', value: token.value };
    }

    // Boolean literal
    if (token.type === 'BOOLEAN') {
      this.advance();
      return { type: 'literal', value: token.value === 'true' };
    }

    // Null literal
    if (token.type === 'NULL') {
      this.advance();
      return { type: 'literal', value: null };
    }

    // Column reference
    if (token.type === 'COLUMN_REF') {
      this.advance();
      return { type: 'columnRef', columnId: token.value };
    }

    // `[identifier(.identifier)*]` — column reference (Excel/Tableau-style),
    // optionally dotted to address nested fields (`[risk.dv01]`,
    // `[ratings.sp]`). Lookahead scans IDENTIFIER (DOT IDENTIFIER)* RBRACKET
    // — anything else (`[1, 2]`, `[x > 0]`, `[price, qty]`, the `IN [...]`
    // RHS) falls through to the array-literal branch below, so existing
    // expressions keep parsing identically. The columnId is the joined
    // dotted path; the evaluator's `getValueByPath` resolves it against
    // either a literal flat key (`row['risk.dv01']`) or a nested object
    // walk (`row.risk.dv01`).
    if (token.type === 'LBRACKET' && this.tokens[this.pos + 1]?.type === 'IDENTIFIER') {
      let scan = this.pos + 1;
      const parts: string[] = [];
      let matched = false;
      while (true) {
        const id = this.tokens[scan];
        if (id?.type !== 'IDENTIFIER') break;
        parts.push(id.value);
        scan++;
        const next = this.tokens[scan];
        if (next?.type === 'RBRACKET') {
          scan++;
          matched = true;
          break;
        }
        if (next?.type === 'DOT') {
          scan++;
          continue;
        }
        break;
      }
      if (matched) {
        this.pos = scan;
        return { type: 'columnRef', columnId: parts.join('.') };
      }
    }

    // Array literal
    if (token.type === 'LBRACKET') {
      this.advance();
      const elements: ExpressionNode[] = [];
      while (this.peek().type !== 'RBRACKET') {
        if (elements.length > 0) this.expect('COMMA');
        elements.push(this.parseExpression(0));
      }
      this.expect('RBRACKET');
      return { type: 'array', elements };
    }

    // Identifier (variable or function call)
    if (token.type === 'IDENTIFIER') {
      this.advance();
      // Function call
      if (this.peek().type === 'LPAREN') {
        this.advance();
        const args: ExpressionNode[] = [];
        while (this.peek().type !== 'RPAREN') {
          if (args.length > 0) this.expect('COMMA');
          args.push(this.parseExpression(0));
        }
        this.expect('RPAREN');
        return { type: 'call', name: token.value, args };
      }
      // Variable
      return { type: 'variable', name: token.value };
    }

    throw new SyntaxError(`Unexpected token '${token.value}' at position ${token.position}`);
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', position: -1 };
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new SyntaxError(`Expected ${type} but got '${token.value}' at position ${token.position}`);
    }
    return this.advance();
  }

  private expectKeyword(keyword: string): Token {
    const token = this.peek();
    if (token.value !== keyword) {
      throw new SyntaxError(`Expected '${keyword}' but got '${token.value}' at position ${token.position}`);
    }
    return this.advance();
  }
}

export function parse(tokens: Token[]): ExpressionNode {
  return new Parser(tokens).parse();
}
