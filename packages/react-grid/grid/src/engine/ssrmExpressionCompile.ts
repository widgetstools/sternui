import { parse, tokenize } from '@starui/engine';
import type { ExpressionNode } from '@starui/engine';

export type SsrmExpressionCompileResult =
  | {
      ok: true;
      perspectiveExpression: string;
      perspectiveType?: 'float' | 'integer' | 'string' | 'boolean';
    }
  | { ok: false; reason: string };

const PERSPECTIVE_FUNCTIONS = new Set(['IF', 'IFS']);

class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

function isViewportOnlyColumnRef(columnId: string): boolean {
  return columnId.endsWith('.old') || columnId.endsWith('.new');
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function compileNode(node: ExpressionNode): string {
  switch (node.type) {
    case 'literal': {
      if (node.value === null) return 'null';
      if (typeof node.value === 'string') return `"${escapeString(node.value)}"`;
      if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
      return String(node.value);
    }

    case 'columnRef': {
      if (isViewportOnlyColumnRef(node.columnId)) {
        throw new CompileError(
          `Column reference [${node.columnId}] is viewport-only (.old/.new) and cannot compile to Perspective`,
        );
      }
      return `"${escapeString(node.columnId)}"`;
    }

    case 'binary': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      switch (node.operator) {
        case '+':
        case '-':
        case '*':
        case '/':
          return `${left} ${node.operator} ${right}`;
        case '>':
        case '<':
        case '>=':
        case '<=':
        case '==':
        case '!=':
          return `${left} ${node.operator} ${right}`;
        case 'AND':
          return `(${left} and ${right})`;
        case 'OR':
          return `(${left} or ${right})`;
        default:
          throw new CompileError(`Unsupported operator: ${node.operator}`);
      }
    }

    case 'unary': {
      const operand = compileNode(node.operand);
      if (node.operator === 'NOT') return `not(${operand})`;
      if (node.operator === '-') return `-${operand}`;
      throw new CompileError(`Unsupported unary operator: ${node.operator}`);
    }

    case 'call': {
      const name = node.name.toUpperCase();
      if (!PERSPECTIVE_FUNCTIONS.has(name)) {
        throw new CompileError(`Unsupported function: ${node.name}`);
      }
      const args = node.args.map((arg) => compileNode(arg));
      if (name === 'IF') {
        if (args.length !== 3) {
          throw new CompileError('IF requires exactly 3 arguments');
        }
        // Perspective 3.8: prefer if() over ternary — nested `? :` fails for IFS.
        return `if(${args[0]}, ${args[1]}, ${args[2]})`;
      }
      return compileIfs(args);
    }

    case 'variable':
      throw new CompileError(`Unsupported variable: ${node.name}`);

    case 'member':
    case 'ternary':
    case 'array':
      throw new CompileError(`Unsupported expression construct: ${node.type}`);

    default:
      throw new CompileError('Unsupported expression node');
  }
}

function compileIfs(args: string[]): string {
  if (args.length < 2) {
    throw new CompileError('IFS requires at least 2 arguments');
  }

  const hasDefault = args.length % 2 === 1;
  const pairCount = Math.floor(args.length / 2);
  let result = hasDefault ? args[args.length - 1]! : 'null';

  for (let i = pairCount - 1; i >= 0; i--) {
    const cond = args[i * 2]!;
    const val = args[i * 2 + 1]!;
    result = `if(${cond}, ${val}, ${result})`;
  }

  return result;
}

function inferPerspectiveType(node: ExpressionNode): SsrmExpressionCompileResult['perspectiveType'] {
  switch (node.type) {
    case 'literal':
      if (typeof node.value === 'boolean') return 'boolean';
      if (typeof node.value === 'string') return 'string';
      if (typeof node.value === 'number') {
        return Number.isInteger(node.value) ? 'integer' : 'float';
      }
      return undefined;
    case 'binary':
      if (node.operator === 'AND' || node.operator === 'OR') return 'boolean';
      if (['>', '<', '>=', '<=', '==', '!='].includes(node.operator)) return 'boolean';
      return 'float';
    case 'unary':
      if (node.operator === 'NOT') return 'boolean';
      return 'float';
    case 'call':
      return undefined;
    default:
      return undefined;
  }
}

export function compileStarUiExpressionToPerspective(
  expression: string,
): SsrmExpressionCompileResult {
  try {
    const node = parse(tokenize(expression));
    const perspectiveExpression = compileNode(node);
    return {
      ok: true,
      perspectiveExpression,
      perspectiveType: inferPerspectiveType(node),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}
