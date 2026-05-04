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

/** Minimal interface we lean on from the parent filter instance. */
interface MultiFilterInstance {
  /** AG-Grid 35: returns the child filter at index `idx`, or undefined. */
  getChildFilterInstance?: (idx: number) => unknown;
}

/** Minimal interface we lean on from the child text filter instance. */
interface TextFilterInstance {
  setModel?: (model: TextFilterModel | null) => void | Promise<unknown>;
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

        // Reach into the multi-filter and update the first child
        // (text filter) model directly. Skipping AG-Grid's broken
        // wrapper means we have to call onFilterChanged ourselves so
        // the row model re-evaluates.
        props.parentFilterInstance((instance) => {
          const multi = instance as unknown as MultiFilterInstance;
          const child = multi.getChildFilterInstance?.(0);
          if (!child) return;
          const text = child as TextFilterInstance;
          if (next === '') {
            // Empty string clears the text filter. Pass null so
            // AG-Grid drops the model entry entirely (matches what
            // the built-in floating filter does on full clear).
            text.setModel?.(null);
          } else {
            text.setModel?.({
              filterType: 'text',
              // Keep `type: 'contains'` here — the multi-filter's
              // text child defaults to contains semantics in
              // AG-Grid 35; preserving it across keystrokes keeps
              // the popup filter UI in sync. If the user changes
              // the text filter's `type` from the popup, our next
              // `onParentModelChanged` will refresh and subsequent
              // edits will keep using the configured type by way
              // of the popup's own model update flow.
              type: 'contains',
              filter: next,
            });
          }
          apiRef.current.onFilterChanged();
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
