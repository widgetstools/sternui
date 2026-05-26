# Calculated Columns — module-driven

This tab seeds **7 virtual columns** through the `calculated-columns`
module. Open `Tools → Calculated Columns` to inspect or edit any
expression.

Unlike `valueGetter`-based derived columns (which live in code), these
columns are **profile state** — the expression is a string parsed by
the engine at column-build time. You can author them in the UI, save
the profile, and they ride the same persistence as any other module.

## What's seeded

| ColId | Header | Expression | Formatter |
| --- | --- | --- | --- |
| `calc_pnlTotal` | P&L Total | `[dailyPnL] + [mtdPnL] + [ytdPnL]` | preset `currency`, signed |
| `calc_carryRisk` | Carry/Risk | `IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)` | preset `number`, 2 dp |
| `calc_dollarDur` | Dollar Dur | `[marketValue] * [modifiedDuration] / 100` | preset `currency`, 0 dp |
| `calc_bidAskBps` | B/A bps (calc) | `([askPrice] - [bidPrice]) * 100` | preset `number`, 2 dp |
| `calc_riskBucket` | Risk Bucket | `IF([modifiedDuration] < 3, "Short", IF([modifiedDuration] < 7, "Mid", IF([modifiedDuration] < 12, "Long", "Ultra")))` | (string, no formatter) |
| `calc_spreadToBench` | Sprd→Bench (bps) | `([yieldToMaturity] - [benchmarkYield]) * 100` | preset `number`, 2 dp |
| `calc_liquidityScore` | Liquidity (log) | `LOG10([avgDailyVolume30d])` | preset `number`, 2 dp |

## Expression DSL

Field references use `[columnId]` syntax. Operators include `+ - * /`,
comparisons `== != > < >= <=`, logical `&& || !`, set membership `in`,
and built-in functions `IF`, `SUM`, `LOG10`, `ABS`, and more (see
[`expression/functions.ts`](../../packages/shared/engine/src/expression/functions.ts)).

```text
IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)
└──┬──┘ └──────────┬──────────┘ └──────────────┬────────────────┘
   IF       condition                    then-branch
```

## Recalculation

When the mock stream mutates `dailyPnL` on a row, the engine invalidates
**every calculated column that references it** for that row and AG Grid
refreshes the affected cells. Combined with `enableCellChangeFlash`,
derived values flash too — try it on **P&L Total**.

## Editing

`Tools → Calculated Columns → New` opens the master-detail editor.
Type an expression with `[fieldId]` field refs and the editor parses
in real time. Save the profile → the column persists.

## Where the seed lives

[src/seeds/calculatedColumns.ts](src/seeds/calculatedColumns.ts) —
each `VirtualColumnDef` exactly mirrors what the editor would produce.
