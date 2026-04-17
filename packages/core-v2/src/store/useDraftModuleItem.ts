import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridStore } from './createGridStore';
import { useModuleState } from './useModuleState';

/**
 * useDraftModuleItem — per-card local-draft hook.
 *
 * Today v2 panels write module state on every keystroke, which means the
 * profile auto-save fires on every keystroke too and the grid re-renders
 * mid-edit. The Figma-style panels want an explicit Save per card with a
 * dirty indicator — so every card holds a LOCAL draft and only commits
 * into module state when the user clicks Save.
 *
 * Generic shape: "pick one item from a module's state, edit it locally,
 * commit it back on Save".
 *
 *   const { draft, setDraft, dirty, save, discard } = useDraftModuleItem<Rule>({
 *     store, moduleId: 'conditional-styling',
 *     selectItem: (state: ConditionalStylingState) => state.rules.find(r => r.id === id),
 *     commitItem: (next) => (state) => ({
 *       ...state,
 *       rules: state.rules.map(r => r.id === id ? next : r),
 *     }),
 *   });
 *
 * Behaviour:
 *   - Draft seeded from the committed item on mount.
 *   - External commits (e.g. rename from elsewhere) re-seed the draft only
 *     when the card is CLEAN — we never overwrite pending user edits.
 *   - `dirty` is a shallow-JSON compare; good enough for POJO module items
 *     (no Dates, no class instances). Panels can pass a custom equality
 *     via `isEqual` when that's not true.
 *   - `save()` pushes the draft through the same `setModuleState` path
 *     that module transforms and auto-save listen to, so nothing
 *     downstream has to change.
 */

export interface UseDraftModuleItemOptions<TState, TItem> {
  store: GridStore;
  moduleId: string;
  /** Extract the item we're editing from the module's state. May return undefined (card is stale). */
  selectItem: (state: TState) => TItem | undefined;
  /** Given the edited draft, return a reducer that patches the module state. */
  commitItem: (next: TItem) => (state: TState) => TState;
  /** Custom deep-equality. Defaults to JSON.stringify compare. */
  isEqual?: (a: TItem, b: TItem) => boolean;
}

export interface UseDraftModuleItemResult<TItem> {
  /** The currently-edited draft. Always defined when the item exists. */
  draft: TItem;
  /** Patch the draft — shallow merge into the existing draft. */
  setDraft: (patch: Partial<TItem> | ((prev: TItem) => TItem)) => void;
  /** True when draft differs from committed. */
  dirty: boolean;
  /** Commit the draft into module state. */
  save: () => void;
  /** Revert the draft to the current committed value. */
  discard: () => void;
  /** True when the item no longer exists upstream (deleted elsewhere). */
  missing: boolean;
}

function defaultIsEqual<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

export function useDraftModuleItem<TState, TItem>({
  store,
  moduleId,
  selectItem,
  commitItem,
  isEqual = defaultIsEqual,
}: UseDraftModuleItemOptions<TState, TItem>): UseDraftModuleItemResult<TItem> {
  const [moduleState, setModuleState] = useModuleState<TState>(store, moduleId);
  const committed = selectItem(moduleState);

  // Draft state — never null; we fall back to the last known committed
  // value when the upstream item briefly disappears (e.g. mid-delete).
  const [draft, setDraftState] = useState<TItem | undefined>(committed);
  const committedRef = useRef<TItem | undefined>(committed);

  // Re-seed draft when the committed value changes from outside AND we
  // aren't dirty. This handles the "someone else renamed this rule"
  // scenario without stomping in-flight edits.
  useEffect(() => {
    if (committed === undefined) {
      committedRef.current = undefined;
      return;
    }
    const prev = committedRef.current;
    committedRef.current = committed;

    // First-time seed, or committed changed while we were clean.
    if (draft === undefined) {
      setDraftState(committed);
      return;
    }

    const wasClean = prev !== undefined && isEqual(prev, draft);
    const committedChanged = prev === undefined || !isEqual(prev, committed);

    if (wasClean && committedChanged) {
      setDraftState(committed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  const setDraft = useCallback<UseDraftModuleItemResult<TItem>['setDraft']>(
    (patch) => {
      setDraftState((prev) => {
        if (prev === undefined) return prev;
        if (typeof patch === 'function') return (patch as (p: TItem) => TItem)(prev);
        return { ...prev, ...patch };
      });
    },
    [],
  );

  const save = useCallback(() => {
    if (draft === undefined) return;
    setModuleState(commitItem(draft));
  }, [draft, commitItem, setModuleState]);

  const discard = useCallback(() => {
    if (committedRef.current !== undefined) {
      setDraftState(committedRef.current);
    }
  }, []);

  const dirty =
    draft !== undefined && committed !== undefined && !isEqual(draft, committed);

  return {
    draft: (draft ?? committed) as TItem,
    setDraft,
    dirty,
    save,
    discard,
    missing: committed === undefined,
  };
}
