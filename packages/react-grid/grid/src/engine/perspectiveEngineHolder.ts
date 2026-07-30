/**
 * A stable handle to a swappable Perspective row engine.
 *
 * AG Grid reads the `context` grid option when it CREATES the grid and hands
 * that exact value to every status panel it instantiates. The engine, however,
 * is NOT stable: it is rebuilt whenever the Table changes — a provider restart
 * hands over a new one, and React StrictMode double-invokes the mount effect.
 * Passing `{ perspectiveEngine }` therefore froze the status bar against the
 * first engine, which was then closed: it read "0 rows" over a full book, with
 * nothing in the console to say why.
 *
 * So the context carries this holder instead. Its identity never changes; what
 * it points at does, and subscribers are told.
 */
import type { PerspectiveRowEngine } from '@starui/perspective-grid';

export interface PerspectiveEngineHolder {
  get(): PerspectiveRowEngine | null;
  set(engine: PerspectiveRowEngine | null): void;
  /**
   * Called with the current engine immediately, then on every swap. The
   * immediate call is not a convenience: a subscriber that arrives after the
   * swap it cared about would otherwise wait forever for a second one.
   * Returns an unsubscribe.
   */
  subscribe(listener: (engine: PerspectiveRowEngine | null) => void): () => void;
}

/**
 * What the Perspective surface puts on the grid `context`.
 *
 * The `ssrm*` pair is not CustomSSRMGrid-specific despite the name: it is the
 * contract `useFilterModel` uses to put a row count on every saved-filter pill
 * whenever the client does not hold the book. Only CustomSSRMGrid answered it,
 * so the counts were silently absent on the pull path — no badge, no warning.
 * The name is left alone because it is read in several places and renaming it
 * is a separate change from making it work here.
 */
export interface PerspectiveGridContext {
  perspectiveEngineHolder: PerspectiveEngineHolder;
  /**
   * Rows the whole book matches under a filter model. Resolves null when the
   * model has a clause Perspective cannot express exactly — the caller must
   * show no badge rather than a plausible wrong number.
   */
  ssrmCountMatching(
    filterModel: Record<string, unknown>,
  ): Promise<number | null>;
  /** True once an engine is attached and `ssrmCountMatching` can be believed. */
  readonly ssrmConfigured: boolean;
}

export function createPerspectiveEngineHolder(): PerspectiveEngineHolder {
  let current: PerspectiveRowEngine | null = null;
  const listeners = new Set<(engine: PerspectiveRowEngine | null) => void>();

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
