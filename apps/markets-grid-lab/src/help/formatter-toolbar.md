# Formatter Toolbar — paint cell style live

The **FormattingToolbar** is a draggable floating palette wired by
`<MarketsGrid showFormattingToolbar />`. Click any column header to
"focus" that column, then use the toolbar to paint typography, colors,
borders, alignment, and number/date formats. Edits flow into the
**column-customization** module slice of the active profile.

## Toolbar surfaces

The toolbar exposes these surfaces (from left to right on the floating
strip):

- **Typography** — Bold · Italic · Underline · Strike · Font size.
- **Alignment** — Horizontal (left / center / right) · Vertical (top /
  middle / bottom).
- **Colors** — Cell text + cell background + header text + header
  background, each with a theme-aware swatch picker that writes BOTH
  dark and light values.
- **Borders** — Per-side (top / right / bottom / left) + all-sides
  shortcut + clear; each side carries width, color, and style
  (`solid`/`dashed`/`dotted`).
- **Format** — Currency · Percent · Number · Date · Tick (bond 32nds)
  presets, plus an Excel format-string input. Same
  `ValueFormatterTemplate` union the Formatting tab seeds.
- **Clear** — Removes every override on the focused column in one
  click.

## How it persists

```tsx
<MarketsGrid showFormattingToolbar … />
```

Internally the toolbar calls `useFormatter()` (a hook from
`@starui/grid/customizer`) which dispatches to the
`column-customization` store. The toolbar visibility itself rides the
`toolbar-visibility` module — collapse it via the chevron button and
the choice persists per profile.

## Popout

Click the popout icon on the toolbar to detach it into its own browser
window. Useful when you want the palette beside the grid but never
floating over it. The detach handle is built on `DraggableFloat` +
`PoppableHandle` from `@starui/grid`.

## Try this

1. Click the **CUSIP** header (focuses that column).
2. Pick a red swatch under **Colors → Cell background**.
3. Note the colour also appears in the light-mode swatch slot — the
   toolbar writes both themes; check by flipping dark/light.
4. Open `Tools → Column Settings → CUSIP → Cell` — your colour appears
   under the override editor as **data**, not a one-off style.
5. Click **Save** on the main toolbar → reload → CUSIP stays painted.

## Where this is wired

- [src/tabs/FormatterToolbarTab.tsx](src/tabs/FormatterToolbarTab.tsx) —
  just `<MarketsGrid showFormattingToolbar />` with the wide column
  set, no seed.
- The toolbar itself: [`@starui/grid` `FormattingToolbar`
  export](../../packages/react-grid/grid/src/widget/FormattingToolbar.tsx).
