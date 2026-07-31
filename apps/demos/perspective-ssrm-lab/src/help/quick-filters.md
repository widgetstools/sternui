# Quick filter buttons — saved filter pills

> **This is the Perspective lab.** The grid below runs on
> `rowModel="perspective"`: the book lives once as a Table in the SharedWorker
> and this window reads only the blocks its viewport asks for. Sorting,
> filtering, grouping and aggregation are answered by the worker, not by rows
> in this page. The CSRM twin of this tab is in `markets-grid-lab` on :5300 —
> run both to see what the engine changes. Read
> [the lab README](../../README.md) for the differences that matter.

## Run the demo

```bash
npm run dev:markets-grid-lab
```

Open **Quick Filters**. The primary toolbar shows the **filter pill row**
(`FiltersToolbar`): click a pill to toggle it, use **Funnel+** to capture the
current column filter as a new pill, and **Funnel×** to clear all active pills.

### Profile selector

| Profile | Focus |
| --- | --- |
| **00 · Filter pills** | Six pills — start with **Rates** active |
| **01 · Rates only** | UST / rates asset class |
| **02 · Corp IG** | `CorpIG` set filter |
| **03 · High yield** | `CorpHY` book |
| **04 · Energy sector** | `issuerSector` = Energy |
| **05 · P&L losers** | `dailyPnL` &lt; 0 |
| **06 · AND stack** | Rates **and** Financials both on |
| **07 · Capture workflow** | Empty toolbar — build your own pill |

### Try it

1. Load **00 · Filter pills** — note the row count on **Rates** (badge on pill).
2. Toggle **Corp IG** on — grid narrows to investment-grade corporates.
3. Turn **Rates** off and enable **P&L losers** — negative daily P&L rows only.
4. Switch to **07 · Capture workflow**: set **Class** floating filter to `Agency`,
   then click **Funnel+** to save a new pill.
5. Use the **Demo console** scenario **Losers strip** to deepen negative P&L and
   watch pill counts update.

### Reset installed profiles

```js
localStorage.removeItem('markets-grid-bundle:lab-quick-filters-v1');
localStorage.removeItem('lab-demo-profiles-v2:lab-quick-filters-v1');
location.reload();
```

Import JSON snapshots from
[`public/lab-profiles/quick-filters/`](../../public/lab-profiles/quick-filters/).
