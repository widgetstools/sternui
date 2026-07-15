/**
 * Compile MarketsGrid row-exclusion DSL → Perspective keep expression.
 *
 * Semantics match CSRM external filter: expression is EXCLUDE-when-true, so
 * Perspective keeps rows where `not(compiled)` is truthy.
 */

import { compileStarUiExpressionToPerspective } from './ssrmExpressionCompile.js';

export type SsrmRowExclusionCompileResult =
  | { ok: true; keepExpression: string; perspectiveExpression: string }
  | { ok: false; reason: string };

/**
 * @param exclusionExpression - StarUI DSL, e.g. `[ccy] == "INR"`
 */
export function compileRowExclusionKeepExpression(
  exclusionExpression: string,
): SsrmRowExclusionCompileResult {
  const trimmed = exclusionExpression.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Empty expression' };
  }
  const compiled = compileStarUiExpressionToPerspective(trimmed);
  if (!compiled.ok) {
    return { ok: false, reason: compiled.reason };
  }
  return {
    ok: true,
    perspectiveExpression: compiled.perspectiveExpression,
    keepExpression: `not(${compiled.perspectiveExpression})`,
  };
}
