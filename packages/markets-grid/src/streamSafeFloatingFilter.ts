import type {
  IFloatingFilterComp,
  IFloatingFilterParams,
} from 'ag-grid-community';

/**
 * Focus-aware text/number floating filter component.
 *
 * **The problem this solves.** AG-Grid Enterprise's `agMultiColumnFilter`
 * floating-filter delegate calls `onParentModelChanged` on its first
 * sub-filter's floating filter every time the parent's
 * `onModelAsStringChange` event fires. The set sub-filter dispatches that
 * event from its `syncAfterDataChange → updateAvailableKeys` path on
 * every `applyTransactionAsync` tick — even when the *applied* model
 * didn't change, only the discoverable values list. The default text
 * floating filter unconditionally writes `params.value` into its input
 * via `setValue(model)`, which clobbers whatever the user is typing.
 *
 * **What this does.** Implements the same default text floating-filter
 * surface, but skips the write when the input element has focus. As soon
 * as focus leaves, normal sync resumes — so the user's typing is never
 * stomped, but the input still reflects the applied model when it
 * isn't being edited. AG-Grid 32+ guidance for custom floating filters:
 * https://www.ag-grid.com/react-data-grid/component-floating-filter/
 *
 * **Registered as `streamSafeText`** in `gridOptions.components` (see
 * `MarketsGrid.tsx`). To use, set
 * `colDef.floatingFilterComponent = 'streamSafeText'`, OR set
 * `floatingFilterComponent: 'streamSafeText'` on a sub-filter entry
 * inside `agMultiColumnFilter.filterParams.filters[]`. The transform
 * layer auto-plants this for text/number sub-filters of multi-column
 * filters in `applyFilterConfigToColDef` (see column-customization).
 */
export class StreamSafeTextFloatingFilter implements IFloatingFilterComp {
  private eGui!: HTMLDivElement;
  private input!: HTMLInputElement;
  private params!: IFloatingFilterParams;
  private debounceMs = 250;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  init(params: IFloatingFilterParams): void {
    this.params = params;
    // `debounceMs` rides through filterParams (AG-Grid forwards it to the
    // floating filter for any filter kind). Cast — IFloatingFilterParams
    // omits it from its public type because it's filter-kind-specific.
    this.debounceMs = ((params as unknown as { debounceMs?: number }).debounceMs) ?? 250;

    this.eGui = document.createElement('div');
    this.eGui.className = 'ag-floating-filter-input';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Filter...';
    this.input.className = 'ag-input-field-input ag-text-field-input';
    this.input.style.width = '100%';
    this.input.style.height = '100%';
    this.input.style.boxSizing = 'border-box';

    this.input.addEventListener('input', this.onInput);
    this.eGui.appendChild(this.input);
  }

  /**
   * Called by AG-Grid when the underlying filter model changes. The
   * default implementation is `this.input.value = stringify(model)` —
   * which clobbers user input mid-typing. Skip the write when our input
   * holds focus; the user's in-progress edit wins until they blur.
   */
  onParentModelChanged(parentModel: unknown): void {
    if (document.activeElement === this.input) return;
    this.input.value = parentModel == null ? '' : this.stringifyModel(parentModel);
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  destroy(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.input.removeEventListener('input', this.onInput);
  }

  private onInput = (): void => {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.applyValue(this.input.value);
    }, this.debounceMs);
  };

  /**
   * Push the user's typed value into the parent filter. AG-Grid's
   * `IProvidedFilter.onFloatingFilterChanged(type, value)` accepts a
   * floating-filter style update, applies the model internally, and
   * fires `filterChanged` so the grid re-filters. Used in preference
   * to `setModel` so the parent owns model construction (handles
   * v35 model-shape upgrades automatically).
   */
  private applyValue(value: string): void {
    const trimmed = value.trim();
    this.params.parentFilterInstance((parent) => {
      const p = parent as unknown as {
        onFloatingFilterChanged?: (type: string | null, value: string | null) => void;
        setModel?: (m: unknown) => void;
      };
      if (typeof p.onFloatingFilterChanged === 'function') {
        p.onFloatingFilterChanged('contains', trimmed === '' ? null : trimmed);
        return;
      }
      // Fallback for filters that don't implement onFloatingFilterChanged.
      // setModel is sync in v35, but the grid still emits filterChanged.
      const model = trimmed === ''
        ? null
        : { filterType: 'text', type: 'contains', filter: trimmed };
      p.setModel?.(model);
    });
  }

  /** Best-effort string rendering of the current applied model. */
  private stringifyModel(model: unknown): string {
    if (typeof model === 'string') return model;
    if (model && typeof model === 'object') {
      const m = model as { filter?: unknown; values?: unknown[] };
      if (typeof m.filter === 'string') return m.filter;
      if (typeof m.filter === 'number') return String(m.filter);
      if (Array.isArray(m.values)) return m.values.join(', ');
    }
    return '';
  }
}
