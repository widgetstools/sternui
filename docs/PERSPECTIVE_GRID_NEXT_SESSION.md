# Perspective grid — next session handoff

Everything a fresh session needs to pick this up. Read this first, then the two
files it points at.

## Where to work

| | |
|---|---|
| **Repo root** | `C:\Users\developer\projects\starui` |
| **Branch** | `feat/perspective-grid` — committed and pushed, working tree clean |
| **Base** | `main` |

Do NOT start a new branch. Everything below continues on `feat/perspective-grid`.

### The three apps that matter

| app | port | what it is |
|---|---|---|
| `apps/demos/perspective-ssrm-lab` | **5301** | The feature lab on `rowModel="perspective"`. Where the open issues show up. |
| `apps/demos/markets-grid-lab` | **5300** | The CSRM twin. **The control** — now genuinely `clientSide`, the SSRM toggle was removed this session. |
| `apps/demos/minimal-perspective-table` | **5273** | Product-path demo against the STOMP fixture. What `npm run e2e:perspective` drives. |

The two labs run the same columns, profiles, seeds and scenarios over the same
generated book, so **any difference between them is the engine and nothing
else**. Always run the control — it has caught several false findings.

## Companion docs — read these

- [`docs/perspective-grid-issuetobefixed.md`](./perspective-grid-issuetobefixed.md)
  — two diagnosed defects with measurements, failed attempts, and fix plans.
- [`docs/PERSPECTIVE_GRID_PARITY_WORKLOG.md`](./PERSPECTIVE_GRID_PARITY_WORKLOG.md)
  — the parity record, the verification recipe, and **"Traps that produced
  false findings"**. That section has repeatedly saved hours.
- [`packages/react-grid/perspective-grid/ARCHITECTURE.md`](../packages/react-grid/perspective-grid/ARCHITECTURE.md)
  — design, measured 4.5.2 engine numbers, non-optional View-lifecycle rules.

---

# WHAT NEEDS DOING — in this order

The first three came from the user in one message and are **unstarted**. Each
needs MEASUREMENT before any code change; see "Method" below for why that is not
optional advice.

## 1. Filter pill takes a while to apply · DONE

**MEASURED and fixed.** On the 50k x 400 stress tab the block that shows the
filtered rows settled in **5,031 ms**; it now settles in **1,044 ms**, and badge
engine work over the same window fell from **41.7 s to 1.8 s**. On a 500-row tab
the click was 83 ms before and 110 ms after — there was never anything to see
there, which is why this only reproduced on the stress tab.

None of the three candidates below was the answer on its own. What the timeline
showed is that everything crosses ONE serialized engine, and the block the user
waits for was queued behind a set-filter value list (680 ms), a grand total for
the filter being replaced (1,310 ms) and six pill badges. Fixes: background
questions yield to blocks (capped at 1.5 s), a superseded root request gets no
grand total, the throttled total push will not BUILD a View, and the count floor
went 1 s -> 5 s. Full table in the package
[`ARCHITECTURE.md`](../packages/react-grid/perspective-grid/ARCHITECTURE.md),
"One engine, one queue".

The original candidate list, kept because ruling them out is the finding:

- the store purge plus a fresh View build for the new filter (a View is not
  free — see the cost curve in the package ARCHITECTURE);
- the pill's own count badge, which calls `engine.countMatching` — a whole-book
  transient View per pill;
- debounce in the filter toolbar.

**How to tell them apart:** instrument `viewManager`'s `onEvent` (it already
emits `{type:'view', ms}` per build) and time `countMatching` separately. If the
badge dominates, it can be deferred or made lazy without touching the filter
path at all.

## 2. Stress tab, 50k × 400 · two distinct problems

**Prerequisite, now FIXED — the tab did not attach at all on a fresh profile.**
`no provider config for 'perspective-ssrm-lab:mock-positions-stress-50k40'`:
`handlePerspectiveAttach` read the worker catalog cache synchronously, and a
window that saves its provider row and attaches straight after beats the async
`wireWorkerCatalogSync` invalidate. It now resolves on demand
(`ConfigCatalogCache.ensure`), as the push path already did. MEASURED after the
fix, fresh profile: first row at **12 s** on the default variant and **15 s**
on the 50k × 400 modules variant, against never.

**(a) rows late after scrolling stops · MEASURED and fixed.** Rows now paint
**43–57 ms** after the last wheel notch, against **317–607 ms**.

It was NOT the scroll-pause: `live` returns 154 ms after the last scroll event
and the rows for the block already in flight painted before that, so
`SCROLL_RESUME_MS` was never on the critical path. It was the live refresh
re-reading blocks that were still being read — one 100-row block costs
**900–2,341 ms** here because a read carries all 400 columns, and invalidating
every loaded block four times a second meant the same ranges were re-requested
five and six times over. `scheduleRefresh` now defers while blocks are in
flight (re-arming, capped at 2 s so the grand total keeps moving).

**(b) grouping/ungrouping · MEASURED, not a separate defect.**
`setRowGroupColumns` to first block served is **122–421 ms** and the level View
is one build. What follows is 18–20 Views in fifteen seconds, all but one or two
of them saved-filter badge counts — the same contention as item 1, which is why
the slowest grouping change served its first block at 1,449 ms. No View-per-level
problem was found; the LRU never came near its cap.

**Still open here, and the biggest remaining number on this surface:** a
400-column block read is 0.9–2.3 s. A View carries every column it was built
with, and AG renders about fifteen of them. Restricting a View to the columns
the grid actually asks for is the obvious next lever and has NOT been tried —
it needs a rebuild when the user scrolls horizontally, so it is a design step,
not a tweak.

Note the Stress tab keeps a client-side row supply for its plain-AG-Grid and
FINOS-viewer baselines — deliberately, since feeding those from a Table would
measure the Table instead of them. Only the MarketsGrid surfaces are on the pull
path.

## 3. Status bar parity · largest, own session

**Ask:** the Perspective status bar should match the CSRM one in look, feel AND
features.

**DONE, and smaller than it looked — the premise above was wrong.** MEASURED on
both labs with AG's four stock panels:

| panel | CSRM :5300 | Perspective :5301, before |
|---|---|---|
| total-and-filtered | `Rows : 53,127` | **nothing rendered** |
| filtered | `Filtered : 53,127` | **nothing rendered** |
| selected | `Selected : 50,000` | `Selected : ?` |
| aggregations | `Count : 15` | `Count : 3` (its own range) |

The row counts were not wrong, they were ABSENT: AG's own components have no
book to count under a server row model. And **the aggregation panel needed no
worker at all** — it aggregates the selected CELL RANGE, not the row selection
(select-all left it showing the earlier drag on BOTH surfaces), and a dragged
range is rows this window holds. So Average/Count/Min/Max/Sum were already
right.

Shipped: `withPerspectiveStatusPanels` rewrites AG's stock row-count panel names
to worker-backed ones, keeping order and alignment, so `LAB_STATUS_BAR` now
means the same thing on both surfaces and `LabFeatureTab` passes it. Markup is
AG's own, copied from its rendered DOM. Select-all is answered from
`getServerSideSelectionState()` against the engine's row count.

Fixing it surfaced a real defect underneath: the status bar had been reading
`filteredRows`, which is what AG sizes its STORE from — under grouping, the
number of top-level groups. An unfiltered 50,000-row book grouped into nine
asset classes read **"Rows : 9 of 50,000"**. `engine.status.leafRows` now
measures the filtered book flat (only while grouped; ungrouped the root level
already is the leaf count).

**Not done, stated so it is not mistaken for parity:** a cell range dragged past
the loaded blocks aggregates only the rows this window holds, silently. That one
does need worker-side range aggregation.

## 4. The 50k x 400 tab throws inside the engine · REPORTED BY THE USER, diagnosed, not fixed

**Symptom as reported:** the 50k x 400 stress tab "crashes abruptly, sometimes
during load and sometimes during normal operations".

**What is MEASURED so far.** Driving the tab under CDP (raw browser WebSocket —
Playwright's page session cannot see SharedWorkers) for ~15 minutes of scroll,
sort, filter, group and reload churn: the renderer heap is FLAT at 470-530 MB,
no page crash, no worker crash. So no hard crash reproduced yet.

What DOES reproduce, every run, is an unhandled rejection inside the worker,
once per boot and before any window has sent a frame:

```
TypeError: Cannot perform DataView.prototype.getInt32 on a detached or
out-of-bounds ArrayBuffer
  at B (...)  at async x.handle_request (...)  at async Object.W (...)
```

| | throws per worker boot |
|---|---|
| 500-row tab | **0** |
| 50k x 400 tab | **1**, every run |
| 50k x 400, write chunked to 5,000 rows | **6** — reverted |

That stack is inside the engine's own transport; its protocol buffers are views
over the wasm `HEAPU8`, which detaches when wasm memory grows. The chunking row
is the informative one: bounding each write made it strictly worse, one throw
per growth event, so the trigger is growth itself. Every frame WE hand
`handle_request` was verified intact at handle time, so it is not our copy rule.

**Why this is the prime suspect for "crashes".** An unhandled rejection in a
SharedWorker is invisible — nothing reaches any window's console and whatever
awaited that promise never settles. A blotter cannot tell that from a hang.
`bootWorkerEntry` now reports these, so the next occurrence is attributable
instead of silent.

**Next steps, in order:**
1. Ask what "crashes" looks like — tab gone, grid blank, whole app frozen, or
   Chrome's "Aw, Snap". Each points somewhere different and the probes above
   rule out two of them already.
2. Reproduce with the reporting build and read the SharedWorker console
   (DevTools > inspect the shared worker, or
   `packages/react-grid/perspective-grid/scripts/workerCrashProbe.mjs`).
3. Probe `@perspective-dev/client` **5.0.0** (published 2026-07-28, never
   probed here) against `deleteRaceProbe.mjs` + a large-book growth case. The
   fix for this one has to come from the engine.

## 5. Known issue: seeded layouts missing from the layout selector

Full write-up in [`perspective-grid-issuetobefixed.md`](./perspective-grid-issuetobefixed.md)
§1. **Not Perspective-specific — reproduces identically on the CSRM lab.**
Measured: 7 profiles on disk, 1 handed to `ProfileSelector`, and an
`activeProfileId` naming a profile absent from that list (hence "No layout" in
the toolbar).

Three ordering fixes were tried and **reverted**; the doc lists them so they are
not repeated. The fix is package-level (`@starui/engine` + `@starui/grid`), no
app change.

## 6. Known issue residual: alerts evaluate per window

Alerts were dead on this surface and are now FIXED for live evaluation (commit
`0c242a4c`) via a throttled whole-book pass. But each pass is a `readAllRows`
(~547 ms at 20,000 rows) **per window**. The end state is worker-side
evaluation pushing EVENTS to every window — design pinned in
[`perspective-grid-issuetobefixed.md`](./perspective-grid-issuetobefixed.md) §2.

---

# What was done in the session after that

Four commits, `4d4076f4..fede323d`:

| commit | what |
|---|---|
| `4d4076f4` | **The Stress tab attaches at all.** `handlePerspectiveAttach` read the worker catalog cache synchronously and lost a race with the window's own `configStore.save`. Fresh profile: first row at 12 s, against never. |
| `6bef6397` | **Filter pill 5,031 ms -> 1,044 ms** on 50k x 400. Background questions yield to blocks; a superseded root request gets no grand total; the total push will not BUILD a View; count floor 1 s -> 5 s. |
| `e5c6df0b` | **Rows after a scroll stops 317-607 ms -> 43-57 ms.** The scroll-pause was never the cause; the live refresh was re-reading blocks that were still being read. |
| `fede323d` | **Status bar parity.** AG's row-count panels render nothing here; ours read the Table. Found and fixed "Rows : 9 of 50,000" under grouping. |

**The one habit that produced all four:** measure, then look at what the
measurement says rather than at what the plan said. Three recorded premises were
wrong this session — the pill's badge was not the filter-pill cost, the
scroll-pause was not the scroll cost, and the aggregation panel needed no worker
at all.

# What was done in the session before that

Fourteen commits on `feat/perspective-grid`, `695d2d5c..8f009e88`:

| commit | what |
|---|---|
| `695d2d5c` | Window loads **555 kB instead of 5,070 kB** — slim client + fetched wasm. The `getCompiledClientWasm()` route is impossible: a `WebAssembly.Module` cannot leave a SharedWorker (agent clusters). |
| `c4940c2d` | **Smart edit / bulk update actually write.** They were silent no-ops on this surface. |
| `a9ff25c0` | Style-rule aggregates measure the whole book (decision: unfiltered, Excel convention). |
| `764ea1e7` | **`mock-perspective` provider + `perspective-ssrm-lab`.** |
| `f9b2eb4f` | Scroll no longer fights the live re-read — worst frame 2,533 ms → 83.5 ms. |
| `05ba0999` | CSRM lab is client-side only; the SSRM toggle (which defaulted to ON) is gone. |
| `42cffede` | Cell rules stop cloning the row — horizontal scroll long tasks 291 ms → **0**. |
| `0c242a4c` | Alerts evaluate over the whole book on server-side row models. |
| `06e9dc0c` | Non-numeric group/total cells are blank unless the column asks to aggregate. |
| `8f009e88` | Stub cells are blank, not "Loading…". |
| 4 × `docs:` | The two known issues, with measurements and fix plans. |

---

# How to run

Production builds only. Never the Vite dev server for anything on this path —
it serves hundreds of modules per window and a third window never loads.

```bash
npm --prefix apps run build -w @starui/perspective-ssrm-lab
cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
```

```bash
npm --prefix apps run build -w @starui/markets-grid-lab
cd apps/demos/markets-grid-lab && npx vite preview --port 5300 --strictPort
```

Neither lab needs a broker — the book is generated in the SharedWorker by
`mock-perspective` / `mock`. The **product-path** demo does:
`npm run dev:stomp` first, then build + preview
`@starui/minimal-perspective-table` on 5273.

**Rebuild `host-data` before the app whenever worker-side source changed** —
the SharedWorker asset is a prebuilt esbuild bundle, so `vite build` on the app
just copies whatever `packages/data/host-data/dist/assets/` already holds:

```bash
npm run build --workspace=@starui/host-data
```

## Gates

```bash
npx turbo typecheck build test --continue
npm run e2e:perspective
```

**`npm run e2e:perspective` — 9 of 10 pass; the failure is NOT from this
work.** `mounts over the whole worker-held book` waits for the status bar to
read `20,000 rows` and gets `0 rows`: the STOMP fixture's book never reaches the
Table. VERIFIED by checking out `35e8784c` — the commit this session started
from, recorded as green — and running the same spec, which fails identically.
Bisected further with the refresh deferral disabled: same failure. Treat it as
the documented broker behaviour ("a cold snapshot takes 18 s-2 min and sometimes
wedges") until someone reproduces it against a warm fixture.

**Pre-existing failures that are NOT yours:** `@starui/grid` (4 failed test
FILES, 0 failed tests) and `@starui/widgets-react` (2 `providerStaleState`
cases). Anything ELSE that fails is almost certainly the turbo ordering race —
`design-system`, `grid#typecheck`, `host-wrapper-react`, `openfin-platform` have
all been seen failing that way and all pass in isolation. **Re-run before
believing it.** Use `--continue`, or the first failure hides the rest.

---

# Method — this is the part that actually matters

Every real finding this session came from measuring, and every wasted hour came
from theorising. Concretely, in this session alone:

- Three consecutive ordering hypotheses about the profile-manager race were all
  wrong; a 100 ms polling trace settled it in one run.
- "Horizontal scroll churns 315 cells, so churn is the problem" was wrong — a
  tab-vs-tab comparison showed a rules-free tab churns MORE cells at zero cost.
  The cost was per-cell rule work.
- The recorded diagnosis of `getCompiledClientWasm()` ("blocks the worker's
  event loop") was wrong; it rejects in 2 ms.

**Always run the CSRM control.** Several "Perspective bugs" this session were
present identically on CSRM — the layout-selector defect most notably.

## Reusable probe techniques

**Reach the api / platform / engine** — walk `__reactFiber$` up from
`.ag-root-wrapper`:

```js
const el = document.querySelector('.ag-root-wrapper');
const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
let f = el[k], api = null, platform = null;
while (f && (!api || !platform)) {
  const pr = f.memoizedProps;
  if (!api && typeof pr?.api?.getColumns === 'function') api = pr.api;
  if (!platform && pr?.value?.platform?.rows) platform = pr.value.platform;
  let h = f.memoizedState;
  while (h && !api) { if (typeof h.memoizedState?.getColumns === 'function') api = h.memoizedState; h = h.next; }
  f = f.return;
}
const engine = api.getGridOption('context')?.perspectiveEngineHolder?.get?.();
const alerts = platform.store.getModuleState('alerts');   // module state is keyed by module id
```

**Frame timings and long tasks need a REAL viewport.** The preview pane renders
`document.visibilityState === 'hidden'`, so `requestAnimationFrame` never fires
and every reading is zero. Use Playwright with an explicit viewport
(`@playwright/test` exports `chromium`; the bare `playwright` package is not
installed). Run the script from the repo root.

**Count DOM churn** with a `MutationObserver` on `.ag-root-wrapper` filtering
`.ag-cell` additions — that is what separated "cells are churning" from "cells
are expensive".

**Do not drive the profile-selector popover.** It does not open under synthetic
or forced Playwright clicks. Read what `ProfileSelector` is HANDED via the fiber
walk instead.

## Traps specific to these labs

- **`.ag-body-viewport .ag-row` and `.ag-center-cols-container .ag-cell` match
  ZERO elements** in this AG Grid 36 DOM. Query `.ag-row` / `.ag-cell`.
- **A field not declared in `perspectiveProvider.ts` does not exist in the
  Table.** `mock-perspective` flattens rows to the declared paths and drops the
  rest, so a rule referencing an undeclared field silently answers null.
- **Perspective COERCES a wrong-typed value rather than rejecting it.**
  Declaring the index column `id` as `number` turned every `POS-…` string into
  `0` and collapsed 500 rows onto one, with nothing logged. `fieldType()` now
  throws for an undeclared field for exactly this reason.
- **The SharedWorker outlives the page.** Changing a provider's declared schema
  has no effect on reload until the provider is RECREATED — the seed passes the
  new cfg to force it (`LAB_PROVIDER_CFG_VERSION`).
- **AG virtualises columns**, so at the default viewport only the leading TEXT
  columns are in the DOM. Widen to ~5,200 px before measuring a numeric column.
