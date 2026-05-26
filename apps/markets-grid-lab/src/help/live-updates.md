# Live Updates — flash, signal, repeat

This tab is tuned for **maximum visible motion**. It pre-seeds 3
conditional-styling rules and ratchets up the mock stream so flashes
are obvious.

## Stream configuration

```ts
{ providerType: 'mock', dataType: 'positions',
  rowCount: 500, updateIntervalMs: 200,   // 5× per second (default)
  enableUpdates: true, keyColumn: 'id' }
```

The **Tick** slider on this tab's toolbar overrides `updateIntervalMs`
between 100 ms and 1 s. At each tick, 1–4% of rows are mutated — so at
200 ms with 500 rows you see roughly 5–20 row updates every 200 ms.

## Seeded rules

| Rule | Effect | Why |
| --- | --- | --- |
| **Tick flash · prices** | Every `bidPrice` / `midPrice` / `askPrice` / `lastPrice` tick gets a 400 ms `sky` one-shot flash; `activeDurationMs: 400` matches | Shows the "value just changed" UX without judging the sign |
| **Winners** | `[value] > 0` on P&L columns: emerald flash 600 ms + emerald bold text + `arrow-up` top-right indicator | Combines flash + indicator + persistent style |
| **Losers** | `[value] < 0` on same columns: rose flash 600 ms + rose bold text + `arrow-down` top-right indicator | Mirror image |

## General settings

`cellFlashDuration: 500` ms · `cellFadeDuration: 1000` ms — module's
defaults are slower; we seed faster timings here so multiple flashes can
land per second without smearing.

## How the data lands

`startMock(cfg, emit)` is called once on mount. Each tick emits a
delta of changed rows, which `applyDelta()` merges into the snapshot
keyed by `id`. The new array reference is set as `rowData`; AG Grid
diffs row-by-row (it uses `getRowId` to identify rows) and AG-Grid's
built-in cell-flash AND our conditional-styling rule flashes both fire
on every changed cell.

No transactions, no batching — just immutable array swaps.

## Try this

1. **Slide Tick down to 100 ms** — the flash storm is the system's
   ceiling. Notice the GPU-driven CSS flashes don't drop frames.
2. **Switch to light mode** — flashes adapt to the light-mode palette.
3. Open **Style Rules** in the toolbar and toggle "Tick flash · prices"
   off — the sign-coloured flashes still fire because they're separate
   rules.
4. Save the profile → reload → everything restores including the
   3 seeded rules.

## Where the seed lives

[src/seeds/conditionalStyling.ts](src/seeds/conditionalStyling.ts) —
`LIVE_TAB_CS_RULES` array.
[src/seeds/generalSettings.ts](src/seeds/generalSettings.ts) —
`FAST_FLASH`.
