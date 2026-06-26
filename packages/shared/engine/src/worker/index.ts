/**
 * `@starui/engine/worker` — the pure, DOM-free slice of the engine that
 * can run inside a Web Worker / SharedWorker.
 *
 * It re-exports ONLY the shaping primitives needed to compute calculated
 * columns and formatted display strings off the UI thread:
 *   - the expression engine (parse / compile / evaluate)
 *   - the value-formatter builder (Intl presets + Excel via `ssf`)
 *
 * Everything reachable from here is pure TypeScript with no `document`,
 * `window`, React, or AG-Grid dependency, so bundling this entry into a
 * worker never drags DOM code along. (The DOM-touching parts of the
 * engine — CSS injection, `getComputedStyle` theme resolution — live in
 * other modules and are deliberately NOT re-exported here.)
 *
 * Kept as a SEPARATE lib entry (see vite.config.ts) precisely so the
 * worker bundle stays free of the rest of the engine. See
 * docs/SSRM_WORKER_PLAN.md (Phase 0).
 */

export { ExpressionEngine } from '../expression/index';
export type {
  EvaluationContext,
  ExpressionNode,
  FunctionDefinition,
} from '../expression/types';
export type { CompiledExpression } from '../expression/compileToFunction';

export { valueFormatterFromTemplate } from '../colDef/adapters/valueFormatterFromTemplate';
export type { Formatter, FormatterParams } from '../colDef/adapters/formatterTypes';
export type { PresetId, ValueFormatterTemplate } from '../colDef/types';
