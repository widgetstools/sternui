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

**Symptoms:** (a) rows take a while to appear after scrolling STOPS; (b)
grouping and ungrouping are slow.

(a) is plausibly the scroll-pause added this session — `bodyScroll` sets
`setLive(false)` and resumes 150 ms after the last event
(`SCROLL_RESUME_MS` in `PerspectiveMarketsGridSurface`) — interacting with block
fetches, OR the read cost of a 400-column block. **Those are different fixes.**
Separate them by timing `getRows` against the resume timer; try a larger/smaller
`SCROLL_RESUME_MS` and see whether the delay tracks it.

(b) is a different thing again: every group level is a fresh View, and
ungrouping rebuilds the root. Look at `toPerspectiveGroupLevel` and the LRU in
`createViewManager` (`maxViews`, default 24).

Note the Stress tab keeps a client-side row supply for its plain-AG-Grid and
FINOS-viewer baselines — deliberately, since feeding those from a Table would
measure the Table instead of them. Only the MarketsGrid surfaces are on the pull
path.

## 3. Status bar parity · largest, own session

**Ask:** the Perspective status bar should match the CSRM one in look, feel AND
features.

**This is feature work, not polish.** CSRM's panels (Average / Count / Min /
Max / Sum over the selection, plus row counts) are computed from rows the client
holds. This window holds only its viewport, so those have to be answered by the
WORKER — exactly the move already made for style rules
(`aggregateScalar`, `countMatchingExpression`). The machinery exists; the
plumbing and the selection-scoped variant do not.

Today the surface supplies its own `PerspectiveStatusPanel`, and
`LabFeatureTab` deliberately does not pass `LAB_STATUS_BAR`, because AG's stock
panels count the rows this window holds — a few hundred of the book — which
reads as a bug.

## 4. Known issue: seeded layouts missing from the layout selector

Full write-up in [`perspective-grid-issuetobefixed.md`](./perspective-grid-issuetobefixed.md)
§1. **Not Perspective-specific — reproduces identically on the CSRM lab.**
Measured: 7 profiles on disk, 1 handed to `ProfileSelector`, and an
`activeProfileId` naming a profile absent from that list (hence "No layout" in
the toolbar).

Three ordering fixes were tried and **reverted**; the doc lists them so they are
not repeated. The fix is package-level (`@starui/engine` + `@starui/grid`), no
app change.

## 5. Known issue residual: alerts evaluate per window

Alerts were dead on this surface and are now FIXED for live evaluation (commit
`0c242a4c`) via a throttled whole-book pass. But each pass is a `readAllRows`
(~547 ms at 20,000 rows) **per window**. The end state is worker-side
evaluation pushing EVENTS to every window — design pinned in
[`perspective-grid-issuetobefixed.md`](./perspective-grid-issuetobefixed.md) §2.

---

# What was done this session

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
