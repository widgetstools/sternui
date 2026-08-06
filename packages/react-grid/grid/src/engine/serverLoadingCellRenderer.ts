/**
 * A stub cell is a SKELETON, not a blank — and not the word "Loading...".
 *
 * Under the server row model AG commits a scroll immediately and paints a stub
 * for every row whose block has not arrived. What that stub looks like is a
 * correctness question on a blotter, not a cosmetic one, and this renderer has
 * been wrong in both directions:
 *
 *   - AG's default writes **"Loading..."** into the cell. On a book scrolled
 *     continuously that is a word flickering down the leftmost column on every
 *     drag — noise, and it only appears in one column.
 *   - So it was made **blank**, on the reasoning that "this window does not hold
 *     the book, so blank is the only honest stub". That reasoning is wrong. An
 *     empty cell is exactly how this grid renders a genuine null, so a stub is
 *     indistinguishable from "this position has no bid". A trader reading a
 *     blank price cell on a live blotter has no way to tell "not fetched yet"
 *     from "the value is gone", and the second one is alarming.
 *
 * A muted bar is unambiguous: nothing in the book renders as a grey rectangle,
 * so it can only mean "not here yet". It is drawn from `currentColor` at low
 * opacity rather than any palette value, so it themes with the cell in both
 * light and dark without reaching for a token the grid package does not own.
 *
 * Imperative rather than a function component: AG frequently creates the stub
 * before `rowIndex` is assigned, and a functional cell that returns once would
 * never repaint.
 *
 * **This renderer does nothing on its own, which is how it shipped inert the
 * first time.** AG's server row model paints a FULL-WIDTH loading row — a
 * spinner and the word "Loading..." spanning the whole row — and reaches for
 * the colDef `loadingCellRenderer` ONLY when
 * `suppressServerSideFullWidthLoadingRow` is set. Setting the renderer without
 * that flag changes nothing visible, which is exactly what happened. Every
 * surface using this must set the flag too.
 *
 * Shared by every server-side surface rather than copied onto each: the reasoning
 * above is identical whichever engine supplies the rows, and a second copy is
 * the thing that ends up fixed once.
 */
export class SkeletonLoadingCellRenderer {
  private readonly eGui: HTMLElement;

  constructor() {
    this.eGui = document.createElement('span');
    this.eGui.className = 'starui-loading-cell';
    this.eGui.setAttribute('aria-label', 'loading');
    this.eGui.style.cssText =
      'display:inline-block;width:62%;height:0.7em;border-radius:2px;' +
      'background:currentColor;opacity:0.15;vertical-align:middle';
  }

  init(): void {}

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(): boolean {
    return true;
  }

  destroy(): void {}
}
