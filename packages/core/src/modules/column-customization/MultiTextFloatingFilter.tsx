/**
 * MultiTextFloatingFilter — a custom AG-Grid floating filter component
 * that replaces the broken `agMultiColumnFloatingFilter` wrapper for
 * multi-column-filter columns whose first child is a text filter and
 * whose column id contains a dot (nested-field paths).
 *
 * Why this exists
 * ───────────────
 * AG-Grid 35.2.x's `agMultiColumnFloatingFilter` mishandles backspace
 * on dotted-id columns. The wrapper fails to forward the cleared
 * keystroke to the inner text filter, so:
 *   - the DOM input value briefly drops a character on backspace
 *   - the next render reads the stale model and snaps the input back
 *   - the underlying filter remains applied (rows stay hidden)
 *
 * Setting `floatingFilterComponent: 'agTextColumnFloatingFilter'`
 * (Option A in the bug investigation) was confirmed not to work either
 * — AG-Grid either ignores the override on multi-filter columns, or
 * the plain text floating filter has the same nested-field-id bug.
 *
 * This component owns the input value in React state directly, then
 * forwards to the multi-filter's first child via
 * `params.parentFilterInstance` and an explicit `setModel` call. We
 * never depend on AG-Grid's controlled-input synchronisation, so the
 * dotted-id path can't break us.
 *
 * Wiring
 * ──────
 * `applyFilterConfigToColDef` in `transforms.ts` plugs this in via a
 * direct React component reference (NOT a string registry name) when:
 *   - cfg.kind === 'agMultiColumnFilter'
 *   - cfg.multiFilters?.[0]?.filter === 'agTextColumnFilter'
 *   - the effective col id contains a dot
 * Other shapes fall through to AG-Grid's defaults.
 */

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { IFloatingFilter, IFloatingFilterParams } from 'ag-grid-community';

/**
 * Shape of the parent multi-filter model we read / write. We use
 * structural reads so a missing or unexpected shape produces an empty
 * input rather than a runtime error.
 */
interface MultiFilterModel {
  filterType?: 'multi';
  filterModels?: Array<TextFilterModel | null | undefined>;
}

interface TextFilterModel {
  filterType?: 'text';
  type?: string;
  filter?: string | null;
}

/** Minimal interface we lean on from the parent multi-filter
 *  instance. We deliberately call `setModel` on the PARENT (not on a
 *  child via `getChildFilterInstance`) — calling setModel on the child
 *  updates only the child's internal state and the multi-filter's
 *  aggregated `getModel()` keeps returning the stale shape, so the
 *  row model never re-evaluates against the new criterion. Going
 *  through the parent's setModel distributes to children AND updates
 *  the aggregate. */
interface MultiFilterInstance {
  setModel?: (model: MultiFilterModel | null) => void | Promise<unknown>;
  getModel?: () => MultiFilterModel | null;
}

/** Read the child text filter's current model from the multi-filter
 *  parent model. Returns the empty string when there's nothing to
 *  show. */
function readTextValue(parentModel: unknown): string {
  const m = parentModel as MultiFilterModel | null;
  const child = m?.filterModels?.[0];
  if (!child || typeof child !== 'object') return '';
  const filter = (child as TextFilterModel).filter;
  return typeof filter === 'string' ? filter : '';
}

export const MultiTextFloatingFilter = forwardRef<IFloatingFilter, IFloatingFilterParams>(
  function MultiTextFloatingFilterImpl(props, ref) {
    // Owned input state. We deliberately do NOT mirror AG-Grid's
    // model on every render — only when AG-Grid notifies us via
    // `onParentModelChanged` (popup edit, programmatic setFilterModel,
    // or column-defs reload). Between those events the input value
    // belongs to the user.
    const [value, setValue] = useState<string>(() => '');

    // Keep the latest API reference handy for the change handler.
    // Pulled from props each render — props on AG-Grid floating
    // filters are stable across the component's lifetime.
    const apiRef = useRef(props.api);
    apiRef.current = props.api;

    useImperativeHandle(
      ref,
      () => ({
        // Called by AG-Grid when the underlying filter model changes
        // for any reason OTHER than direct user input on this
        // floating filter. Sync our owned state to the new model.
        onParentModelChanged(parentModel: unknown) {
          setValue(readTextValue(parentModel));
        },
      }),
      [],
    );

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setValue(next);

        // Build the next multi-filter model, preserving the SECOND
        // child's (set filter) current selection so the user doesn't
        // lose what they had picked there. Then push via the parent
        // multi-filter's `setModel` so it re-aggregates and the row
        // model actually re-evaluates against the new criterion.
        //
        // Calling `setModel` on a single child (via
        // `getChildFilterInstance(0).setModel(…)`) was the obvious-
        // looking path but doesn't work: AG-Grid's multi-filter caches
        // its aggregated model and direct child writes don't
        // invalidate that cache, so `getModel()` returns the stale
        // shape and AG-Grid filters rows against the OLD criterion.
        // Going through the parent fixes that.
        props.parentFilterInstance((instance) => {
          const multi = instance as unknown as MultiFilterInstance;
          if (typeof multi.setModel !== 'function') return;
          // Read the current aggregated model so we don't clobber
          // any other child's state. Defensive: returns `null` when
          // no filter is currently applied.
          const current = multi.getModel?.() ?? null;
          const setChild = current?.filterModels?.[1] ?? null;
          const textChild: TextFilterModel | null =
            next === '' ? null : { filterType: 'text', type: 'contains', filter: next };

          // Multi-filter is collapsed entirely when both children
          // are null. Returning `null` here drops the column from
          // the filter model — same shape the built-in floating
          // filter produces on a full clear.
          const nextModel: MultiFilterModel | null =
            textChild === null && setChild === null
              ? null
              : { filterType: 'multi', filterModels: [textChild, setChild] };

          // setModel returns a Promise in AG-Grid 35; we don't await
          // it because AG-Grid fires onFilterChanged internally once
          // the model lands. Calling it again here is redundant but
          // harmless and keeps the row model fresh on the very next
          // tick if AG-Grid skipped its internal call (defensive).
          const result = multi.setModel(nextModel);
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            (result as Promise<unknown>).then(() => apiRef.current.onFilterChanged());
          } else {
            apiRef.current.onFilterChanged();
          }
        });
      },
      [props],
    );

    return (
      <div
        className="ag-floating-filter-input"
        role="presentation"
        data-testid="gc-multi-text-floating-filter"
      >
        <div className="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper">
          <input
            type="text"
            className="ag-input-field-input ag-text-field-input"
            value={value}
            onChange={handleChange}
            // Match AG-Grid's accessibility on the built-in floating
            // filter so screen readers don't notice the swap.
            aria-label="Filter"
          />
        </div>
      </div>
    );
  },
);

MultiTextFloatingFilter.displayName = 'MultiTextFloatingFilter';
