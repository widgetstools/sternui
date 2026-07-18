# MarketsGrid — Windows Performance Analysis (2026-07-11)

Critical, full-stack analysis of why MarketsGrid is not performant on
Windows. Covers every layer: SharedWorker transport → hub fan-out →
client → React wiring → AG Grid wrapper → theme/CSS → OpenFin hosting.
Produced from a static deep-read of the code (six parallel audits);
findings are ranked by expected impact but **not yet confirmed by
profiling on an affected Windows machine** — see
[Verification plan](#verification-plan).

Related docs: [MARKETSGRID_PERF_AND_MEMORY_AUDIT.md](./MARKETSGRID_PERF_AND_MEMORY_AUDIT.md),
[blotter-performance-roadmap.md](./blotter-performance-roadmap.md),
[hub-fanout-optimizations.md](./hub-fanout-optimizations.md).

---

## TL;DR

1. **The data-provider → grid interaction is NOT the problem.** Ticks
   bypass React entirely, go through keyed `applyTransactionAsync`,
   row classification is O(1), no `refreshCells`/`redrawRows` per tick.
   This layer is close to optimal.
2. **Scroll jank (the reported primary symptom) has two unconditional
   causes**: the design system's universal `*::-webkit-scrollbar`
   styling captures AG Grid's scroll viewports and can demote the grid
   off Chromium's composited-scroll fast path (Windows-specific), and
   the wrapper hardcodes `cellSelection: true` + attaches an enterprise
   Multi-Filter/Set-Filter + floating filter to **every** column — so a
   "minimal" grid is never minimal to AG Grid.
3. **When conditional styling IS used**, the styling engine becomes the
   dominant cost: an `inset 9999px` box-shadow flash animation
   (non-composited, per-frame paint), full-grid
   `refreshCells({force:true})` per activating frame, and
   `Object.create(data)` allocation per cell per evaluation.
4. **The transport layer has no safety net**: conflation exists only in
   the provider's optional `throttleMs`; the fan-out worker pool
   *pessimizes* small deltas (3 structured clones, 2 on the hub
   thread) and introduces an ordering hazard; no transferables; no
   bounded queue.
5. **Windows multipliers the app does nothing about**: no GPU flags in
   OpenFin manifests (silent SwiftShader risk), `pauseUpdatesWhenHidden`
   defaults off (hidden views burn full tick cost), Defender-sensitive
   double localStorage+sessionStorage writes, two forever-running
   broker-IPC polls per view.

---

## 1. Scroll jank in a minimal grid (primary symptom)

Scrolling continuously destroys/creates row DOM, so the cost is
(a) whatever is attached to every column/cell, and (b) per-cell paint.

### 1.1 Custom scrollbars defeat composited scrolling (Windows-specific) — #1 suspect

`packages/design-system/design-system/src/styles/scrollbar.css:12-48`
styles `*::-webkit-scrollbar` with a `color-mix(in oklch, …)` thumb and
a `transition` on the thumb. The universal `*` selector captures AG
Grid's `.ag-body-viewport`, `.ag-center-cols-viewport`, and both
scrollbar viewports. Styled webkit scrollbars are painted by Blink on
the **main thread**, and on Windows Chromium this is a known trigger
for demoting the scroller from composited (GPU-thread) scrolling to
main-thread scrolling. macOS overlay scrollbars mask this — which fits
the "fine on Mac, janky on Windows" symptom.

**Fix (keeps dark/light theming):** scope the grid out of the webkit
rules by setting the standard `scrollbar-color` property on the grid's
scroll containers. A non-`auto` `scrollbar-color` makes Chromium ignore
`::-webkit-scrollbar` for that element and renders the **native,
compositor-painted** scrollbar with themed colors:

```css
/* Grid viewports: native compositor-painted scrollbar, theme-aware colors. */
.ag-root-wrapper,
.ag-root-wrapper * {
  scrollbar-color: color-mix(in oklch, oklch(var(--foreground)) 38%, transparent)
                   transparent;
  scrollbar-width: auto; /* or `thin` */
}
```

`--foreground` already flips under `[data-theme]`, so theming is
preserved with zero override blocks (and Firefox gets themed scrollbars
too). Trade-off: the grid loses the exact 14px square-cornered look and
the 120ms hover transition — native shape with brand colors, the same
compromise VS Code makes. Note `scrollbar.css:13-17` documents the
opposite decision deliberately; that NOTE should be updated when this
carve-out lands.

### 1.2 `cellSelection: true` hardcoded on every grid

`packages/react-grid/grid/src/widget/MarketsGridSurface.tsx:134` passes
`cellSelection={true}` unconditionally (general-settings also emits it).
Range selection makes AG Grid do range-membership bookkeeping for every
cell as rows are created during scroll — a per-cell tax paid even by
grids that never use range selection. Should be config-gated.

### 1.3 Every column gets Multi-Filter + Set Filter + floating filter

- `packages/react-core/widgets-react/src/container/markets-grid-container/buildColumnDefs.ts:190-203`
  wraps every column without an explicit filter in `agMultiColumnFilter`
  containing a type filter **and** the enterprise `agSetColumnFilter`.
- `floatingFilter: true` is the default
  (`packages/shared/engine/src/customizer/modules/general-settings/state.ts:351`).

Consequences: per-column Set Filter unique-value models are maintained
as data changes (stealing main-thread time during scroll on a live
grid), and — since column virtualisation is on — horizontal scroll
re-instantiates floating-filter header cells, which are heavier than
plain cells.

### 1.4 Per-cell paint cost from the theme

`packages/design-system/design-system/src/adapters/agGrid.ts`:

- Every cell paints a right border, every row a bottom border, colored
  with **fractional-alpha oklch** (`oklch(var(--grid-border) / 0.6)`,
  lines 117-120) — alpha-composited, color-space-converted paint per
  cell edge.
- Cell text renders in **JetBrains Mono, a downloaded web font**
  (line 125; `@import` of Google Fonts in `dist/css/theme.css:4`) —
  costlier to rasterize per newly-created cell than a system font.
- The canonical theme is baked at **compact 30px density** (line 188)
  — more rows per viewport multiplies all per-cell costs.
- Zebra striping uses a near-invisible `oklch(var(--primary) / 0.022)`
  alpha fill on odd rows — still forces the blend path.
- Minor: `borderRadius`/`wrapperBorderRadius: 2` + wrapper border
  forces a clip layer around the scroll area.

### 1.5 Secondary scroll-path contributors

- Dotted-field columns each get a `valueGetter` closure invoked per
  cell per row creation (`buildColumnDefs.ts:231-238`). Flat fields
  correctly keep AG Grid's native fast path (line 240).
- All 17 customizer modules activate on every grid; even with zero
  rules, `RowChangeBus` subscribers (`processTimedActivations`,
  calculated-columns, toolbar-date) run per row-change tick — not on
  scroll, but they compete with scroll frames under live streaming.
- `wrapHeaderText: true` + `autoHeaderHeight: true` defaults force
  header text measurement (mount/resize only — minor).

### 1.6 Explicitly ruled out (don't chase these)

- React cell renderers — all 24 registered renderers are vanilla
  `ICellRendererComp` classes
  (`packages/design-system/design-system/src/cellRendererRegistry.ts`).
  `reactiveCustomComponents` is not set; no React header/tooltip/filter
  components exist.
- Theme identity churn — the theme is a module constant with baked
  light/dark modes switched via `data-ag-theme-mode`; no re-theme on
  render or theme flip
  (`packages/react-grid/grid/src/widget/theme/useGridTheme.ts:12`,
  `agGrid.ts:169-185`).
- Virtualisation misconfiguration — `rowBuffer: 10`,
  row/column virtualisation on, `suppressAnimationFrame: false`,
  `animateRows: false`: all sane AG defaults.
- Tooltips and cell-change flash — off by default
  (`state.ts:337`, `state.ts:368`).
- CSS transitions/box-shadows on cells — every `transition`/`box-shadow`
  rule in grid CSS targets toolbar/popout chrome, not `.ag-cell`/`.ag-row`.
- No scroll/viewport listeners — zero `onBodyScroll`/`onViewportChanged`
  subscribers anywhere in the grid or wiring packages.
- CSS custom properties are defined once at `:root`/`[data-theme]`,
  never per row/cell — no inheritance recalc storm.
- `HubInspectorDrawer` — mounted but polls only while open; never
  subscribes to the row stream.

---

## 2. Conditional-styling engine (dominant cost when rules exist)

All heavy logic lives in `@wellsfargo-starui/engine`
(`packages/shared/engine/src/customizer/modules/conditional-styling/transforms.ts`);
the grid package re-exports it.

### 2.1 Flash animation is a full-cell non-composited paint

`transforms.ts:325-335` animates
`box-shadow: inset 0 0 0 9999px <color>` — a full-cell fill repainted
every frame, not GPU-composited. Pulse mode sets `iteration: infinite`
(`:481`) so matching cells animate **forever**. Worst single GPU item on
weak Windows hardware. Fix: animate `background-color`/opacity on an
overlay; cap or forbid infinite pulse. Note AG Grid native flash
(`enableCellChangeFlash`) can be active simultaneously.

### 2.2 Full-grid forced refresh per activating frame

`createRefreshScheduler`
(`packages/react-grid/grid/src/customizer/modules/conditional-styling/runtime/schedulers.ts:44-84`)
calls `api.refreshCells({ force: true })`, rAF-debounced. Triggered by
every platform state change **and every timed-activation pass that
activates anything** (`runtime/timedActivations.ts:239-242`, `:409-412`).
Under sustained ticks this is a whole-viewport repaint per frame; the
`force` flag defeats AG Grid's value-diff short-circuit. A targeted
refresh batcher already exists in the same file (`schedulers.ts:99-182`)
and is used for expiry — the activation path should use it too.

### 2.3 Per-cell/per-row allocation storm

- Any rule referencing `.old`/`.new` (the canonical markets case)
  bypasses the zero-cost AG-string path and does `Object.create(data)`
  + WeakMap/Map churn per visible cell per refresh
  (`transforms.ts:688-758`, `buildColumnsContext` at `:935-946`).
- Row-class rules are worse: `Object.entries(data)` + per-column
  `syncRowDiffEntry` for every row, every evaluation — O(rows × cols)
  (`transforms.ts:760-808`).
- Formatter rules with string predicates call `parseAndEvaluate` +
  `Object.create` **per cell render** (`transforms.ts:846-882`) instead
  of using a compiled closure.
- Timed rules turn every model update into an O(rows × knownPaths)
  diff walk (`timedActivations.ts:74-243`); gated to zero cost when no
  timed rules exist.
- Header paint rules: `forEachNodeAfterFilter` per rule +
  `querySelectorAll` per column per evaluate
  (`runtime/headerPainter.ts:84-155`); gated when no header rules.

The valueGetter path already solved the allocation problem with a
single reused mutable context
(`buildColumnDefs.ts:129-134`) — the styling engine should mirror it.

### 2.4 What the styling runtime gets right

Event-driven (no polling interval); rAF-coalesced; expiry uses one
coalesced `setTimeout` + targeted refresh; everything gated to ~zero
cost when no rules exist (consistent with the "minimal grid still
janky" symptom).

---

## 3. Data transport layer (`packages/data/host-data`)

### 3.1 Conflation is optional and single-point

The only conflation is the provider's `bufferedDispatch`
(trailing-edge `setTimeout(throttleMs)`, conflate-by-key,
`runtime/providers/transports/bufferedDispatch.ts:70-98`). With
`throttleMs` 0/undefined, `push` is a **straight passthrough** —
every WebSocket frame forwarded 1:1 (`bufferedDispatch.ts:81-84`). The
hub does zero conflation (`applyEmit` broadcasts `event.rows` as-is);
the client does zero throttling; and the surface hardcodes
`asyncTransactionWaitMillis={0}` (`MarketsGridSurface.tsx:139-144`),
deliberately relying on the provider throttle. The entire backpressure
story hangs on one optional config field.

### 3.2 FanOutWorkerPool pessimizes small deltas

Small object deltas (< `LIVE_BIN_MIN_ROWS = 64`) route through the
pool: hub → fan-out worker → back to hub → window port = **three
structured clones, two on the hub thread**, plus an async round-trip
with a per-job timeout timer
(`runtime/worker/FanOutWorkerPool.ts:264-269`, `:213-227`;
routing at `SharedWorkerDataServicesHub.ts:1712-1716`). The expensive
clone into the window port stays on the hub thread either way — the
pool doubles work rather than offloading it. It also spawns one Worker
per subscription.

**Ordering hazard:** ≥64-row `delta-bin` frames bypass the pool and are
posted synchronously; a newer binary frame can overtake an older pooled
small delta, so stale values can land last for keys present in both. A
feed hovering around the 64-row threshold straddles this every frame.

### 3.3 Other transport costs

- **No transferables anywhere** — `delta-bin` `Uint8Array` buffers are
  structured-clone copied to every window.
- Per-frame string copies: `body.trim()` (`stomp.ts:480`) and
  `body.toLowerCase()` end-token scan (`stomp.ts:920`) on **every** live
  frame, not just snapshot frames.
- Per-listener envelope spread `{ ...event, subId }` before each clone
  (`SharedWorkerDataServicesHub.ts:1553`).
- Thin-delta diffing `JSON.stringify`s both sides of object-valued
  fields per row (`rowDiff.ts:38-42`).
- **No bounded queue** hub→window: if the grid main thread can't drain,
  the MessagePort queue grows unbounded with no backpressure signal.
- Snapshot/late-join replay is the well-optimized part: 500-row chunks,
  one serialization shared across simultaneous attaches
  (`hub.ts:1508-1522`).
- Windows timers: hidden windows clamp `setTimeout`, ballooning the
  throttle window → burst dumps on unhide.

---

## 4. React wiring layer (the part that's right)

- Ticks bypass React: `onTick` →
  `applyTransactionAsync({ add, update })`, zero `setState`
  (`useProviderDataWiring.ts:183-209`,
  `applyProviderToGrid.ts:231-258`).
- Row data never in React state; `rowData` prop is a frozen constant.
- `getRowId` stable, initial-only; tick classification O(1) via a
  snapshot id index (`applyProviderToGrid.ts:81-93`); pending-add
  dedup with coalesced replay is race-correct.
- `MarketsGridSurface` is memo'd with a referential comparator.

Remaining issues:

1. **`columnDefs` identity churn**: memoized on `activeCfg`
   (`MarketsGridContainer.tsx:440-446`), whose identity flips on
   **every AppData version bump** — any `{{name.key}}` write regenerates
   all colDefs with fresh `valueGetter` closures
   (`buildColumnDefs.ts:221-227`, `:235`) → AG Grid full column
   reconcile. Same disease per store tick in the customizer pipeline:
   `rowClassRules` and transformed colDefs are rebuilt with new
   closures every transform
   (`conditional-styling/index.ts:97-111`,
   `general-settings/index.ts:326-331`), and function-valued options
   compare by reference in `useGridHost.ts:170-172`, so
   `setGridOption('rowClassRules', …)` fires every pipeline tick.
2. **Snapshot commit is one synchronous burst**:
   `flushAsyncTransactions()` + O(rows) id-index build + `rows.slice()`
   + full `setGridOption('rowData')` re-diff back-to-back
   (`useProviderDataWiring.ts:157-172`). Visible hitch per load/reload/
   historical date change on slow machines. Chunk or drop the copy.
3. The wiring effect re-subscribes all five provider streams on
   `toolbarDate`/`asOfDate`/`onError` identity changes
   (`useProviderDataWiring.ts:322`); an unmemoized caller `onError`
   rebuilds the hot-path subscriptions every render.
4. `HostedMarketsGrid.containerNode` memo is defeated by a
   fresh-every-render `containerProps` spread
   (`HostedMarketsGrid.tsx:374-391`).
5. Two duplicate `useDataProvidersList()` subscriptions
   (`MarketsGridContainer.tsx:328-329`).
6. No-`rowIdField` fallback treats every tick row as an update with a
   per-tick copy (`applyProviderToGrid.ts:234-237`) — latent trap.

---

## 5. Hosting / OpenFin / Windows environment

- **Mount topology is good**: same-document (no iframes), exactly one
  cross-thread hop (SharedWorker MessagePort) for data in both browser
  and OpenFin; IAB/Interop is used only for theme + selection linking,
  never per tick.
- **No GPU flags in OpenFin manifests** (`--enable-mesh` only). If the
  GPU driver is blocklisted, Chromium silently falls back to
  SwiftShader software rendering — catastrophic combined with §1/§2
  paint costs. Add `--ignore-gpu-blocklist` /
  `--enable-gpu-rasterization` consideration + telemetry on the actual
  GL renderer. No `devicePixelRatio` handling anywhere for mixed-DPI
  trading desks.
- **`pauseUpdatesWhenHidden` defaults off**
  (`useProviderDataWiring.ts:61`) — hidden/minimized views apply every
  tick. Should default on.
- **Two forever-running broker-IPC polls per view**: 500ms
  `view.getOptions()` customData poll (`OpenFinRuntime.ts:429`) and
  1000ms tab-title poll (`useViewTabTitle.ts:73`).
- **Storage**: `crossWindowStorage` writes localStorage **and**
  sessionStorage per call (`crossWindowStorage.ts:25-40`); profile Save
  `JSON.stringify`s the whole bundle + a second `setItem`. Chromium
  Local Storage is a Defender-watched LevelDB on Windows — bursty
  synchronous writes can block the main thread. Production correctly
  sets `disableAutoSave: true` (`useMarketsGridController.ts:216`) so
  there is **no per-keystroke serialization** — verify all consumers
  pass it.
- **SharedWorker topology**: one worker per origin+realm (correct,
  one STOMP connection for all views) — but different origins or
  `--security-realm`s fork the worker and duplicate feeds. No
  SharedWorker-absent fallback exists (hard dependency).
- **One renderer process per OpenFin view**, each loading React + the
  full `AllEnterpriseModule` AG Grid bundle
  (`ensureAgGridModules.ts:16`) — trim to the used module set.
- **Measurement caveat**: `demo-react` wraps in `React.StrictMode`
  (`apps/demos/demo-react/src/main.tsx:34`); dev-server perf
  impressions are distorted (doubled effects/timers). Benchmark
  production builds only.
- Selection linking: `buildSelectionContext` expands group selections
  to **all leaf descendants** (`gridContextLink.ts:101-132`) — a fat
  IAB payload per selection click on big groups; per-click, not
  per-tick.

---

## Ranked fix list

Scroll jank (the reported symptom):

1. Scope grid viewports out of custom webkit scrollbars via
   `scrollbar-color` (§1.1) — one CSS change, potentially dramatic,
   keeps dark/light theming.
2. Config-gate `cellSelection` instead of hardcoding `true` (§1.2).
3. Stop defaulting every column to Multi-Filter + Set Filter; revisit
   `floatingFilter: true` default (§1.3).
4. Theme diet: opaque border color (or row-border only), system
   monospace stack for cells, test comfort density (§1.4).

Streaming/styling (when rules and fast feeds are in play):

5. Replace the `inset 9999px` box-shadow flash; forbid infinite pulse
   (§2.1).
6. Route timed-activation refreshes through the targeted batcher, not
   full-grid `force: true` (§2.2).
7. Reuse one mutable eval context instead of `Object.create(data)` per
   cell/row (§2.3).
8. Add hub-level conflation with a bounded flush window; route small
   deltas inline instead of through the fan-out pool (also fixes the
   ordering hazard) (§3.1-3.2).
9. Stabilize `columnDefs`/`rowClassRules`/`valueGetter` identities
   across rebuilds (§4.1).

Environment:

10. Default `pauseUpdatesWhenHidden` on; add GPU flags + SwiftShader
    telemetry to manifests; trim `AllEnterpriseModule`; kill or gate
    the two per-view IPC polls (§5).

## Verification plan

Cheapest first, each isolating one hypothesis, on an affected Windows
machine against a **production build**:

1. `chrome://gpu` in the OpenFin runtime — SwiftShader present? If so,
   manifest GPU flags become priority zero.
2. Delete/scope the scrollbar CSS → scroll test (§1.1).
3. `cellSelection={false}` → scroll test (§1.2).
4. `floatingFilter: false` + plain `agTextColumnFilter` → horizontal
   scroll test on a wide grid (§1.3).
5. DevTools performance trace during scroll: long style/layout (purple)
   frames point at §1.1/§1.4; long scripting (yellow) frames point at
   §1.2/§1.3. DevTools → Rendering → "Scrolling performance issues"
   before/after the scrollbar change confirms composited-scroll
   restoration.
