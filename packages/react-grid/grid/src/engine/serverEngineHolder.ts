/**
 * A stable handle to a swappable SERVER-SIDE row engine, and the grid `context`
 * shape the platform reads it through.
 *
 * ## Why the handle
 *
 * AG Grid reads the `context` grid option when it CREATES the grid and hands
 * that exact value to every status panel it instantiates. The engine, however,
 * is NOT stable: it is rebuilt whenever its source changes — a provider restart
 * hands over a new Table or a new book, and React StrictMode double-invokes the
 * mount effect. Passing `{ engine }` therefore froze the status bar against the
 * first engine, which was then closed: it read "0 rows" over a full book, with
 * nothing in the console to say why.
 *
 * So the context carries this holder instead. Its identity never changes; what
 * it points at does, and subscribers are told.
 *
 * ## Why it is not called "perspective" any more
 *
 * It was, and the doc on it admitted the name was wrong and that renaming was a
 * separate change. Two engines now put an engine here — `@starui/perspective-grid`
 * and `@starui/ssrm-engine` — and every consumer of it (the Excel export, the
 * alerts full-book rescan, the row-count status panels, the saved-filter count)
 * reads it structurally and does not care which. The alternative was a second
 * context key with a second copy of those four consumers, which is precisely
 * the drift this repo keeps paying for.
 */

/**
 * What a status bar can honestly say when the client does not hold the book.
 *
 * The intersection of what both engines report, and nothing beyond it: a panel
 * that reached for a Perspective-only figure would be a panel that renders
 * nothing on the other surface, silently.
 */
export interface ServerGridStatus {
  /** Rows in the book, ignoring every filter. Null until measured. */
  bookRows: number | null;
  /**
   * Rows the grid's ROOT LEVEL holds — what AG sizes its store from, and under
   * grouping the number of top-level GROUPS rather than of rows.
   *
   * For "how many rows is the user looking at", use {@link leafRows}. Reading
   * this one in a status bar produced "9 of 50,000" over an unfiltered book
   * grouped into nine asset classes.
   */
  filteredRows: number | null;
  /** Rows of the filtered book, ignoring grouping. Null until measured. */
  leafRows: number | null;
  /** True when a filter is actually narrowing the book. */
  filtered: boolean;
  /** Re-reading / applying pushed writes. */
  live: boolean;
  /** Blocks that failed; AG never retries one on its own. */
  failedBlocks: number;
}

/**
 * The engine, as everything downstream of the surface sees it.
 *
 * Deliberately the smallest set that the shared consumers use, so a third
 * engine only has to answer these. `PerspectiveRowEngine` and
 * `SsrmEngineRowEngine` both satisfy it structurally without either package
 * knowing this interface exists.
 */
export interface ServerRowEngineLike {
  readonly status: ServerGridStatus;
  subscribe(listener: (status: ServerGridStatus) => void): () => void;
  /**
   * The whole filtered book, for an export. Null means it could not be read in
   * full — past the ceiling, or the read failed — and a caller must REPORT
   * that rather than write a short file, because a spreadsheet that stopped
   * early is indistinguishable from a complete one once it is open.
   */
  readAllRows(): Promise<Record<string, unknown>[] | null>;
  /** Every distinct value in a column, for a set filter. Null = no honest list. */
  distinctValues(colId: string): Promise<unknown[] | null>;
}

/**
 * Generic in the engine so a SURFACE can hold its own full engine type while
 * the shared consumers see only {@link ServerRowEngineLike}. The context below
 * uses the default, which is what makes one panel serve both surfaces.
 */
export interface ServerEngineHolder<E extends ServerRowEngineLike = ServerRowEngineLike> {
  get(): E | null;
  set(engine: E | null): void;
  /**
   * Called with the current engine immediately, then on every swap. The
   * immediate call is not a convenience: a subscriber that arrives after the
   * swap it cared about would otherwise wait forever for a second one.
   * Returns an unsubscribe.
   */
  subscribe(listener: (engine: E | null) => void): () => void;
}

/**
 * What a server-side surface puts on the grid `context`.
 *
 * The `ssrm*` names are not CustomSSRMGrid-specific despite the spelling: they
 * are the contract `useFilterModel` uses to put a row count on every
 * saved-filter pill whenever the client does not hold the book. Only
 * CustomSSRMGrid answered it originally, so the counts were silently absent on
 * every other server-side path — no badge, no warning.
 */
export interface ServerGridContext {
  serverEngineHolder: ServerEngineHolder;
  /**
   * Rows the whole book matches under a filter model. Resolves null when the
   * model has a clause the engine cannot express exactly — the caller must
   * show no badge rather than a plausible wrong number.
   */
  ssrmCountMatching(filterModel: Record<string, unknown>): Promise<number | null>;
  /**
   * Rows of the current filtered book matching a boolean expression in the
   * engine's own language. This is how a style rule finds out whether ANY row
   * in the book matches it — the client-side original walks the loaded blocks,
   * which on this path is the viewport rather than the book.
   *
   * Optional: an engine with no expression language of its own does not offer
   * it, and a caller paints nothing rather than reading absence as "no match".
   */
  ssrmCountMatchingExpression?(source: string): Promise<number | null>;
  /**
   * One column aggregate over the current filtered book, for a rule with
   * cross-row context. Separate from the expression because an expression
   * language need have no cross-row aggregate — see the Perspective package's
   * ARCHITECTURE.md, where `avg("col")` is row-wise and looks like one.
   */
  ssrmAggregateScalar?(colId: string, aggregate: string): Promise<number | null>;
  /**
   * Which language `ssrmCountMatchingExpression` takes.
   *
   * `'perspective'` (the default, and what it meant when there was only one
   * surface) is Perspective source, compiled in the window from the rule's
   * StarUI expression. `'starui'` is the rule's own source, left alone —
   * `@starui/ssrm-engine` parses it to the SAME AST calculated columns already
   * send it, so there is one language and one parser on that path.
   *
   * Declared rather than sniffed, because the two are both plain strings and a
   * mismatch is silent: the worker would refuse every rule and the header would
   * simply never light, which is indistinguishable from a rule nothing matches.
   */
  readonly ssrmExpressionDialect?: 'perspective' | 'starui';
  /**
   * What the engine made of the authored calculated columns — refusals, runtime
   * failures, and fields the book does not have, each with a count.
   *
   * This exists so an AUTHOR can be told why a column came back blank. The
   * planner in `@starui/grid` deliberately holds no copy of the engine's refusal
   * list: it parses, and everything that parses is planned, because a second
   * copy of that list here is a second thing to keep in step. The engine refuses
   * by name and retains the reason; this is the seam that reads it back. One
   * definition of what is refused, and it stays in the engine.
   *
   * Optional for the same reason the two above are: an engine whose calculated
   * columns are compiled by someone else's language has no such list, and a
   * caller must render nothing rather than report "no problems".
   */
  ssrmCalcDiagnostics?(): Promise<ServerCalcDiagnostic[]>;
  /** True once an engine is attached and `ssrmCountMatching` can be believed. */
  readonly ssrmConfigured: boolean;
}

/**
 * One thing an engine has to say about one authored expression.
 *
 * Structurally identical to `@starui/ssrm-engine`'s `SsrmCalcDiagnostic` and
 * deliberately NOT imported from it: `@starui/grid` does not depend on that
 * package, and the whole point of this seam is that a second engine can answer
 * it without either package knowing this interface exists.
 */
export interface ServerCalcDiagnostic {
  colId: string;
  /**
   * `compile` — refused, the column is not installed at all;
   * `runtime`  — threw while evaluating a cell, which then fell back;
   * `column`   — names a field the book does not have. Not an error: it reads
   *              null exactly as it does on the grid. Reported because a whole
   *              column of nulls from a typo is the quietest way this goes wrong.
   */
  phase: 'compile' | 'runtime' | 'column';
  message: string;
  /** How many times it was hit. Warned once, counted always. */
  count: number;
}

export function createServerEngineHolder<
  E extends ServerRowEngineLike = ServerRowEngineLike,
>(): ServerEngineHolder<E> {
  let current: E | null = null;
  const listeners = new Set<(engine: E | null) => void>();

  return {
    get: () => current,
    set(engine) {
      if (engine === current) return;
      current = engine;
      for (const listener of listeners) listener(engine);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
