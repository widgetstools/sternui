# Hosted View Hooks — Worklog

**One-line goal:** generalize the hosted-view scaffolding behind `<HostedMarketsGrid>` into a hook-based public API (`useHostedView` + sub-hooks) that exposes OpenFin runtime events — workspace save, tab-strip visibility, IAB pub/sub, color linking, FDC3 channels, and the OpenFin Channel API — to any feature that wants to be hosted in the OpenFin shell. First consumer: `HostedMarketsGrid` itself, which gains an auto-save-on-workspace-save and a top-left caption rendered when tabs are hidden.

**Branch:** `feat/hosted-view-hooks` (forked from `main` at the head of `refactor/hosted-markets-grid-unify` once that lands; until then, fork from current HEAD `d0549a2`).
**Plan file:** `C:/Users/develop/.claude/plans/hostedmarketgrid-should-be-a-parsed-wombat.md` — read for full context if anything below is unclear.

---

## Read me first (unchanging context for every session)

### Decisions already made (from plan-mode Q&A)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Hook-only API.** No new wrapper component. `useHostedView` composes the sub-hooks; existing `<HostedMarketsGrid>` keeps its identity but is refactored to consume the hook. | User pick: "useHostedView hook only (no wrapper)". |
| D2 | **Workspace-save semantics:** when the OpenFin workspace saves, hosted features re-run the same persist function their toolbar Save button calls (e.g. `profiles.saveActiveProfile()`). Async OK. | User: components save themselves on workspace save. |
| D3 | **Tab visibility = passthrough event only.** Hook exposes `tabsHidden: boolean`; hook does **not** render or hide anything. Consumer decides. | User: "it's not the host wrapper's responsibility to hide or show the caption — it simply provides all the events." |
| D4 | **Caption** is a new optional `caption?: string` prop on `HostedMarketsGrid`, falling back to `componentName`. | User pick. |
| D5 | **IAB hook shape:** `useIab()` returning `{ subscribe, publish }`. One hook, both helpers. | User pick. |
| D6 | **Linking surfaces covered:** OpenFin Workspace color linking, FDC3 user channels, AND the OpenFin Channel API (point-to-point). Three independent sub-hooks. | User multi-pick. |
| D7 | **Workspace-save fan-out uses the OpenFin Channel API**, not IAB pub/sub, so the platform can `await` every hosted view's flush before snapshot capture. IAB is for fire-and-forget broadcasts. | Plan-mode design call (justified inline in plan). |

### Surface to ship

| # | Hook / file | Layer | Test |
|---|---|---|---|
| 1 | `useIab()` — `{ subscribe, publish }` | Generic IAB pub/sub | `useIab.test.tsx` |
| 2 | `useOpenFinChannel()` — `{ createProvider, connect }` | Channel API factory | `useOpenFinChannel.test.tsx` |
| 3 | `useTabsHidden()` — `boolean` | Window options-changed listener | `useTabsHidden.test.tsx` |
| 4 | `useWorkspaceSaveEvent(cb)` — Channel client | Awaited save fan-out | `useWorkspaceSaveEvent.test.tsx` |
| 5 | `useColorLinking()` — `{ color, linked }` | Workspace browser color/link | `useColorLinking.test.tsx` |
| 6 | `useFdc3Channel()` — `{ current, join, leave, addContextListener, broadcast }` | FDC3 user channels | `useFdc3Channel.test.tsx` |
| 7 | `useHostedView(args)` — composing hook | Public entry point | `useHostedView.test.tsx` |
| 8 | `workspace-persistence.ts` Channel provider | Platform-side awaited dispatch | covered by session-3 e2e mock + smoke |
| 9 | `HostedMarketsGrid.tsx` refactor + `caption` prop + workspace-save wiring | Integration | `hosted-markets-grid.caption.test.tsx`, `.workspace-save.test.tsx` |
| 10 | `MarketsGrid` `caption?` + `tabsHidden?` props + caption render | UI | `markets-grid.caption.test.tsx` |

### Reference files (existing implementations being extended/composed)

- [`packages/widgets-react/src/hosted/useHostedIdentity.ts`](../packages/widgets-react/src/hosted/useHostedIdentity.ts) — identity bootstrap (reused, untouched)
- [`packages/widgets-react/src/hosted/useAgGridTheme.ts`](../packages/widgets-react/src/hosted/useAgGridTheme.ts) — theme adapter (reused, untouched)
- [`packages/widgets-react/src/hosted/HostedMarketsGrid.tsx`](../packages/widgets-react/src/hosted/HostedMarketsGrid.tsx) — refactored in session 6
- [`packages/openfin-platform/src/workspace-persistence.ts`](../packages/openfin-platform/src/workspace-persistence.ts) — extended in session 3; existing `augmentSnapshotWithLiveCustomData` ([:140-168](../packages/openfin-platform/src/workspace-persistence.ts#L140-L168)) and `fireChange` ([:216-223](../packages/openfin-platform/src/workspace-persistence.ts#L216-L223)) patterns are the model
- [`packages/markets-grid/src/MarketsGrid.tsx`](../packages/markets-grid/src/MarketsGrid.tsx) `handleSaveAll` ([:516-535](../packages/markets-grid/src/MarketsGrid.tsx#L516-L535)) — same code path the workspace-save callback will invoke via `MarketsGridHandle.profiles.saveActiveProfile()`

### Conventions

- **Branch**: stay on `feat/hosted-view-hooks`. Don't merge to `main` without sign-off.
- **Commits**: conventional prefixes per `CLAUDE.md`. End every commit with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Per-session commit cadence**: each session lands ≥1 commit. Update the **Session log** at the bottom of this file with `<commit-sha> | session N | one-line summary`.
- **Tests**: each new hook ships with the Vitest spec called out in its session. No code without tests for that session's surface row.
- **Browser fallback**: every hook MUST behave sensibly when `typeof fin === 'undefined'` (and `window.fdc3 === undefined` for the FDC3 hook). Subscribe → noop cleanup. State → safe default (`tabsHidden: false`, `color: null`, etc.). Publish → resolved promise. This is a hard rule — apps/demo-react is non-OpenFin and must not throw.
- **Zero behavior loss for existing `HostedMarketsGrid` consumers**: the public prop surface only *adds* (`caption?`); session 6 must not change any current call site's behavior.
- **Stop conditions**: if a session's acceptance criteria can't be met, do **not** proceed to the next session. Document the blocker in the Session log and ask.

---

## Sessions

Each session is sized to ~30–90 minutes of focused work. Sessions are sequential — later sessions assume earlier ones landed. Resume by saying `read worklog, implement session N`.

---

### Session 0 — Branch + plumbing

**Goal:** Cut the working branch, wire empty exports so subsequent sessions only need to add files.

**Preconditions**
- `npx turbo typecheck` green on whatever main-line HEAD this branches from.

**Steps**
1. `git checkout -b feat/hosted-view-hooks` from `main` (or current refactor HEAD).
2. No code changes — this session only verifies the baseline. Run `npx turbo typecheck build test` and record the green counts in the Session log so later sessions can compare.

**Acceptance criteria**
- Branch exists.
- Baseline counts recorded.

**Commit:** none (no file changes). Skip the commit and just log baseline numbers.

**Exit → log**: `(no sha) | session 0 | branch cut, baseline N typecheck / N build / N test`.

---

### Session 1 — IAB + Channel primitives

**Goal:** Land the two dependency-free primitives every other event hook builds on: generic IAB pub/sub and an OpenFin Channel factory.

**Preconditions**
- On branch `feat/hosted-view-hooks`.
- `npx turbo typecheck` green.

**Steps**
1. Create [`packages/widgets-react/src/hosted/useIab.ts`](../packages/widgets-react/src/hosted/useIab.ts):
   - Exports `useIab(): { subscribe, publish }`.
   - `subscribe(sender, topic, handler) → unsubscribe`. Internally calls `fin.InterApplicationBus.subscribe`. Bookkeep all live subs in a `useRef<Set<() => void>>`; unmount runs each cleanup.
   - `publish(topic, payload) → Promise<void>`. Calls `fin.InterApplicationBus.publish`.
   - Outside OpenFin: `subscribe` returns a noop cleanup; `publish` resolves immediately. Same call signature.
   - JSDoc each export.
2. Create [`packages/widgets-react/src/hosted/useOpenFinChannel.ts`](../packages/widgets-react/src/hosted/useOpenFinChannel.ts):
   - Exports `useOpenFinChannel(): { createProvider, connect }`.
   - `createProvider(name, actions) → Promise<ChannelProvider>` wraps `fin.InterApplicationBus.Channel.create`; registers each action via `provider.register`. Track the provider in a ref; on unmount call `provider.destroy()`.
   - `connect(name) → Promise<ChannelClient>` wraps `Channel.connect`. Track for unmount `client.disconnect()`.
   - Outside OpenFin: both reject with `new Error('OpenFin runtime not present')` (these are explicit calls; failing loud is correct here, unlike subscribe which is passive).
3. Add Vitest specs:
   - `useIab.test.tsx` — mock `globalThis.fin.InterApplicationBus`. Assert: subscribe-then-unmount calls unsubscribe; publish forwards args; non-OpenFin returns noop / resolves.
   - `useOpenFinChannel.test.tsx` — mock `Channel.create` + `Channel.connect`. Assert: provider/client teardown on unmount; non-OpenFin rejects.
4. Add exports to [`packages/widgets-react/src/hosted/index.ts`](../packages/widgets-react/src/hosted/index.ts).

**Acceptance criteria**
- `npx turbo typecheck build test --filter=@marketsui/widgets-react` green.
- New specs pass.

**Commit message template**
```
feat(widgets-react): add useIab and useOpenFinChannel primitives

Generic IAB pub/sub and OpenFin Channel factory hooks. Foundation for
the workspace-save event, color linking, FDC3, and any cross-window
broadcast a feature wants to wire. Browser fallback is a noop / lazy
reject so non-OpenFin consumers compile and run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 1 | useIab + useOpenFinChannel`.

---

### Session 2 — `useTabsHidden`

**Goal:** Expose tab-strip visibility from the parent OpenFin window as React state.

**Preconditions**
- Session 1 landed.

**Steps**
1. Create [`packages/widgets-react/src/hosted/useTabsHidden.ts`](../packages/widgets-react/src/hosted/useTabsHidden.ts):
   - On mount, `await fin.me.getCurrentWindow()`, then `await win.getOptions()`.
   - Derive initial `tabsHidden` from the workspace-platform window options. **Exact field name TBD at runtime** — likely `workspacePlatform.windowOptions.toolbarOptions.visible` (negated) or `viewTabsVisible`. Add a small helper `deriveTabsHidden(opts: unknown): boolean` so the field-name decision is one place to update if OpenFin's shape differs.
   - Subscribe `win.on('options-changed', handler)`; re-derive `tabsHidden` on each event and `setState`.
   - Cleanup `win.removeListener('options-changed', handler)`.
   - Outside OpenFin: returns `false`, no listeners attached.
2. **Live OpenFin investigation step (required before merging this session)**:
   - Open the reference app inside OpenFin browser.
   - In the view's devtools, run `await (await fin.me.getCurrentWindow()).getOptions()` and record the path that flips when the user toggles the browser's *Hide Tabs* control. Paste the field path as a comment at the top of `useTabsHidden.ts` so future readers know the source of truth.
3. Add Vitest spec `useTabsHidden.test.tsx`:
   - Mock `fin.me.getCurrentWindow().getOptions()` returning a controlled options object.
   - Mock `win.on('options-changed', cb)` to capture the callback; fire it with diffed options; assert state flip.
   - Assert non-OpenFin returns `false`.
4. Export from `hosted/index.ts`.

**Acceptance criteria**
- Specs green.
- Live OpenFin verification recorded as a comment in the source file.

**Commit message template**
```
feat(widgets-react): add useTabsHidden hook

Reads the parent OpenFin window's options-changed stream and exposes
tab-strip visibility as a boolean. Source-of-truth field path captured
inline from a live OpenFin investigation. Browser fallback returns
false.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 2 | useTabsHidden + live-opt-shape note`.

---

### Session 3 — Workspace-save Channel (end-to-end)

**Goal:** Wire the highest-risk path — platform-side Channel provider that awaits every hosted view's flush before snapshot capture, plus the client hook each view uses to register its flush callback.

**Preconditions**
- Sessions 1–2 landed.

**Steps**
1. Edit [`packages/openfin-platform/src/workspace-persistence.ts`](../packages/openfin-platform/src/workspace-persistence.ts):
   - At module scope (or lazily on first override-callback invocation), create a singleton OpenFin Channel provider named `marketsui-workspace-save-channel` via `fin.InterApplicationBus.Channel.create`.
   - In `createSavedWorkspace` and `updateSavedWorkspace`, immediately before `augmentSnapshotWithLiveCustomData(snapshot)`:
     ```ts
     try {
       const conns = provider.connections;
       await Promise.allSettled(
         conns.map((c) => provider.dispatch(c, 'workspace-saving', { workspaceId })),
       );
     } catch (err) {
       console.warn('[workspace-persistence] pre-save dispatch failed:', err);
     }
     ```
   - After `cm.saveConfig(...)` succeeds, fire-and-forget `void provider.publish('workspace-saved', { workspaceId }).catch(() => {});`.
   - Best-effort everywhere — must not fail the workspace op.
2. Create [`packages/widgets-react/src/hosted/useWorkspaceSaveEvent.ts`](../packages/widgets-react/src/hosted/useWorkspaceSaveEvent.ts):
   - Built on `useOpenFinChannel().connect('marketsui-workspace-save-channel')`.
   - Registers `client.register('workspace-saving', async () => { await cb(); })`. Returning the awaited promise lets the platform `dispatch` block on completion.
   - Optional second arg / second hook for `'workspace-saved'` post-save signal.
   - Tear down the connection on unmount.
   - Browser fallback: subscription is a no-op (matches `useOpenFinChannel` behavior — guard with `typeof fin !== 'undefined'` before calling).
3. Add Vitest specs:
   - `workspace-persistence.workspace-save.test.ts` — mock the Channel provider; assert `dispatch` is awaited (resolve order proves blocking) before `augmentSnapshotWithLiveCustomData`; assert `publish('workspace-saved')` fires after `cm.saveConfig`.
   - `useWorkspaceSaveEvent.test.tsx` — mock the Channel client; provide a slow async `cb`; assert the registered handler resolves only after `cb` resolves.
4. Live OpenFin smoke (record outcome in Session log):
   - Open a workspace with a HostedMarketsGrid view.
   - Modify a column or filter (do NOT click the toolbar Save).
   - Click *Save Workspace* in the OpenFin browser header.
   - Reload the workspace; verify modification round-tripped. (Wired in session 6 — for this session, just confirm the dispatch fires by adding a temporary `console.log` in a test handler.)
5. Export from `hosted/index.ts`.

**Acceptance criteria**
- Specs green.
- `npx turbo typecheck build` green for `@marketsui/openfin-platform` and `@marketsui/widgets-react`.
- Live OpenFin: `dispatch('workspace-saving')` confirmed firing (temp log or breakpoint).

**Commit message template**
```
feat(openfin-platform,widgets-react): workspace-save Channel + useWorkspaceSaveEvent

Adds an awaited fan-out so hosted views flush their state before the
workspace snapshot is captured. Platform creates a singleton Channel
provider named marketsui-workspace-save-channel and dispatches
'workspace-saving' to every connected client before
augmentSnapshotWithLiveCustomData; 'workspace-saved' publishes after
the row commits. Client-side hook registers an async flush handler
whose promise blocks the dispatch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 3 | workspace-save Channel end-to-end (smoke: dispatch fires)`.

---

### Session 4 — Linking hooks (`useColorLinking` + `useFdc3Channel`)

**Goal:** Add the two remaining linking surfaces. Bundled because both are independent and small.

**Preconditions**
- Sessions 1–3 landed.

**Steps**
1. Create [`packages/widgets-react/src/hosted/useColorLinking.ts`](../packages/widgets-react/src/hosted/useColorLinking.ts):
   - Returns `{ color: string | null, linked: boolean }`.
   - Reads from the parent window's `workspacePlatform.windowOptions` via `getOptions()` on mount.
   - Subscribes to `Window.on('options-changed', handler)` — same listener pattern as `useTabsHidden`. **If both hooks mount in the same view, share a single listener** via a small module-private subscription manager keyed by window identity, so the window doesn't get N redundant listeners.
   - Live OpenFin investigation step: capture the exact field path for the link color by toggling the browser's *Link* button and diffing options. Comment inline.
2. Create [`packages/widgets-react/src/hosted/useFdc3Channel.ts`](../packages/widgets-react/src/hosted/useFdc3Channel.ts):
   - Returns `{ current, join, leave, addContextListener, broadcast }`.
   - Thin wrapper over `window.fdc3` (`getCurrentChannel`, `joinUserChannel`, `leaveCurrentChannel`, `addContextListener`, `broadcast`).
   - Track current channel via `fdc3.addEventListener('userChannelChanged', ...)`; if that event isn't supported by the runtime, poll `getCurrentChannel()` once after each `join`/`leave` call.
   - Functions returned via `useCallback` so consumers can pass them to effects.
   - Outside FDC3 (`window.fdc3` undefined): `current: null`, all functions are noop / resolve immediately, `addContextListener` returns a noop cleanup.
3. Add Vitest specs `useColorLinking.test.tsx` and `useFdc3Channel.test.tsx`:
   - Color linking: mock window options; assert state transitions on options-changed.
   - FDC3: mock `window.fdc3`; assert `join`/`leave`/`broadcast` forward args; `addContextListener` cleanup fires; non-FDC3 environment safe.
4. Export both from `hosted/index.ts`.

**Acceptance criteria**
- Specs green.
- Shared options-changed listener verified (only one `win.on('options-changed', ...)` per window across all hooks that need it).

**Commit message template**
```
feat(widgets-react): add useColorLinking and useFdc3Channel hooks

useColorLinking exposes the parent window's workspace-platform color
link state via the shared options-changed listener.
useFdc3Channel wraps window.fdc3 user-channel join/leave/broadcast
and addContextListener with React-friendly identity-stable callbacks.
Both degrade safely outside their respective runtimes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 4 | linking hooks (color + FDC3)`.

---

### Session 5 — `useHostedView` composition

**Goal:** Compose all primitives into the public entry-point hook. Update the barrel exports.

**Preconditions**
- Sessions 1–4 landed.

**Steps**
1. Create [`packages/widgets-react/src/hosted/useHostedView.ts`](../packages/widgets-react/src/hosted/useHostedView.ts):
   - Accepts `UseHostedViewArgs extends UseHostedIdentityArgs` plus `theme?: AgGridThemeMode`, `onWorkspaceSave?: () => void | Promise<void>`, optional `fdc3?: { autoJoin?: string }`.
   - Internally: `useHostedIdentity(args)`, `useAgGridTheme(args.theme)`, `useTabsHidden()`, `useColorLinking()`, `useFdc3Channel()` (auto-join if `args.fdc3?.autoJoin` set), `useOpenFinChannel()`, `useIab()`, `useWorkspaceSaveEvent(args.onWorkspaceSave)` only when `onWorkspaceSave` is provided.
   - Returns `UseHostedViewResult` exactly per the plan.
2. Add Vitest spec `useHostedView.test.tsx`:
   - Mount with all sub-hooks mocked; assert composition wiring (each sub-hook called once with the expected args; result fields populated).
   - Assert `onWorkspaceSave` only registers when provided.
3. Update [`packages/widgets-react/src/hosted/index.ts`](../packages/widgets-react/src/hosted/index.ts) to export `useHostedView` + every sub-hook + every result/arg type.
4. Refresh [`packages/widgets-react/src/hosted/README.md`](../packages/widgets-react/src/hosted/README.md) — append a *Hooks* section listing each hook with a one-line purpose and a small `useHostedView` example. Don't rewrite existing content.

**Acceptance criteria**
- `npx turbo typecheck build test --filter=@marketsui/widgets-react` green.
- README has the new section.

**Commit message template**
```
feat(widgets-react): add useHostedView composing hook

Single entry point composing useHostedIdentity, useAgGridTheme,
useTabsHidden, useColorLinking, useFdc3Channel, useOpenFinChannel,
useIab, and useWorkspaceSaveEvent. Each sub-hook remains independently
exported. README updated with a Hooks section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 5 | useHostedView + barrel + README`.

---

### Session 6 — `HostedMarketsGrid` integration

**Goal:** Refactor `HostedMarketsGrid` to consume `useHostedView`, add the `caption` prop, wire workspace-save to `MarketsGridHandle.profiles.saveActiveProfile()`, and pass `tabsHidden` + `caption` down to `MarketsGridContainer`.

**Preconditions**
- Session 5 landed.

**Steps**
1. Edit [`packages/widgets-react/src/hosted/HostedMarketsGrid.tsx`](../packages/widgets-react/src/hosted/HostedMarketsGrid.tsx):
   - Replace the in-component `useHostedIdentity` + `useAgGridTheme` calls with a single `useHostedView({ ... })` call.
   - Add a `useRef<MarketsGridHandle>` and pass it as `ref` to `MarketsGridContainer`.
   - Pass `onWorkspaceSave={async () => { await gridRef.current?.profiles.saveActiveProfile(); }}` to `useHostedView`.
   - Add `caption?: string` to `HostedMarketsGridProps`. Forward `tabsHidden` + a derived `headerCaption = tabsHidden ? (caption ?? componentName) : null` (or pass both verbatim — final shape decided once we look at MarketsGridContainer's props in session 7).
   - **Zero behavior loss**: every existing call site (no `caption`, no `onWorkspaceSave` consumer code) must still render and behave identically.
2. Add Vitest specs:
   - `hosted-markets-grid.caption.test.tsx` — mounts with `tabsHidden` mocked true/false; asserts caption prop is forwarded only when expected.
   - `hosted-markets-grid.workspace-save.test.tsx` — mocks the workspace-save Channel; fires the handler; asserts `gridRef.current.profiles.saveActiveProfile` was called.
3. Update [`packages/widgets-react/src/hosted/README.md`](../packages/widgets-react/src/hosted/README.md) — add `caption` row to the props table; add a one-paragraph "Workspace save" section explaining the auto-flush behavior.

**Acceptance criteria**
- Existing 27 hosted-grid specs from prior worklog still green.
- Two new specs pass.
- `npx turbo typecheck build` green.

**Commit message template**
```
refactor(widgets-react): HostedMarketsGrid consumes useHostedView

- Replaces in-component identity + theme hooks with useHostedView.
- Adds caption?: string prop (falls back to componentName).
- Wires onWorkspaceSave to MarketsGridHandle.profiles.saveActiveProfile
  so grid state flushes on OpenFin Save Workspace, matching the toolbar
  Save button code path.
- Forwards tabsHidden + caption to MarketsGridContainer.
- Existing call sites untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 6 | HostedMarketsGrid → useHostedView + caption + workspace-save wiring`.

---

### Session 7 — MarketsGrid caption rendering + verification + docs

**Goal:** Render the caption inside MarketsGrid, run full verification (unit + e2e + live OpenFin smoke), and update docs.

**Preconditions**
- Session 6 landed.

**Steps**
1. Edit [`packages/markets-grid/src/MarketsGrid.tsx`](../packages/markets-grid/src/MarketsGrid.tsx) (or `MarketsGridContainer` — pick the layer that owns the toolbar/header region; check both):
   - Add `caption?: string` and `tabsHidden?: boolean` props (optional, defaulting to `undefined`/`false`).
   - In the existing toolbar/header region, when `tabsHidden && caption`, render a top-left `<span>` with the caption text using design-system tokens (`color: var(--bn-t1); background: var(--bn-bg);` plus existing toolbar typography scale). Do **not** introduce a new design-system primitive.
2. Add Vitest spec `markets-grid.caption.test.tsx`:
   - `tabsHidden=false`, `caption='X'` → no caption rendered.
   - `tabsHidden=true`, `caption=undefined` → no caption rendered.
   - `tabsHidden=true`, `caption='X'` → caption rendered, top-left.
3. **Full verification**:
   - `npx turbo typecheck build test` — all green; baseline counts (recorded in session 0) match or grow.
   - Existing Playwright suite — no regressions vs the 195/214 baseline.
   - **Live OpenFin smoke** (the real test):
     1. Mount HostedMarketsGrid with `caption="Markets Blotter"` in a workspace.
     2. Modify a column / filter / sort.
     3. Click *Save Workspace* in the OpenFin browser header.
     4. Close + reopen workspace; verify modification round-tripped.
     5. Toggle the browser's *Hide Tabs* control; verify caption appears top-left and disappears when tabs return.
   - Browser smoke: mount in `apps/demo-react`; verify nothing throws, no caption appears (browser has no `fin`, `tabsHidden` stays false).
4. Update [`docs/IMPLEMENTED_FEATURES.md`](IMPLEMENTED_FEATURES.md) — append a new subsection under §1 documenting:
   - The seven new hooks (one-line each).
   - HostedMarketsGrid auto-save-on-workspace-save behavior.
   - HostedMarketsGrid `caption` prop + tabs-hidden caption rendering.
   - Cross-link to this worklog.
5. Append a final Session log entry recording PR-ready state.
6. (Optional) draft the PR body — model on the existing one in `HOSTED_MARKETS_GRID_REFACTOR_WORKLOG.md` line 609 onwards.

**Acceptance criteria**
- All unit + e2e green; baselines met or improved.
- Live OpenFin smoke confirmed (record a one-line outcome per checklist item in the Session log).
- IMPLEMENTED_FEATURES.md updated.
- Branch ready for PR.

**Commit message template** (one or two commits)
```
feat(markets-grid): render top-left caption when host tabs are hidden

Optional caption?: string and tabsHidden?: boolean props. Renders a
single styled span using design-system tokens; no new primitive.
Default behavior unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
```
docs: document hosted-view hooks + workspace-save + tabs-hidden caption

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: `<sha> | session 7 | MarketsGrid caption + verification + docs (PR-ready)`.

---

## Session log

Append one row per session as it completes:

```
(no sha) | session 0 | branch cut from d0549a2; baseline 52/52 typecheck, 32/32 build, 36/36 test
4c58f9f | session 1 | useIab + useOpenFinChannel (14 new specs; 41 widgets-react / 72 repo-wide green)
425d414 | session 2 | useTabsHidden + deriveTabsHidden helper (11 new specs; 52 widgets-react green; live-opt-shape comment pending real-OpenFin verification)
3b714fe | session 3 | workspace-save Channel + useWorkspaceSaveEvent (6 platform + 7 widgets-react specs; 59 widgets-react / 55 openfin-platform tests green; live-OpenFin smoke pending real-runtime check)
<sha>    | session 4 | linking hooks (color + FDC3) + shared windowOptionsSubscription manager; 9 useColorLinking + 8 useFdc3Channel specs; 76 widgets-react tests green; live-OpenFin field-path verification pending for color link
<sha>    | session 5 | useHostedView + barrel + README
<sha>    | session 6 | HostedMarketsGrid → useHostedView + caption + workspace-save wiring
<sha>    | session 7 | MarketsGrid caption + verification + docs (PR-ready)
```
