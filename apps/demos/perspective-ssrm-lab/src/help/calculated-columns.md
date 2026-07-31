# Calculated Columns — module-driven

> **This is the Perspective lab.** The grid below runs on
> `rowModel="perspective"`: the book lives once as a Table in the SharedWorker
> and this window reads only the blocks its viewport asks for. Sorting,
> filtering, grouping and aggregation are answered by the worker, not by rows
> in this page. The CSRM twin of this tab is in `markets-grid-lab` on :5300 —
> run both to see what the engine changes. Read
> [the lab README](../../README.md) for the differences that matter.

**Six toolbar profiles** (`lab-calculated-v7`) switch between the full
**11** virtual columns, focused subsets (P&L, risk, spreads, overview
derivatives), and the **traffic-light (RAG)** help recipe. Import from
[`public/lab-profiles/calculated-columns/`](../../public/lab-profiles/calculated-columns/).

Default profile **05 · Traffic light (RAG)** installs the help walkthrough
(IFS on `midPrice`, emoji Excel format, center align, custom IFS group agg,
Asset Class grouped). Open `Tools → Calculated Columns` to inspect or edit.

Unlike `valueGetter`-based derived columns (which live in code), these
columns are **profile state** — the expression is a string parsed by
the engine at column-build time. You can author them in the UI, save
the profile, and they ride the same persistence as any other module.

## Full catalog (profile 00)

| ColId | Header | Expression | Formatter |
| --- | --- | --- | --- |
| `calc_pnlTotal` | P&L Total | `[dailyPnL] + [mtdPnL] + [ytdPnL]` | preset `currency`, signed |
| `calc_carryRisk` | Carry/Risk | `IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)` | preset `number`, 2 dp |
| `calc_dollarDur` | Dollar Dur | `[marketValue] * [modifiedDuration] / 100` | preset `currency`, 0 dp |
| `calc_bidAskBps` | B/A bps (calc) | `([askPrice] - [bidPrice]) * 100` | preset `number`, 2 dp |
| `calc_riskBucket` | Risk Bucket | `IF([modifiedDuration] < 3, "Short", …)` | string |
| `calc_spreadToBench` | Sprd→Bench (bps) | `([yieldToMaturity] - [benchmarkYield]) * 100` | preset `number`, 2 dp |
| `calc_liquidityScore` | Liquidity (log) | `LOG10([avgDailyVolume30d])` | preset `number`, 2 dp |
| `calc_pnlPctMkt` | P&L % of Mkt | `IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null)` | preset `number` |
| `calc_cs01Notional` | CS01 × Qty | `[cs01] * [quantityFace] / 1000000` | preset `currency` |
| `calc_yieldSpread` | YTW − YTM | `[yieldToWorst] - [yieldToMaturity]` | preset `number`, 3 dp |

## Profile 05 · Traffic light (RAG) — help §4 recipe

| Step | Config |
| --- | --- |
| 1. Calc | `trafficlight` = `IFS([midPrice] >= 105, 1, [midPrice] >= 95, 2, 3)` |
| 2. Excel format | `[=1]"🟢";[=2]"🟡";[=3]"🔴"` |
| 3. Align | Center |
| 4. Agg | Custom IFS `MIN/MAX([value])` RAG fold (SSRM → named `trafficLight`) |
| 5. Group | Asset Class row-grouped |

## Full catalog (profile 00)

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
