/**
 * StarUI's expression AST, restated STRUCTURALLY.
 *
 * This is a mirror of `ExpressionNode` in `@starui/engine`
 * (`packages/shared/engine/src/expression/types.ts`). Nothing here is a new
 * language: `tokenize` and `parse` already exist there, the customizer's
 * calculated-column module already emits this exact shape, and two backends
 * already consume it — `ssrmExpressionCompile.ts` compiles it to Perspective's
 * expression language and `ssrmCalcColumns.ts` sorts a column into which
 * backend can take it. This package adds a THIRD backend and no second syntax.
 *
 * ## Why it is copied rather than imported — the decision, and why the
 * alternatives lose
 *
 * The three options were: import `@starui/engine`, take the AST structurally,
 * or take an already-compiled closure.
 *
 * **A closure is impossible, not merely undesirable.** A calculated column has
 * to be evaluated where the BOOK is, which since session 1 is a SharedWorker,
 * and session 5 needs the same values to feed sort, filter and aggregation —
 * all of which run inside the engine. A function is not structured-cloneable,
 * so a closure compiled in the window cannot cross the port at all. That option
 * does not survive the topology.
 *
 * **Importing `@starui/engine` is possible and costs more than it looks.** It
 * is not an expression library: it is the grid platform, exported through a
 * single `.` entry that pulls in the store, the profile manager, persistence,
 * CSS injection and `colDef` helpers, with `zustand` and `ssf` as dependencies
 * and `ag-grid-community` / `-enterprise` / `-react` as peers. This package has
 * ZERO runtime dependencies on purpose (`types.ts` types AG Grid structurally
 * for the same reason) and its consumers are worker entries — the lab's
 * `ssrmBookWorker`, and `host-data`'s data-services worker, which INJECTS the
 * engine precisely so a worker that never opens a blotter does not carry it.
 * Importing the grid platform into that bundle repeats the mistake the
 * Perspective path measured and reversed: ~900 ms of every window's open spent
 * on a 5,070 kB chunk it could not execute. The layer rules in
 * `docs/ARCHITECTURE.md` permit the import — `engine` sits below the grid
 * packages — so this is a bundle and boundary decision, not a legality one.
 *
 * **The AST is plain data, which is the property that decides it.** Every node
 * below is a JSON object of strings, numbers, booleans, nulls and arrays, so it
 * structured-clones across a SharedWorker port unchanged. That is not a
 * theoretical claim: `setCalcColumns` puts it on the wire and
 * `worker/host.test.ts` sends one over a real `MessageChannel`. Parsing stays
 * in the window, where `@starui/engine` already is; only the tree crosses.
 *
 * **What the copy costs, and how that cost is contained.** Two declarations of
 * one shape can drift. The containment is that the shape is DATA and the
 * meaning is pinned elsewhere: `calc.fuzz.test.ts` compares this evaluator
 * against an oracle written to `evalOps.ts`'s rules, and
 * `scripts/calcTwinProbe.mjs` runs the real `@starui/engine` evaluator over the
 * lab's stress book and compares every row. If a node type is added upstream it
 * arrives here as an unknown `type` and is REFUSED by name, which is the loud
 * failure — not a silently wrong column.
 */

export interface SsrmLiteralNode {
  type: 'literal';
  value: number | string | boolean | null;
}

/** `[colId]` — a field of the book. Dotted ids are permitted by the parser. */
export interface SsrmColumnRefNode {
  type: 'columnRef';
  columnId: string;
}

/** A bare identifier: `x`, `value`, `data`, or a field name. */
export interface SsrmVariableNode {
  type: 'variable';
  name: string;
}

export interface SsrmBinaryNode {
  type: 'binary';
  /** `+ - * / % > < >= <= == != AND OR IN BETWEEN` */
  operator: string;
  left: SsrmExpressionNode;
  right: SsrmExpressionNode;
}

export interface SsrmUnaryNode {
  type: 'unary';
  /** `NOT` or `-` */
  operator: string;
  operand: SsrmExpressionNode;
}

export interface SsrmTernaryNode {
  type: 'ternary';
  condition: SsrmExpressionNode;
  consequent: SsrmExpressionNode;
  alternate: SsrmExpressionNode;
}

export interface SsrmCallNode {
  type: 'call';
  name: string;
  args: SsrmExpressionNode[];
}

export interface SsrmMemberNode {
  type: 'member';
  object: SsrmExpressionNode;
  property: string;
}

export interface SsrmArrayNode {
  type: 'array';
  elements: SsrmExpressionNode[];
}

export type SsrmExpressionNode =
  | SsrmLiteralNode
  | SsrmColumnRefNode
  | SsrmVariableNode
  | SsrmBinaryNode
  | SsrmUnaryNode
  | SsrmTernaryNode
  | SsrmCallNode
  | SsrmMemberNode
  | SsrmArrayNode;

/** One calculated column: a column id and the tree that produces its value. */
export interface SsrmCalcColumnDef {
  /**
   * The field name the value is stamped onto in a returned row.
   *
   * Where it collides with a real field of the book the expression WINS for the
   * returned value — that is what "a calculated column over an existing column"
   * means — and the same field is what a failed evaluation falls back to.
   */
  colId: string;
  ast: SsrmExpressionNode;
}
