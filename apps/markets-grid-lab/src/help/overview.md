# Overview — kitchen-sink

This tab is **pre-seeded** with state from every major MarketsGrid module so
you can see the full surface working on a single grid. The seed runs once
on first mount (flag stored in `localStorage` under `lab-seeded:lab-overview-v3`)
and is written through to the active profile via `handle.saveAll()` —
**reload and everything persists**.

## What's seeded (exactly)

### Conditional Styling — 6 rules
Open `Tools → Style Rules` to see them. Each rule's name in the list
matches the bullet below.

| Rule | Where it fires | Style | Flash | Indicator |
| --- | --- | --- | --- | --- |
| **Losers** | `[value] < 0` on `dailyPnL`, `unrealizedPnL`, `mtdPnL`, `ytdPnL` | bold rose text | one-shot rose 700 ms on cells | `arrow-down`, top-right, cells |
| **Winners** | `[value] > 0` on same P&L columns | bold emerald text | one-shot emerald 700 ms | `arrow-up`, top-right, cells |
| **High-yield watch** | `[value] > 8` on yields | amber bg + text | **pulse amber 1.4 s on cells + headers** | `flame`, top-left, cells + headers |
| **Wide bid/ask** | `([askPrice] - [bidPrice]) > 0.10` | amber bg | (none) | `alert-triangle`, bottom-right, cells |
| **Junk-rated row** | `[compositeRating] in ['BB+', …, 'CCC']` | **row scope** — whole row tinted | (none) | (none) |
| **Price changed** | `[value] != null` on bid/mid/ask/last | (no persistent style) | sky 500 ms on every tick + `activeDurationMs: 500` | (none) |

### Calculated Columns — 4 virtual columns
Module-driven; expressions live on the profile. Open `Tools → Calculated
Columns` to edit. Re-evaluated whenever any input field ticks.

- **P&L Total** — `[dailyPnL] + [mtdPnL] + [ytdPnL]`, signed currency.
- **Carry/Risk** — `IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)`, 2-dp number.
- **Dollar Dur** — `[marketValue] * [modifiedDuration] / 100`, currency.
- **B/A bps (calc)** — `([askPrice] - [bidPrice]) * 100`, 2-dp number.

### Column Groups — 8 nested headers
Open `Tools → Column Groups`. Pricing + P&L start **open**; the others
start closed. Each carries a `marryChildren` toggle on Identifier. Children
marked `columnGroupShow: 'open'` only show when the group is expanded.

### Column Customization — formatter presets
Bid/mid/ask render at 3 decimal places, yields render as percent, P&L
renders as **signed currency**, OAS renders with a `bps` suffix via Excel
format, maturity renders ISO. Edit any column under `Tools → Column
Settings`.

### General Settings — cell flash
`cellFlashDuration: 700` ms · `cellFadeDuration: 1400` ms. Combined with
`enableCellChangeFlash: true` on `defaultColDef`, every ticked cell flashes.

## Where the seed code lives

- [src/seeds/conditionalStyling.ts](src/seeds/conditionalStyling.ts)
- [src/seeds/calculatedColumns.ts](src/seeds/calculatedColumns.ts)
- [src/seeds/columnGroups.ts](src/seeds/columnGroups.ts)
- [src/seeds/columnCustomization.ts](src/seeds/columnCustomization.ts)
- [src/seeds/generalSettings.ts](src/seeds/generalSettings.ts)
- [src/data/useSeed.ts](src/data/useSeed.ts) — the hook that writes seeds
  into the platform store on `onReady`.

## Try this

1. Click the **gear icon** (Tools) on the toolbar → **Style Rules** → see
   the 6 rules listed. Toggle one off and watch the cells re-paint.
2. Find a junk-rated row (composite rating BB+/BB/etc.) — the entire row
   is tinted red.
3. Drag a column header — flashing follows the cell to its new position.
4. Reload the page — everything you see persists because the seed wrote
   through to the active profile.
