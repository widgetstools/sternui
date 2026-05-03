import { getValueByPath } from '@marketsui/shared-types';
import type { ExpressionNode, EvaluationContext, FunctionDefinition } from './types';

export class Evaluator {
  private functions: Map<string, FunctionDefinition>;

  constructor(functions: Map<string, FunctionDefinition>) {
    this.functions = functions;
  }

  evaluate(node: ExpressionNode, ctx: EvaluationContext): unknown {
    switch (node.type) {
      case 'literal':
        return node.value;

      case 'variable':
        return this.resolveVariable(node.name, ctx);

      case 'columnRef': {
        // Dot-walk so column refs targeting nested fields like
        // `[ratings.sp]` resolve via row.ratings.sp instead of
        // returning null for the missing flat key. Literal flat keys
        // still win first inside getValueByPath, preserving feeds
        // that legitimately encode dots in keys.
        const fromColumns = getValueByPath(ctx.columns, node.columnId);
        if (fromColumns !== undefined && fromColumns !== null) return fromColumns;
        const fromData = getValueByPath(ctx.data, node.columnId);
        return fromData ?? null;
      }

      case 'member': {
        const obj = this.evaluate(node.object, ctx);
        if (obj == null) return null;
        return (obj as Record<string, unknown>)[node.property];
      }

      case 'unary':
        return this.evaluateUnary(node.operator, this.evaluate(node.operand, ctx));

      case 'binary':
        return this.evaluateBinary(
          node.operator,
          node.left,
          node.right,
          ctx,
        );

      case 'ternary': {
        const cond = this.evaluate(node.condition, ctx);
        return this.isTruthy(cond)
          ? this.evaluate(node.consequent, ctx)
          : this.evaluate(node.alternate, ctx);
      }

      case 'call':
        return this.evaluateCall(node.name, node.args, ctx);

      case 'array':
        return node.elements.map((el) => this.evaluate(el, ctx));

      default:
        throw new Error(`Unknown node type: ${(node as any).type}`);
    }
  }

  private resolveVariable(name: string, ctx: EvaluationContext): unknown {
    switch (name) {
      case 'x':
      case 'value':
        return ctx.value;
      case 'data':
      case 'row':
        return ctx.data;
      case 'oldValue':
        return ctx.oldValue;
      case 'newValue':
        return ctx.newValue;
      default:
        // Check data fields
        if (name in ctx.data) return ctx.data[name];
        if (name in ctx.columns) return ctx.columns[name];
        return undefined;
    }
  }

  private evaluateUnary(op: string, val: unknown): unknown {
    switch (op) {
      case 'NOT':
        return !this.isTruthy(val);
      case '-':
        return -(val as number);
      default:
        throw new Error(`Unknown unary operator: ${op}`);
    }
  }

  private evaluateBinary(
    op: string,
    leftNode: ExpressionNode,
    rightNode: ExpressionNode,
    ctx: EvaluationContext,
  ): unknown {
    // Short-circuit for AND/OR
    if (op === 'AND') {
      const left = this.evaluate(leftNode, ctx);
      return this.isTruthy(left) ? this.evaluate(rightNode, ctx) : left;
    }
    if (op === 'OR') {
      const left = this.evaluate(leftNode, ctx);
      return this.isTruthy(left) ? left : this.evaluate(rightNode, ctx);
    }

    const left = this.evaluate(leftNode, ctx);
    const right = this.evaluate(rightNode, ctx);

    switch (op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') return `${left}${right}`;
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        if ((right as number) === 0) return null;
        return (left as number) / (right as number);
      case '%':
        return (left as number) % (right as number);
      case '>':
        return (left as number) > (right as number);
      case '<':
        return (left as number) < (right as number);
      case '>=':
        return (left as number) >= (right as number);
      case '<=':
        return (left as number) <= (right as number);
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case 'IN':
        return Array.isArray(right) && right.includes(left);
      case 'BETWEEN':
        if (!Array.isArray(right) || right.length !== 2) return false;
        return (left as number) >= (right[0] as number) && (left as number) <= (right[1] as number);
      default:
        throw new Error(`Unknown binary operator: ${op}`);
    }
  }

  private evaluateCall(name: string, argNodes: ExpressionNode[], ctx: EvaluationContext): unknown {
    const fn = this.functions.get(name.toUpperCase());
    if (!fn) throw new Error(`Unknown function: ${name}`);

    // Column-wide aggregation semantics — when the function is flagged
    // `aggregateColumnRefs` AND the caller supplied `ctx.allRows`, any
    // direct `[colId]` argument evaluates to the FULL column (every
    // row's value) rather than the current row's scalar. That makes
    // `SUM([price])` behave like Excel's `SUM(price_column)` instead
    // of the degenerate `SUM(currentRowPrice)` = currentRowPrice.
    //
    // Falls back to per-row evaluation when either the flag is off or
    // `allRows` isn't available — keeps non-grid contexts unchanged.
    const args: unknown[] =
      fn.aggregateColumnRefs && ctx.allRows
        ? argNodes.map((arg) => {
            if (arg.type === 'columnRef') {
              // Dot-walk per row so `SUM([ratings.sp])` works on
              // nested fields. Same helper the per-cell columnRef
              // case uses — flat literal keys still win first.
              return ctx.allRows!.map((row) => getValueByPath(row, arg.columnId) ?? null);
            }
            return this.evaluate(arg, ctx);
          })
        : argNodes.map((arg) => this.evaluate(arg, ctx));

    if (args.length < fn.minArgs || args.length > fn.maxArgs) {
      throw new Error(
        `${name} expects ${fn.minArgs}-${fn.maxArgs} arguments, got ${args.length}`,
      );
    }

    return fn.evaluate(args, ctx);
  }

  private isTruthy(val: unknown): boolean {
    if (val === null || val === undefined || val === false || val === 0 || val === '') return false;
    return true;
  }
}
