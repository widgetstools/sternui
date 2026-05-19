import type {
  IFloatingFilterComp,
  IFloatingFilterParams,
} from 'ag-grid-community';
import { buildFloatingFilterDom } from './streamSafeFloatingFilterDom';

/**
 * Focus-aware floating filter with clear-button + comma-token OR matching.
 *
 * **Three responsibilities.**
 *
 * 1. **Streaming-data clobber defense.** AG-Grid Enterprise's
 *    `agMultiColumnFilter` floating-filter delegate calls
 *    `onParentModelChanged` on its first sub-filter's floating filter
 *    every time the parent's `onModelAsStringChange` event fires. The
 *    set sub-filter dispatches that event from its
 *    `syncAfterDataChange → updateAvailableKeys` path on every
 *    `applyTransactionAsync` tick — even when the *applied* model
 *    didn't change, only the discoverable values list. The default
 *    text floating filter's setValue(model) clobbers in-progress user
 *    input. We skip the write when the input has focus.
 *
 * 2. **Clear button.** A small ✕ button sits inside the input
 *    wrapper's right edge. It appears only when the input has a value
 *    and clicking it clears both the input and the underlying filter.
 *
 * 3. **Comma-token OR matching.** Typing `aaa,bbb,ccc` filters rows
 *    whose value contains ANY of those tokens. Implemented via
 *    AG-Grid's compound filter model
 *    (`{filterType, operator: 'OR', conditions: [...]}`) when 2+ non-
 *    empty tokens are present. Single token uses the simple model so
 *    the popup filter UI stays in sync. Whitespace around tokens is
 *    trimmed; empty tokens (e.g. trailing comma) are dropped.
 *
 * **DOM shape.** Matches AG-Grid 35.x's default text floating filter so
 * theme rules apply unchanged: `.ag-floating-filter-input` outer,
 * `.ag-input-wrapper` inner, `.ag-input-field-input.ag-text-field-input`
 * on the `<input>`. The clear button uses absolute positioning inside
 * the wrapper so it doesn't disturb input height — height matches the
 * default exactly.
 *
 * **Registered as `streamSafeText`** in `gridOptions.components` (see
 * `MarketsGrid.tsx`). Auto-applied to text/number sub-filters of
 * `agMultiColumnFilter` in `applyFilterConfigToColDef`. Set sub-filters
 * keep their built-in (read-only) floating filter — no clobber risk
 * there, and no typing affordance to add.
 */
export class StreamSafeTextFloatingFilter implements IFloatingFilterComp {
  private eGui!: HTMLDivElement;
  private input!: HTMLInputElement;
  private clearBtn!: HTMLButtonElement;
  private params!: IFloatingFilterParams;
  private debounceMs = 250;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private syncClearVisibilityFn!: () => void;

  init(params: IFloatingFilterParams): void {
    this.params = params;
    this.debounceMs = ((params as unknown as { debounceMs?: number }).debounceMs) ?? 250;
    const dom = buildFloatingFilterDom({
      placeholder: 'Filter (comma-separated)...',
      onInput: this.onInput,
      onClearMouseDown: this.onClearMouseDown,
    });
    this.eGui = dom.eGui;
    this.input = dom.input;
    this.clearBtn = dom.clearBtn;
    this.syncClearVisibilityFn = dom.syncClearVisibility;
  }

  /**
   * Called by AG-Grid when the underlying filter model changes. Skip
   * the write while the input has focus so user typing isn't clobbered
   * by mid-stream `applyTransactionAsync` cascades. Sync clear-button
   * visibility too — the input's value drives whether ✕ is visible.
   */
  onParentModelChanged(parentModel: unknown): void {
    if (document.activeElement === this.input) return;
    this.input.value = parentModel == null ? '' : this.stringifyModel(parentModel);
    this.syncClearVisibilityFn();
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  destroy(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.input.removeEventListener('input', this.onInput);
    this.clearBtn.removeEventListener('mousedown', this.onClearMouseDown);
  }

  private onInput = (): void => {
    this.syncClearVisibilityFn();
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.applyValue(this.input.value);
    }, this.debounceMs);
  };

  private onClearMouseDown = (e: MouseEvent): void => {
    // Prevent the button from stealing focus (would break our focus-aware
    // skip in onParentModelChanged the next time data ticks).
    e.preventDefault();
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.input.value = '';
    this.syncClearVisibilityFn();
    this.applyValue('');
    this.input.focus();
  };

  /**
   * Push the user's typed value into the parent filter.
   *
   *   0 tokens     → clear all sub-filter slots (no filter applied)
   *   1 token      → text sub-filter `contains` (fuzzy substring search)
   *   2+ tokens    → set sub-filter `values: [...]` (exact-match list)
   *
   * Why set-filter for multi-token. The popup UI for compound text
   * conditions ("equals aaa OR equals bb OR equals cc …") gets unwieldy
   * at 3+ values. Set-filter naturally renders a checkbox list of
   * selected values — same applied behaviour, much cleaner popup. When
   * the column's multi-filter doesn't include a set sub-filter, fall
   * back to compound text (capped at `maxNumConditions` from the
   * filter's params; we lift that cap in the column-customization
   * transform layer).
   *
   * For standalone (non-multi) text columns, multi-token still uses
   * compound text — there's no set sub-filter to delegate to.
   */
  private applyValue(rawValue: string): void {
    const tokens = rawValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');

    const col = (this.params as unknown as {
      column?: {
        getColId?: () => string;
        getColDef?: () => {
          filter?: unknown;
          filterParams?: { filters?: Array<{ filter?: string }> };
        };
      };
    }).column;
    const colId = col?.getColId?.();
    const colDef = col?.getColDef?.();
    const colFilter = colDef?.filter;
    const isInsideMulti = colFilter === 'agMultiColumnFilter';
    const subFilters = colDef?.filterParams?.filters ?? [];
    const setIdx = isInsideMulti
      ? subFilters.findIndex((f) => f?.filter === 'agSetColumnFilter')
      : -1;
    const textIdxInDef = isInsideMulti
      ? subFilters.findIndex(
          (f) => f?.filter === 'agTextColumnFilter' || f?.filter === 'agNumberColumnFilter',
        )
      : -1;
    const hasSetSubFilter = setIdx >= 0;

    const api = (this.params as unknown as {
      api?: {
        setColumnFilterModel?: (col: string, model: unknown) => Promise<void> | void;
        getColumnFilterModel?: <T = unknown>(col: string) => T | null | undefined;
        onFilterChanged?: () => void;
      };
    }).api;

    // Helper: push a fully-built column-level model via the
    // recommended v34+ api and trigger filterChanged.
    const pushColumnModel = (model: unknown) => {
      if (!api?.setColumnFilterModel || !colId) {
        // Last-resort fallback to the deprecated path so older grids
        // still work — should never run in our v35 stack.
        this.params.parentFilterInstance((parent) => {
          (parent as unknown as { setModel?: (m: unknown) => void }).setModel?.(model);
        });
        return;
      }
      const result = api.setColumnFilterModel(colId, model);
      const trigger = () => api.onFilterChanged?.();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).then(trigger);
      } else {
        trigger();
      }
    };

    // Build a multi-filter envelope with sub-filter slots set per the
    // colDef order. Slots not provided are left null (= no filter).
    const buildMultiEnvelope = (entries: Record<number, unknown>): unknown => {
      const filterModels: unknown[] = [];
      for (let i = 0; i < subFilters.length; i++) {
        filterModels[i] = entries[i] ?? null;
      }
      return { filterType: 'multi', filterModels };
    };

    // ── 0 tokens → clear everything ───────────────────────────────
    if (tokens.length === 0) {
      if (isInsideMulti) {
        pushColumnModel(buildMultiEnvelope({}));
      } else {
        this.params.parentFilterInstance((parent) => {
          const p = parent as unknown as {
            onFloatingFilterChanged?: (type: string | null, value: string | null) => void;
            setModel?: (m: unknown) => void;
          };
          if (typeof p.onFloatingFilterChanged === 'function') {
            p.onFloatingFilterChanged(null, null);
          } else {
            p.setModel?.(null);
          }
        });
      }
      return;
    }

    // ── 1 token → text/number sub-filter `contains`/`equals` ──────
    if (tokens.length === 1) {
      const v = tokens[0];
      if (isInsideMulti) {
        // Determine text vs number from the colDef sub-filter slot.
        const textSubFilter = textIdxInDef >= 0 ? subFilters[textIdxInDef] : undefined;
        const isNumberSub = textSubFilter?.filter === 'agNumberColumnFilter';
        const filterTypeStr = isNumberSub ? 'number' : 'text';
        const op = isNumberSub ? 'equals' : 'contains';
        const filterValue = isNumberSub ? this.toNumber(v) : v;
        const slotModel = { filterType: filterTypeStr, type: op, filter: filterValue };
        // Clear set slot, plant text/number slot.
        pushColumnModel(buildMultiEnvelope({
          [textIdxInDef >= 0 ? textIdxInDef : 0]: slotModel,
        }));
      } else {
        this.params.parentFilterInstance((parent) => {
          const p = parent as unknown as {
            getFilterType?: () => string;
            onFloatingFilterChanged?: (type: string | null, value: string | null) => void;
            setModel?: (m: unknown) => void;
          };
          const filterType = (typeof p.getFilterType === 'function' ? p.getFilterType() : 'text') ?? 'text';
          const singleOp = filterType === 'number' ? 'equals' : 'contains';
          if (typeof p.onFloatingFilterChanged === 'function') {
            p.onFloatingFilterChanged(singleOp, v);
          } else {
            p.setModel?.({
              filterType,
              type: singleOp,
              filter: filterType === 'number' ? this.toNumber(v) : v,
            });
          }
        });
      }
      return;
    }

    // ── 2+ tokens ─────────────────────────────────────────────────
    // Preferred path: set sub-filter `values: [...]`. Cleaner popup,
    // no maxNumConditions cap, exact-match semantics built in.
    if (isInsideMulti && hasSetSubFilter) {
      const setModel = { filterType: 'set', values: tokens };
      // Plant set slot, clear text slot (so the popup doesn't show
      // a stale text condition while the set is the active filter).
      pushColumnModel(buildMultiEnvelope({ [setIdx]: setModel }));
      return;
    }

    // Fallback: compound text. Used when the multi has no set sub-
    // filter, or when the column is a standalone text filter (no
    // multi wrapper). maxNumConditions auto-lifted in transforms.
    const conditions = tokens.map((t) => ({
      filterType: 'text' as const,
      type: 'equals' as const,
      filter: t,
    }));
    const compoundTextModel: Record<string, unknown> = {
      filterType: 'text',
      operator: 'OR',
      conditions,
    };
    if (isInsideMulti) {
      pushColumnModel(buildMultiEnvelope({
        [textIdxInDef >= 0 ? textIdxInDef : 0]: compoundTextModel,
      }));
    } else {
      pushColumnModel(compoundTextModel);
    }
  }

  private toNumber(s: string): number {
    return Number(s);
  }

  /**
   * Best-effort string rendering of the current applied model — for
   * displaying the active filter when the input doesn't have focus.
   * Handles the column-level multi shape (`{filterType: 'multi',
   * filterModels: [...]}`) by walking sub-filter slots and rendering
   * the first non-null one. Set sub-filter values render as a token
   * list so re-focusing the input shows what the user originally
   * typed; text/number conditions render the same way.
   */
  private stringifyModel(model: unknown): string {
    if (typeof model === 'string') return model;
    if (model && typeof model === 'object') {
      const m = model as {
        filterType?: string;
        filterModels?: unknown[];
        filter?: unknown;
        operator?: string;
        conditions?: Array<{ filter?: unknown }>;
        values?: unknown[];
      };
      // Column-level mounting on agMultiColumnFilter: walk sub-filter
      // slots and render the first non-null model.
      if (m.filterType === 'multi' && Array.isArray(m.filterModels)) {
        for (const sub of m.filterModels) {
          if (sub == null) continue;
          const s = this.stringifyModel(sub);
          if (s) return s;
        }
        return '';
      }
      if (Array.isArray(m.values)) return m.values.join(', ');
      if (Array.isArray(m.conditions) && m.conditions.length > 0) {
        return m.conditions
          .map((c) => (c.filter == null ? '' : String(c.filter)))
          .filter((s) => s !== '')
          .join(', ');
      }
      if (typeof m.filter === 'string') return m.filter;
      if (typeof m.filter === 'number') return String(m.filter);
    }
    return '';
  }
}
