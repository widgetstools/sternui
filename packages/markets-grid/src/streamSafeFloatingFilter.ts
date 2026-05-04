import type {
  IFloatingFilterComp,
  IFloatingFilterParams,
} from 'ag-grid-community';

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

  init(params: IFloatingFilterParams): void {
    this.params = params;
    this.debounceMs = ((params as unknown as { debounceMs?: number }).debounceMs) ?? 250;

    // Outer container — AG-Grid styles `.ag-floating-filter-input` to fill
    // the floating-filter cell. Adding `.ag-text-field` + `.ag-input-field`
    // pulls in the same border/padding/typography as the default.
    this.eGui = document.createElement('div');
    this.eGui.className = 'ag-floating-filter-input ag-text-field ag-input-field';

    // Inner wrapper hosts the input + clear button. Position relative so
    // the clear button can position absolutely against it.
    const wrapper = document.createElement('div');
    wrapper.className = 'ag-wrapper ag-input-wrapper ag-text-field-input-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Filter (comma-separated)...';
    this.input.className = 'ag-input-field-input ag-text-field-input';
    this.input.style.width = '100%';
    this.input.style.height = '100%';
    this.input.style.boxSizing = 'border-box';
    this.input.style.paddingRight = '20px'; // room for the clear button
    this.input.addEventListener('input', this.onInput);
    wrapper.appendChild(this.input);

    // Clear button — pure unicode glyph, theme-neutral. Hidden until the
    // input has a value. Sits flush with the input's right edge.
    this.clearBtn = document.createElement('button');
    this.clearBtn.type = 'button';
    this.clearBtn.setAttribute('aria-label', 'Clear filter');
    this.clearBtn.title = 'Clear filter';
    this.clearBtn.textContent = '✕';
    this.clearBtn.style.display = 'none';
    this.clearBtn.style.position = 'absolute';
    this.clearBtn.style.right = '4px';
    this.clearBtn.style.top = '50%';
    this.clearBtn.style.transform = 'translateY(-50%)';
    this.clearBtn.style.padding = '0';
    this.clearBtn.style.width = '14px';
    this.clearBtn.style.height = '14px';
    this.clearBtn.style.lineHeight = '14px';
    this.clearBtn.style.fontSize = '11px';
    this.clearBtn.style.background = 'transparent';
    this.clearBtn.style.border = 'none';
    this.clearBtn.style.color = 'currentColor';
    this.clearBtn.style.opacity = '0.55';
    this.clearBtn.style.cursor = 'pointer';
    this.clearBtn.addEventListener('mouseenter', () => { this.clearBtn.style.opacity = '1'; });
    this.clearBtn.addEventListener('mouseleave', () => { this.clearBtn.style.opacity = '0.55'; });
    // Use mousedown so focus doesn't leave the input before our handler
    // runs — keeps the focus-aware-clobber-skip in onParentModelChanged
    // consistent if the clear triggers a model change while focused.
    this.clearBtn.addEventListener('mousedown', this.onClearMouseDown);
    wrapper.appendChild(this.clearBtn);

    this.eGui.appendChild(wrapper);
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
    this.syncClearVisibility();
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
    this.syncClearVisibility();
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
    this.syncClearVisibility();
    this.applyValue('');
    this.input.focus();
  };

  private syncClearVisibility(): void {
    this.clearBtn.style.display = this.input.value === '' ? 'none' : 'inline-block';
  }

  /**
   * Push the user's typed value into the parent filter. Tokenize on
   * comma; build a compound OR model for 2+ tokens. Single-token /
   * empty paths use AG-Grid's `onFloatingFilterChanged` so the simple
   * popup filter UI stays in sync.
   */
  private applyValue(rawValue: string): void {
    const tokens = rawValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');

    this.params.parentFilterInstance((parent) => {
      const p = parent as unknown as {
        getFilterType?: () => string;
        onFloatingFilterChanged?: (type: string | null, value: string | null) => void;
        setModel?: (m: unknown) => void;
      };
      const filterType = (typeof p.getFilterType === 'function' ? p.getFilterType() : 'text') ?? 'text';
      const isNumber = filterType === 'number';

      // Operator semantics:
      //   - Single token: substring match (`contains` for text, `equals`
      //     for number — number filter has no `contains`).
      //   - Multiple comma-separated tokens: exact match per token,
      //     OR'd together. The comma is the user's signal that they
      //     want a curated set of values, not a fuzzy search.
      const singleOp = isNumber ? 'equals' : 'contains';
      const multiOp = 'equals';

      // Empty → clear
      if (tokens.length === 0) {
        if (typeof p.onFloatingFilterChanged === 'function') {
          p.onFloatingFilterChanged(null, null);
        } else {
          p.setModel?.(null);
        }
        return;
      }

      // Single token → simple model, keeps popup filter UI in sync.
      if (tokens.length === 1) {
        const v = tokens[0];
        if (typeof p.onFloatingFilterChanged === 'function') {
          // For numbers, AG-Grid coerces the value internally.
          p.onFloatingFilterChanged(singleOp, v);
        } else {
          p.setModel?.({
            filterType,
            type: singleOp,
            filter: isNumber ? this.toNumber(v) : v,
          });
        }
        return;
      }

      // Multi-token → compound OR with EXACT match per token. For
      // numbers, drop tokens that don't parse as finite numbers (typing
      // a list of mixed values shouldn't crash the filter; just ignore
      // the non-numeric ones).
      const usableTokens = isNumber
        ? tokens.filter((t) => Number.isFinite(this.toNumber(t)))
        : tokens;
      if (usableTokens.length === 0) {
        p.setModel?.(null);
        return;
      }
      if (usableTokens.length === 1) {
        const v = usableTokens[0];
        p.setModel?.({
          filterType,
          type: multiOp,
          filter: isNumber ? this.toNumber(v) : v,
        });
        return;
      }
      const conditions = usableTokens.map((t) => ({
        filterType,
        type: multiOp,
        filter: isNumber ? this.toNumber(t) : t,
      }));
      p.setModel?.({
        filterType,
        operator: 'OR',
        conditions,
      });
    });
  }

  private toNumber(s: string): number {
    return Number(s);
  }

  /**
   * Best-effort string rendering of the current applied model — for
   * displaying the active filter when the input doesn't have focus.
   * Compound models stringify back to their token list so a user re-
   * focusing sees what they typed.
   */
  private stringifyModel(model: unknown): string {
    if (typeof model === 'string') return model;
    if (model && typeof model === 'object') {
      const m = model as {
        filter?: unknown;
        operator?: string;
        conditions?: Array<{ filter?: unknown }>;
        values?: unknown[];
      };
      if (Array.isArray(m.conditions) && m.conditions.length > 0) {
        return m.conditions
          .map((c) => (c.filter == null ? '' : String(c.filter)))
          .filter((s) => s !== '')
          .join(', ');
      }
      if (typeof m.filter === 'string') return m.filter;
      if (typeof m.filter === 'number') return String(m.filter);
      if (Array.isArray(m.values)) return m.values.join(', ');
    }
    return '';
  }
}
