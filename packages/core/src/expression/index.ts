import type { ExpressionNode, EvaluationContext, ValidationResult, FunctionDefinition } from './types';
import type { ExpressionEngineInstance } from '../types/common';
import { tokenize } from './tokenizer';
import { parse } from './parser';
import { Evaluator } from './evaluator';
import { tryCompileToAgString } from './compiler';
import { createFunctionRegistry, getAllFunctions } from './functions';

export class ExpressionEngine implements ExpressionEngineInstance {
  private functions: Map<string, FunctionDefinition>;
  private evaluator: Evaluator;

  constructor() {
    this.functions = createFunctionRegistry();
    this.evaluator = new Evaluator(this.functions);
  }

  parse(expression: string): ExpressionNode {
    const tokens = tokenize(expression);
    return parse(tokens);
  }

  evaluate(node: ExpressionNode, context: EvaluationContext): unknown {
    return this.evaluator.evaluate(node, context);
  }

  parseAndEvaluate(expression: string, context: EvaluationContext): unknown {
    const node = this.parse(expression);
    return this.evaluate(node, context);
  }

  tryCompileToAgString(node: ExpressionNode): string | null {
    return tryCompileToAgString(node);
  }

  validate(expression: string): ValidationResult {
    try {
      const tokens = tokenize(expression);
      parse(tokens);
      return { valid: true, errors: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const posMatch = message.match(/position (\d+)/);
      const position = posMatch ? parseInt(posMatch[1], 10) : 0;
      return {
        valid: false,
        errors: [{ message, position, length: 1 }],
      };
    }
  }

  registerFunction(fn: FunctionDefinition): void {
    this.functions.set(fn.name, fn);
  }

  getFunctions(): FunctionDefinition[] {
    return getAllFunctions();
  }

  getFunctionsByCategory(): Record<string, FunctionDefinition[]> {
    const result: Record<string, FunctionDefinition[]> = {};
    for (const fn of this.functions.values()) {
      if (!result[fn.category]) result[fn.category] = [];
      result[fn.category].push(fn);
    }
    return result;
  }
}

export type { ExpressionNode, EvaluationContext, ValidationResult, FunctionDefinition } from './types';
export { tokenize } from './tokenizer';
export { parse } from './parser';
export { Evaluator } from './evaluator';
export { tryCompileToAgString } from './compiler';
export { createFunctionRegistry, getAllFunctions } from './functions';
export { migrateExpressionSyntax, migrateExpressionsInObject } from './migrate';
