# Conditional Styling — 13 rules covering every feature

This tab seeds **13 rules** under `Tools → Style Rules`, each named for
the conditional-styling feature it demonstrates. Click any rule in the
list to open the editor and see its configuration.

## 9 foundational rules (1 – 9)

| # | Rule | Feature exercised |
| --- | --- | --- |
| 1 | Cell color rule (winners) | `value > 0` on `dailyPnL`, `unrealizedPnL` — emerald bg/text |
| 2 | Cell color rule (losers) | `value < 0` — rose bg/text |
| 3 | One-shot flash on big tick | `value > 0.02 \|\| value < -0.02` on `priceChangePct`, sky `oneShot` 500 ms |
| 4 | Pulse flash while in alarm | `value > 8` on `yieldToWorst`, **`pulse` mode** — animates continuously while matched, on cells+headers |
| 5 | Row-level rule | `scope: { type: 'row' }`, junk ratings tint whole row |
| 6 | Indicator on text col | `data.callable == true` — `bell` icon `top-right` (text is left-aligned, indicator opposite) |
| 7 | Indicator bottom-left + header | wide spread — `alert-triangle` on cells+headers |
| 8 | Headers-only indicator | `trending-down` painted on the YTD column header when ANY cell in the column is negative |
| 9 | activeDurationMs window | `value > 102` on `midPrice` — style applies for 1.5 s after every change, then reverts until the next match |

## 4 diff-aware rules (10 – 13) — `column.old` / `column.new`

These rules read the **previous** and **current** value of a column via
the diff syntax. The runtime tracks per-cell value history and exposes
`[colId.old]` / `[colId.new]` to expressions. Combined with
`activeDurationMs`, the styling appears only for a brief window after
a tick.

| # | Rule | Expression | Window |
| --- | --- | --- | --- |
| 10 | **Diff up** | `[midPrice.new] > [midPrice.old]` | 1.5 s — emerald bg + `arrow-up` indicator + sky flash |
| 11 | **Diff down** | `[midPrice.new] < [midPrice.old]` | 1.5 s — rose bg + `arrow-down` indicator + rose flash |
| 12 | **Big tick** | `ABS([midPrice.new] - [midPrice.old]) > 0.05` on bid/mid/ask | 2.5 s — amber bg, `zap` indicator on cells+headers, amber flash |
| 13 | **Yield direction** | `[yieldToMaturity.new] != [yieldToMaturity.old]` | 600 ms — sky flash on cells+headers |

### How `[col.old]` / `[col.new]` works

The conditional-styling runtime maintains a per-cell diff cache keyed
by `(api, node, colId)`. When AG-Grid fires `cellValueChanged`, the
runtime upserts the change into the cache. At expression evaluation
time, the cache is overlaid onto the `columns` context so
`[midPrice.old]` returns the previous tick and `[midPrice.new]` returns
the current one.

Pair with `activeDurationMs`:
```ts
{
  expression: '[midPrice.new] > [midPrice.old]',
  style: { dark: { backgroundColor: '#0f2b1c', color: '#7fdf9b' } },
  activeDurationMs: 1500,
}
```
→ Cell turns green for 1.5 s every time the mid price ticks up.
Without `activeDurationMs`, the rule would only highlight the single
render where `new > old`; with it, the engine keeps the rule "active"
on this cell for 1.5 s, then the style automatically reverts.

## Indicator placement convention

Every indicator sits on the **opposite** side of the column's content
alignment so the badge never covers the value:

- numeric columns (right-aligned) → indicator on the **LEFT**
- text columns (left-aligned)     → indicator on the **RIGHT**

## Where each feature lives

| Feature | Field on `ConditionalRule` | Source |
| --- | --- | --- |
| Cell color | `style.dark` / `style.light` | `CellStyleProperties` |
| Flash | `flash: { enabled, target, mode, color, durationMs }` | `FlashConfig` |
| Indicators | `indicator: { icon, position, target, color }` | `RuleIndicator` |
| Active window | `activeDurationMs` | top-level on `ConditionalRule` |
| Row scope | `scope: { type: 'row' }` | `RuleScope` |
| Cell scope | `scope: { type: 'cell', columns: [...] }` | `RuleScope` |
| Header surfaces | `flash.target = 'headers'`/`'cells+headers'`; `indicator.target` likewise | |
| Diff refs | `[colId.old]`, `[colId.new]` in `expression` | runtime DiffCache |

## Persistence

Edit any rule, click **Save** on the toolbar → snapshot written through
`handle.saveAll()` to the active profile. Reload restores your edits.

Seed lives in
[src/seeds/conditionalStyling.ts](src/seeds/conditionalStyling.ts).
Remove `localStorage.lab-seeded:lab-conditional-v6` (or bump the
gridId) to re-seed.
