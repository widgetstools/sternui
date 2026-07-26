# SSRM V2 migration worklog — retiring the RowMirror path

> **Session-independent task list.** Statuses are inline; update them in
> the same commit as the work. Any session should be able to open this
> file cold, read "Current state", and know exactly what to do next
> without re-deriving anything.
>
> Design + evidence: [`SSRM_PROVIDER_V2_DESIGN.md`](./SSRM_PROVIDER_V2_DESIGN.md).
> Consumer contract: [`SSRM_PROVIDER_V2.md`](./SSRM_PROVIDER_V2.md).
>
> Status key: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` · `DROPPED`

---

## Why this document exists

P1–P5 **built** the pull plane. Nothing ever **switched to it**.

The project goal on record is "replace the push-based blotter path with
the Perspective/SSRM pull architecture". The replacement exists and is
tested; the replaced thing is still what ships. Every fix and feature
landed in `pull/` during the 2026-07-26 session runs in **neither** the
lab's main grid nor `MarketsGridContainer` — only in a standalone spike
page.

This worklog closes that gap and deletes the superseded code, which
CLAUDE.md requires ("No versioned code — superseded code is deleted in
the same change as its replacement").

---

## Current state (verified 2026-07-26)

### Two engines are live

| Path | LOC | Consumed by |
|---|---|---|
| `ssrm-grid/src/custom/` + `src/engine/` + `src/ssrm/` (RowMirror) | **4,651** | **Production** — `MarketsGridContainer`, `HostedMarketsGrid`, markets-grid-lab main app |
| `ssrm-grid/src/pull/` (Perspective V2) | 3,905 | **The spike only** (`/spikes/ssrmGrid.html`) |

### The production wiring today

```
MarketsGridContainer
  └─ useProviderDataWiring         ← PUSH: hub-fed, onSsrmSnapshot / applyDataTransactionAsync
      └─ MarketsGrid (@starui/grid)
          └─ SsrmMarketsGridSurface        ← selected by resolveUseSsrm({useSSRM, rowModel})
              └─ CustomSSRMGrid + createCustomEngine   ← RowMirror, main thread
```

### The target wiring

```
MarketsGridContainer
  └─ connectSsrmProvider  →  createSsrmPullDatasource      ← PULL
      └─ AgGridReact (rowModelType="serverSide")
```

### The markets lab specifically

- `src/tabs/LabFeatureTab.tsx:60-62` renders `<MarketsGrid useSSRM={useSSRM}>` — the OLD path.
- `src/components/UseSsrmToggle.tsx` flips CSRM ↔ **old** SSRM.
- `src/demo/LabDemoContext.tsx:22` defaults `useSSRM = true`, so the lab's default experience is the RowMirror engine.
- `src/tabs/labStatusBar.ts` + `LabFeatureTab.tsx:84` suppress the status bar entirely under SSRM (`useSSRM ? undefined : LAB_STATUS_BAR`) — a workaround for AG's clientSide-only status panels, now solved properly (see Constraint C4).
- The new plane lives only in `src/spikes/ssrmGridSpike.tsx`, served from its own HTML entry.

### Known-red, pre-existing

15 `widgets-react/markets-grid-container` tests fail on `resolveUseSsrm`
missing from the `@starui/grid` mock. **These are a symptom of the
dual-engine seam** and are expected to disappear with it in S7 — do not
"fix" the mock in isolation.

---

## Testing principle for this migration

**Write new tests for the new implementation. Do not port old ones.**

Evidence from this repo, not theory. Two tests inherited by the pull
plane encoded DEFECTS as requirements:

- `"DROPS a response whose generation went stale mid-flight (no success,
  no fail)"` — that is the AG load-bandwidth deadlock (C1), written down
  as intended behaviour;
- an assertion on `setRowCount(n, false)` — the resize trap (C2), pinned
  as correct.

Porting either faithfully would have preserved the bug and produced a
green suite over a broken grid. Both had to be deleted and rewritten
before the real defect could even be described.

Three piles, three dispositions:

| Pile | Disposition |
|---|---|
| Tests for DELETED subjects (`custom/`, `customEngine`, `ssrm/`) | **Never ported.** Read once in S2 as a *requirements inventory* — they record which behaviours once mattered — then deleted with their subject in S7. Harvest the knowledge, not the code. |
| Tests for the pull plane written against `fakePerspective` | **Rewritten, not migrated.** They target the right subject but through a fake whose filter stub passes every row, so their filtering assertions are unfalsifiable. |
| Tests asserting a user-visible CONTRACT | **Kept and re-expressed** against the new implementation. "Every `getRows` answers exactly once", "a stale generation never paints", "aggregates repaint at every group level" outlive any engine. |

The discriminator is **contract vs mechanism**. A test that breaks
because the implementation changed was testing mechanism, and every
"update the test to match" is a signal it was never protecting anything.
A test that survives a rewrite untouched was testing contract.

Corollary, learned the hard way twice today: after writing a test,
**verify it can fail** — reintroduce the defect and watch it go red. An
unfalsifiable test is worse than no test, because it advertises
protection it does not provide.

## Hard-won constraints

These cost real time to discover. Violating one silently produces a
grid that looks fine and is wrong. Full detail in the commit history of
`feat/ssrm-stomp-provider`.

**C1 — every `getRows` must answer exactly once.** AG 36 decrements its
grid-global `outboundRequests` counter only inside `success`/`fail`, and
`maxConcurrentDatasourceRequests` defaults to 2. Two unanswered calls
permanently zero the grid's load bandwidth, for every store. Presents as
"sorting does nothing".

**C2 — never resize with `setRowCount`.** `success({rowCount})` on every
load is the mechanism; it is an ungated assignment followed by AG's
past-the-end node cleanup. `setRowCount(n, true)` arms a sort deadlock;
`setRowCount` used to SHRINK strands orphan nodes in either variant.
One-arg `setRowCount(n)` is safe for GROWTH only.

**C3 — `quickFilterText` is clientSide-only in v36.** Setting it purges
the root store per keystroke with an identical `filterModel`. Route the
term through the datasource instead.

**C4 — AG's row-count status panels are clientSide-only.** They are
silently *filtered out* under serverSide, leaving an empty status bar.
Use the exported `SSRM_DEFAULT_STATUS_BAR` stand-ins, which read counts
from grid `context`. This is what the lab's `useSSRM ? undefined` hack
was working around.

**C5 — Perspective view lifecycle.** A live view costs ~2.6 ms per table
update, each; GC reclaims nothing; `view.delete()` racing a read is an
uncatchable, never-settling leak. Views are leased
(`ViewCache.withView`), and shapes the user is LOOKING at (rollup, every
group level) must be re-acquired, not merely peeked — peeking never
refreshes recency, so they drift to LRU, get evicted, and freeze.

**C6 — never pass `on_poll_request`** to `PerspectiveServer`, despite
the vendor's own worker doing so. It routes polling through an unguarded
client lookup (crash) and costs 7×/49× on writes/reads.

**C7 — assert the DOM, not the row model.** A correct model has painted
stale rows here more than once. Grid probes count `.ag-row` elements and
read `[col-id]` text. Note AG virtualizes columns horizontally: on a
wide book an off-screen column is absent from the DOM entirely — pin it
before probing.

**C8 — `params.request` is a live reference** into AG's single mutable
`ssrmParams`. Deep-clone anything retained past the call.

---

## Session plan

Sessions are sized to be independently landable. Each ends green
(`npx turbo typecheck test`) and with docs updated in the same commit.

---

### S1 — Config + editor surface  ·  `TODO`

**Goal.** Make every pull-plane capability expressible in a catalog row.
Nothing downstream can be configured until this exists.

**Why first.** S3/S4 must configure the datasource from a
`StompSsrmProviderConfig`. Four options currently exist only as
datasource arguments the spike hardcodes.

**Tasks**

1. `TODO` Extend `StompSsrmProviderConfig` (`packages/shared/types/src/`)
   with: `weightedAggregates?: Record<string,string>` (value field →
   weight field), `treeParentField?: string`,
   `projectDisplayedColumns?: boolean`, `alwaysProjectColumns?: string[]`.
2. `TODO` Extend `validateStompSsrmConfig` with structured issues:
   - weight field must be declared in `columnDefinitions` and numeric;
   - `treeParentField` must be declared, and is mutually exclusive with
     `treePathFields` (both set = an issue, not a silent precedence);
   - `alwaysProjectColumns` entries must be declared;
   - a `wavg` aggregate with no weight entry is refused at the catalog
     seam, matching the datasource's existing refusal.
3. `TODO` `StompSsrmFields` cards for each, following the existing
   Calculated Columns / Tree Data pattern (design-system primitives only;
   no native inputs).
4. `TODO` `toSsrmDatasetConfig` passthrough where worker-side relevance
   applies; window-only knobs stay window-side.
5. `TODO` **Clear the docs debt**: `docs/current-features.md` is
   unchanged across ~14 commits of new capability (weighted aggregation,
   `first`/`last`/`distinctCount`, parent-id tree, projection narrowing,
   native contains fast path, ingest telemetry, bounded writes, status
   bar exports). CLAUDE.md mandates same-commit updates.

**Acceptance**
- A catalog row can express weighted aggregation, a parent-id tree and
  projection narrowing; the editor round-trips each.
- Invalid combinations produce inline issues, never silent precedence.
- `types` and `widgets-react` editor suites green.

---

### S2 — Parity inventory  ·  `TODO`

**Goal.** Know precisely what the RowMirror path does that the pull plane
does not. **No production code changes.** Output is a document.

**Why before wiring.** Deleting first and discovering gaps in a live
blotter is how a migration makes the product worse. The legacy path has
had years of behaviour accreted onto it.

**Tasks**

1. `TODO` Enumerate every capability reachable through
   `SsrmMarketsGridSurface` / `CustomSSRMGrid` / `customEngine`. Known
   candidates to check explicitly:
   - grid-state + viewport-anchor restore (`useGridHost`, profile load)
   - statusBar translation and SSRM stand-in panels
   - DCH / edit history, undo–redo of partial rows, refusal toasts
   - customizer + profile integration, column state persistence
   - `getSsrmShareOfTotal`, traffic-light aggregates, conditional styling
   - quick search reconciliation on `profile:loaded`
   - master/detail, tree data, pivot behaviour
   - toolbar date settings (`toolbar-date-settings/activate.ts` imports
     the legacy surface)
2. `TODO` For each: mark Present / Partial / Absent in `pull/`, with the
   file that provides it (or the gap).
3. `TODO` **Mine the legacy test suites as a requirements source.** The
   tests under `custom/`, `engine/` and `ssrm/` record which behaviours
   once mattered enough to assert — read them for coverage IDEAS and
   feed those into the table above. Do NOT plan to port them: they are
   written against a deleted subject, and inherited assertions have
   already been shown here to encode defects as requirements (see
   "Testing principle"). Harvest the knowledge, delete the code.
4. `TODO` Classify each gap: **blocker** (must close before deletion),
   **deferrable** (ship without, track), **dropped** (deliberate, with a
   reason).
5. `TODO` Write `docs/SSRM_V2_PARITY.md` with the table and the
   classification.

**Acceptance**
- Every legacy capability is accounted for with a named disposition.
- The blocker list is the S5 backlog, sized.

---

### S3 — Wire `MarketsGridContainer` to the pull plane  ·  `TODO`

**Goal.** `stomp-ssrm` providers render through the pull plane in the
real container.

**Depends on** S1 (config surface), S2 (known gaps).

**Tasks**

1. `TODO` In `MarketsGridContainer`, for `providerType === 'stomp-ssrm'`,
   build the connection (`connectSsrmProvider`) + datasource
   (`createSsrmPullDatasource`) from the catalog row via
   `toSsrmDatasetConfig`, replacing the `useProviderDataWiring` push
   path for that provider type.
2. `TODO` Gate the grid mount on `DatasetState`; key it by
   `(providerId, generation)` — a restart must remount, not adopt.
3. `TODO` Wire the required AG contract: `getRowId`
   (`createSsrmRowIdGetter`), `onBodyScroll → datasource.onScroll()`,
   `cacheBlockSize`/`maxBlocksInCache` **below** the datasource's
   `maxBlocks`, `SSRM_DEFAULT_STATUS_BAR` + `context` counts, cell-edit
   handler, tree/master-detail callbacks where configured.
4. `TODO` A **short-lived** `dataPlane` switch may coexist during this
   session so the old path stays reachable for comparison. It is removed
   in S7 — it must not outlive the migration (CLAUDE.md: no versioned
   code).
5. `TODO` Unit coverage for the container wiring against a fake
   connection; **query semantics stay in the real-engine suite.**

**Acceptance**
- A `stomp-ssrm` catalog row renders live in `MarketsGridContainer`
  through `pull/`, with sort, filter, quick filter, grouping and the
  grand total working.
- `widgets-react` suite green (excluding the known-red 15, which S7
  removes).

---

### S4 — Migrate the markets lab off the old grid  ·  `TODO`

**Goal.** **No old SSRM grid anywhere in markets-grid-lab.** This is an
explicit deliverable, not a side effect of S3.

**Tasks**

1. `TODO` `src/tabs/LabFeatureTab.tsx` — replace `<MarketsGrid useSSRM>`
   with the pull-plane surface (via the S3 container path, so the lab
   exercises the same code as production rather than a parallel wiring).
2. `TODO` `src/components/UseSsrmToggle.tsx` + `src/demo/LabDemoContext.tsx`
   — the toggle currently means "RowMirror SSRM vs CSRM". Decide and
   implement one of:
   - **(a)** repurpose to "pull plane vs client-side row model", or
   - **(b)** remove it and make the lab pull-only.
   Record the choice here when taken.
3. `TODO` `src/tabs/labStatusBar.ts` + `LabFeatureTab.tsx:84` — delete
   the `useSSRM ? undefined : LAB_STATUS_BAR` suppression and use
   `SSRM_DEFAULT_STATUS_BAR` (Constraint C4). The lab should show a real
   status bar under SSRM.
4. `TODO` Reconcile the spike. `src/spikes/ssrmGridSpike.tsx` is the e2e
   harness (9 specs drive `/spikes/ssrmGrid.html`) and carries the probe
   surface. Choose:
   - **(a)** keep it as the probe harness and let the main lab be the
     product surface, or
   - **(b)** move the probe surface onto the main lab tab and retarget
     the e2e specs.
   **(a) is lower risk**; **(b)** ends the duplication. Whichever is
   chosen, there must be exactly one *product* SSRM surface in the lab.
5. `TODO` Grep-gate: no `CustomSSRMGrid`, `createCustomEngine`,
   `useSSRM` or legacy `MarketsGrid` SSRM usage remains under
   `apps/demos/markets-grid-lab/src`.
6. `TODO` Update the lab's help/guides content that documents the old
   engine (`src/help/*.md`, `src/guides/featureGuides.ts`).

**Acceptance**
- `grep -rn "CustomSSRMGrid\|createCustomEngine\|useSSRM" apps/demos/markets-grid-lab/src`
  returns nothing.
- The lab's default grid is the pull plane, with a working status bar,
  side bar, row-group panel and live ticking at every group level.
- Lab typechecks and builds; e2e green.

---

### S5 — Close parity blockers  ·  `TODO`

**Goal.** Everything S2 classified as **blocker** works on the pull plane.

**Tasks**
1. `TODO` Work the S2 blocker list. Expect grid-state/viewport restore
   and profile/customizer integration to be the substantial ones.
2. `TODO` Each blocker gets a test at the right level: query semantics →
   real-engine suite; grid contract → unit with a fake connection;
   user-visible behaviour → DOM-asserting e2e (C7).

**Acceptance**
- Zero blockers remain; deferrable items are tracked here with reasons.

---

### S6 — Topology + dependency decision  ·  `TODO`

**Goal.** Decide, on measurement, whether the pull plane's worker
topology is right — **before** deleting the fallback.

**Why it matters now.** Committing the product to the pull plane makes
Perspective's risk the product's risk: 3.8.0 is **EOL** (last `@finos`
release; `@perspective-dev` 4.x not published), it carries an unfixed
upstream crash we work around (C6), and each live view costs ~2.6 ms per
update (C5). V2 collapsed ingest + engine into ONE worker on a
**non-comparable** measurement (~40-col slim rows), while the figure that
made the two-worker split load-bearing was 120-col (74% ingest + 58%
engine ≈ 132% of one core). That was never re-run.

**Tasks**
1. `TODO` Profile ingest and engine CPU separately under the real feed at
   production width, using the CDP technique in the debugging playbook.
2. `TODO` Decide: keep one worker / re-split / other. Record the number
   and the decision here.
3. `TODO` Record the EOL exposure and a trigger condition for revisiting
   (e.g. "if concurrent views per window exceeds N, or 4.x ships").

**Acceptance**
- A number and a decision, written down. Not a hunch.

---

### S7 — Delete the legacy path  ·  `TODO`

**Goal.** One engine. Atomic removal.

**Depends on** S3, S4, S5 (and S6's decision recorded).

**Tasks**
1. `TODO` Delete `ssrm-grid/src/custom/`, `src/engine/customEngine.ts`
   (+ engine barrel), `src/ssrm/`.
2. `TODO` Delete the grid package's legacy SSRM entry:
   `SsrmMarketsGridSurface`, `ssrmgrid-entry`, `resolveUseSsrm`,
   `useSsrmColumnDefs`, `useSsrmRowKeepExpression`, and the `useSSRM` /
   `rowModel` selection in `MarketsGrid`.
3. `TODO` Remove `useProviderDataWiring`'s SSRM push branch
   (`onSsrmSnapshot`, `applyDataTransactionAsync`) if nothing else uses
   it; remove the S3 `dataPlane` switch.
4. `TODO` `toolbar-date-settings/activate.ts:33` documents a coupling to
   a `CustomSSRMGrid` prop (row-keep expression) in a comment rather than
   an import — verify the behaviour still holds on the pull plane, then
   correct the comment.
5. `TODO` The 15 known-red `markets-grid-container` tests disappear with
   their subject. Confirm they are gone, not skipped.
6. `TODO` Update package exports and `docs/current-features.md`; the
   `@starui/ssrm-grid` root barrel changes shape.

**Acceptance**
- `grep -rn "CustomSSRMGrid\|resolveUseSsrm\|createCustomEngine" packages apps`
  returns nothing outside history.
- `npx turbo typecheck build test` fully green — **including**
  `widgets-react`, with zero skipped tests standing in for deleted ones.

---

### S8 — Test + docs consolidation  ·  `TODO`

**Goal.** The suite proves the product, and cannot pass while broken.

**Tasks**
1. `TODO` **Write a fresh contract-first suite** for the pull plane
   against the REAL engine, derived from `SSRM_PROVIDER_V2.md` and the
   C1–C8 constraints — not by porting the ~44 fake-backed tests in
   `createSsrmPullDatasource.test.ts`. Delete those once the new suite
   covers their intent. `fakePerspective`'s filter stub passes **every**
   row for any `__ssrm_*` clause, so their filtering assertions are
   unfalsifiable; porting them would carry that blindness forward. Read
   them once for coverage ideas, then drop them.
   See "Testing principle" above.
2. `TODO` For each new test, **verify it fails** with its target defect
   reintroduced. Record any test that cannot be made to fail, and either
   strengthen it or state the limit next to it.
3. `TODO` DOM-asserting e2e for **sort**, **column filter** and **quick
   filter** (the multi-level spec covers ticking only). These are the
   behaviours originally reported broken and still have no browser guard.
4. `TODO` Give `multi-level-tick.spec.ts` real teeth or document the
   limit. It currently pins the user-visible contract but was verified
   NOT to fail when the root-only sweep reserve was reintroduced — a
   stats-based probe (which group plans were swept per tick) would fail
   on reintroduction, at the cost of testing mechanism over behaviour.
5. `TODO` Final pass on `SSRM_PROVIDER_V2.md`, `SSRM_PROVIDER_V2_DESIGN.md`
   (its "still deferred" list is stale — periodic ordered-block refresh
   under active sort is **done**), and `current-features.md`.

**Acceptance**
- No query-semantics assertion depends on `fakePerspective`.
- Sort/filter/quick-filter have DOM-level e2e.
- Docs describe one engine.

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Parity gap found after deletion | Production blotter loses a feature | S2 inventory + S5 closure gate before S7 |
| Perspective 3.8 EOL, unfixed upstream crash | No upstream fix path | S6 records exposure + trigger; C6 workaround in place |
| One-worker CPU ceiling at production width | Ingest starves reads | S6 measures before the fallback is deleted |
| Migration flag outlives the migration | Two paths forever, CLAUDE.md violation | S3 introduces it, S7 removes it, same worklog |
| e2e depends on the spike page | Lab migration breaks the suite | S4 task 4 decides harness vs product surface explicitly |
| Wide books (~160 cols) degrade the sweep gate | Ticks land ~1/s | Understood and by design; revisit with S6's numbers |

---

## Session log

Append one entry per session: date, session id, what landed, what moved,
what surprised you. Keep it short; the value is the surprises.

| Date | Session | Landed | Notes |
|---|---|---|---|
| 2026-07-26 | (pre-S1) | Worklog created | Established that P1–P5 built the pull plane but nothing switched to it; production and the lab both still run RowMirror. |
