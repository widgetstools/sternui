# Known issues to be fixed

Open defects found while working the Perspective grid, written up so the next
person starts from evidence rather than from scratch. Each entry states what was
MEASURED, what is inferred, and what was already tried and failed.

---

## 1. Seeded layouts do not appear in the layout selector

**Status:** open · diagnosed, not fixed · **nothing is committed for this**, the
tree is at HEAD.

**Severity:** cosmetic-looking, but it hides the entire demo curriculum — a lab
tab advertising "6 profiles · pick a lens in the profile selector" offers one.

### What the user sees

The layout dropdown lists only **Default**. The toolbar button reads
**"No layout"**. Creating a copy of Default makes the other six appear
immediately — that workaround is the diagnosis, see below.

### NOT a Perspective bug

MEASURED on both labs, same tab (`Overview`), fresh browser profile each time:

| lab | profiles in storage | handed to `ProfileSelector` | `activeProfileId` |
|---|---|---|---|
| `perspective-ssrm-lab` | **7** | **1** (`__default__`) | `ov-00-kitchen-sink` |
| `markets-grid-lab` | **7** | **1** (`__default__`) | `ov-00-kitchen-sink` |

Identical. The seed works everywhere and all seven rows reach
`markets-grid-bundle:lab-overview-v7`; the selector is simply never told. It
lives in shared grid code and predates the Perspective work — it was noticed in
the new lab, not caused by it.

Note the active id names a profile **absent from the list it was given**. That
is the second symptom: the toolbar label resolves the active id against the
list, fails, and renders "No layout". One bug, two visible effects.

### Root cause

`useMarketsGridController.setConfig`
([useMarketsGridController.ts:330](../packages/react-grid/grid/src/widget/useMarketsGridController.ts)):

```ts
await bundleAdapter.applySerializedConfig(config);  // writes 7 profile rows straight to storage
const nextActive = bundleAdapter.readConfig().activeProfileId;
await profiles.loadProfile(nextActive);             // load() does NOT re-read the list
```

`applySerializedConfig` is a bulk write that **bypasses `ProfileManager`
entirely**. The manager's in-memory list — which is what the dropdown renders,
never storage — was refreshed by `boot()` *before* those rows existed, and
`ProfileManager.load()` deliberately skips the refresh. Its own comment says so:

> `// No refresh() here: load() doesn't mutate any profile rows on disk, so the
> // profile list is unchanged.`

True for an ordinary load, false immediately after a bulk write. Nothing else
refreshes, so the list stays at 1.

**Why cloning Default works:** `create()` *does* call `refresh()`. Any create
re-reads storage and all seven appear.

### The second half — an activeId race

Adding the missing refresh fixes the list — VERIFIED, **1 → 7 on both labs** —
but flips the active profile from `ov-00-kitchen-sink` to `__default__`.

`setConfig` and `ProfileManager.boot()` **both write `activeId` concurrently**.
Boot resolves it several `await`s in (around the `updateState({ activeId:
resolvedId })` near the top of `boot`), and the seed sets it too. Whoever
finishes last wins. Before the change the seed won; adding one `await` handed it
to boot. That is swapping a stale dropdown for a demo that opens the wrong
layout, which is why nothing was shipped.

### Tried and failed — do not repeat

All three were reverted. A timing trace (polling `ProfileSelector`'s props every
100 ms from grid mount) showed `activeId` going `__default__` → `__default__`
with the list going 1 → 7 at ~1,064 ms, i.e. **never reaching
`ov-00-kitchen-sink` under any of them**:

1. Use `config.activeProfileId` instead of re-reading
   `bundleAdapter.readConfig().activeProfileId`.
2. Await a new `ProfileManager.whenBooted()` at the top of `setConfig`.
   Resolves instantly when `setConfig` runs before `boot()` is ever called, so
   the race survives.
3. An `explicitLoadSeq` counter bumped by `load()` and captured by `boot()`, so
   boot refuses to apply its resolution if an explicit load happened while it
   was awaiting.

There is a detail in this seam that none of the three accounted for. Trace
before theorising again — three ordering hypotheses in a row were wrong.

### The fix — PACKAGE level, no app change

The lab is not doing anything wrong: `handle.setConfig(bundle)` is public API
([types.ts:470](../packages/react-grid/grid/src/widget/types.ts)) and seeding a
grid with prepared layouts is what it is for. Fixing it in an app would be a
workaround duplicated per consumer.

**`@starui/engine`** — the substantive change:

- [`ProfileManager.ts`](../packages/shared/engine/src/profiles/ProfileManager.ts)
  — add a transactional `seedProfiles(bundle, { activeId })` that writes the
  rows, refreshes the list, sets the active profile and publishes state **once**,
  as one unit. Serialize `boot` / `load` / `create` / `seed` on a single internal
  promise chain so a seed queues behind boot instead of racing it. The same
  pattern is already used in `perspectiveHost.ts`, where requests are chained
  because async work plus non-async delivery lets a later call overtake an
  earlier one — same disease, same cure.
- [`LocalStorageBundleAdapter.ts`](../packages/shared/engine/src/persistence/LocalStorageBundleAdapter.ts)
  — consider making `applySerializedConfig` internal to the manager. The root
  cause is that writing layout rows behind the in-memory owner is *possible* at
  all.

**`@starui/grid`** — thin plumbing:

- [`useProfileManager.ts`](../packages/react-grid/grid/src/customizer/hooks/useProfileManager.ts)
  — expose the new method on the hook's return.
- [`useMarketsGridController.ts:330`](../packages/react-grid/grid/src/widget/useMarketsGridController.ts)
  — `setConfig` calls `seedProfiles(...)` in place of the
  `applySerializedConfig(...)` + `loadProfile(...)` pair.

Public signatures do not change, so no consumer migration. It is shared code, so
it needs the full `npx turbo typecheck build test`, not just an app build.

**Regression test:** seed N profiles and assert the list length **and** the
active id *together*. Asserting only one is how this survived — the list was
wrong while the active id looked right.

The `seedProfiles` + serialization shape is a reasoned design, not a verified
one. The diagnosis above is measured; the plan is not.

### How to reproduce and verify

Both labs, production builds, fresh browser profile (the seed only runs once per
origin — `lab-demo-profiles-v2:<gridId>` in localStorage guards it):

```bash
npm --prefix apps run build -w @starui/perspective-ssrm-lab
cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
```

**Read the selector's props, do not drive its UI.** The popover does not open
under synthetic or forced Playwright clicks — the same trap the formatting
toolbar has (see the parity worklog). Walk `__reactFiber$` up from
`[data-testid="profile-selector-trigger"]` to the first ancestor whose
`memoizedProps.profiles` is an array:

```js
const el = document.querySelector('[data-testid="profile-selector-trigger"]');
const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
let f = el[k];
while (f) {
  const p = f.memoizedProps;
  if (p && Array.isArray(p.profiles)) {
    console.log({ count: p.profiles.length, active: p.activeProfileId });
    break;
  }
  f = f.return;
}
```

Fixed = `count: 7` **and** `active: 'ov-00-kitchen-sink'`. Either alone is not
the fix.

---

## 2. Alerts never fire on the Perspective surface

**Status:** **FIXED** for live evaluation · the worker-side design below remains
the better end state and is NOT done.

**What shipped:** where a whole-book fetcher is registered (the Perspective path
registers one), a `full` row-change now runs a throttled **whole-book** alert
pass instead of being discarded
([`alerts/runtime/activate.ts`](../packages/react-grid/grid/src/customizer/modules/alerts/runtime/activate.ts),
`runServerSideWholeBookPass`). VERIFIED live on the Alerts tab: rule history
grew 1 → 4 over 20 s of ticking with entries named `Bid > $110`, where before it
never grew at all.

Deliberately whole-book, not viewport — see "the tempting wrong fix" below;
scoping to loaded blocks would make a rule fire based on where the user
scrolled. Cost is bounded three ways: the caller already gates on an enabled
rule existing, passes are throttled to 1 s, and a pass in flight suppresses the
next rather than queueing.

**Still open — the residual cost.** Every pass is a `readAllRows`, measured at
~547 ms for 20,000 rows. Fine for a lab book and defensible for a real one at
1 Hz, but it is per-window: N blotters each read the whole book. The worker-side
design below removes that (evaluate once, push events) and is the reason this
entry stays in the file.

**Original status:** open · root cause MEASURED · nothing committed.

**Severity:** the whole Alerts feature is dead on this row model. Live rules
(dataChange, relativeChange, threshold-on-tick) never evaluate, so the Alerts
lab tab shows a ticking book and an empty bell.

### Measured

Alerts tab on both labs, book ticking, nothing touched for 12 s. The counters
are a direct subscription to `platform.rows`, the signal alerts evaluate from:

| lab | `rowModelType` | `full` changes | `delta` changes | rows in deltas |
|---|---|---|---|---|
| `perspective-ssrm-lab` | `serverSide` | **40** | **0** | **0** |
| `markets-grid-lab` | `clientSide` | 0 | 20 | 107 |

### Root cause

Two facts that are individually reasonable and fatal together.

1. The alerts subscriber **deliberately discards `full` changes under a
   server-side row model**
   ([`alerts/runtime/activate.ts`](../packages/react-grid/grid/src/customizer/modules/alerts/runtime/activate.ts),
   ~line 293): *"SSRM fires modelUpdated often without a meaningful book-wide
   delta. Alert deltas are published explicitly via publishExternalDelta."*
   Sound — a full pass per tick over a server-side book would be ruinous.

2. **Nothing publishes an explicit delta on the Perspective path.**
   `publishSsrmTransactionDelta`
   ([`ssrmRowChangeBridge.ts`](../packages/react-grid/grid/src/engine/ssrmRowChangeBridge.ts))
   has exactly two callers: `routeDataTransactionAsync`, gated on `useSSRM` —
   which is **false** here, since `resolveUseSsrm` only answers true for
   `rowModel: 'server'` — and `applyTickToSsrm`, the CustomSSRMGrid tick path.
   Neither runs on this surface.

So alerts are promised a delta that this row model never sends. Ticks arrive as
`table.update()` in the worker → engine refresh → `refreshServerSide` → block
re-read → AG replaces the rows. No transaction, no publish, and the only thing
that does reach the bus (`full`) is thrown away by rule 1.

This is the recurring species on this branch: **code that assumed the client
holds the whole book**, here in the form of assuming client-side row plumbing.

### The fix — and the tempting wrong one

**Start from what an alert means.** A rule is about the DATA, not about what is
rendered: "bid above 110" must fire whether or not that row is on screen. On
CSRM that is automatic — the client holds the whole book, so "rows this window
has" and "the whole book" are the same set, and nobody ever had to distinguish
them. On the pull path they are different sets, and that difference is the
whole issue.

**(a) Publish a delta for each re-read block — the tempting wrong fix.** The
engine has the fresh rows on a block read and could diff them against what the
grid held for those ids, then `publishExternalDelta({ updated })`. It is cheap,
it fits the existing delta path, and alerts would visibly start firing.

Do not stop there. It scopes evaluation to LOADED BLOCKS, so whether a rule
fires depends on where the user happened to scroll. A silently viewport-scoped
alert is worse than a dead one: the dead one is obvious.

**(b) Evaluate in the worker, over the whole Table — the consistent fix.** This
is the pattern the branch already established for the same reason one module
over: style rules were moved into the worker because `forEachNodeAfterFilter`
visits **0 nodes** under the server row model where CSRM visits all 20,000 (see
`countMatchingExpression` / `aggregateScalar` in the perspective-grid
ARCHITECTURE). Alerts are that problem again.

The complication specific to alerts: `dataChange` and `relativeChange` need a
PREVIOUS value, and a Perspective Table is an upsert store holding current
values only. So the diff has to be taken where old and new both exist — the
feed, at `table.update()` time. That shape already exists elsewhere
(`oldNewDiff` is an SSRM capability, and `recordSsrmTickDiffs` does exactly
this on the CustomSSRM path), so it is not new ground, but it is the part that
needs design rather than wiring.

#### The shape of (b): evaluate in the worker, push EVENTS

Confirmed as the intended direction. Worth writing down because it is better
than parity, not merely a repair:

- **Push events, never rows.** What crosses back to a window is an alert event
  — rule id, row key, the values that tripped it. Bytes, not a book, so the
  pull-path property is intact.
- **One evaluation serves every window.** On CSRM, N blotters each scan the
  whole book independently, N times over. Worker-side the book is scanned once
  and the event fans out — the same economics as the Table itself, where the
  second blotter costs a subscription rather than a replay.
- **Rules have to reach the worker.** They are authored per profile in a
  window, so the window publishes its rule set the way calculated columns
  already do (`setCalcExpressions` → `usePerspectiveCalcColumns`). Same seam,
  same lifecycle.
- **The rules split in two, and only one half is hard.** Threshold /
  expression rules (`bid > 110`) are a filtered count over current values,
  which `countMatchingExpression` already does for style rules using
  `compileStarUiExpressionToPerspective` — existing machinery. `dataChange` /
  `relativeChange` need a previous value an upsert Table does not keep, so they
  must be evaluated at `table.update()` time in the feed, where the incoming
  row and the stored row both exist.
- **Keep debounce, rate limiting and channel dispatch in the window.** Those
  are about how much noise a USER sees, not about the data. Two windows on one
  book may want different throttling, and a muted window must not suppress
  another's toast.

**Constraint on either route:** it lands on the block-read hot path, which was
just optimised (see the scroll work in the parity worklog). A per-row diff on
every tick is exactly the cost that produced a 2,533 ms frame. Gate it on an
enabled rule existing — the alerts subscriber already gates that way — and do
not run it while the user is scrolling.

The on-demand full-book rescan (`alertsFullBookRescan`, already wired to
`readAllRows`) stays useful for seeding baselines, but it is not a substitute
for live evaluation and should not be presented as one.

### Possible compounding factor — not confirmed

The probe read `alertRulesEnabled: 0` on BOTH labs, which would mean no rules
are loaded at all. That reading is **unreliable** — it looked for rules on
`platform.getState()`, and module state is keyed by module id, so it was
probably looking in the wrong place. Worth re-checking, because if the seeded
alert profile is not being applied then issue 1 above is also in play and both
have to be fixed before the tab demonstrates anything.

### How to reproduce

Open the Alerts tab on :5301, reach `platform` by walking `__reactFiber$` up
from `.ag-root-wrapper` to the `{ platform, engineKind }` context value, then:

```js
let full = 0, delta = 0;
platform.rows.subscribe((c) => { c.full ? full++ : delta++; });
// wait ~12s while the book ticks
console.log({ full, delta });   // perspective: 40 / 0 · CSRM: 0 / 20
```

Fixed = `delta > 0` on the Perspective surface with an enabled rule, and a
firing bell badge.
