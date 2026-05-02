# Feature worklog

Per-feature implementation log. Mirrors `NESTED_FIELD_BUGS_WORKLOG.md` in
shape but tracks new capability work rather than bug fixes.

**How to use this worklog.** Each session opens this file, picks the first
section whose **Status** is `pending` or `in-progress`, implements,
verifies, and updates the section to `shipped → <commit>` (or
`abandoned → explanation`) along with the implementation commit. One
feature per session — keeps the context window tight and lets each
feature land as an atomic commit.

**Branch:** `main-updatepackages`.

---

## Feature 1 — Per-view active-profile override on OpenFin (MarketsGrid)

**Status:** shipped → commit `824623a`.

### Goal

Let traders duplicate a MarketsGrid view in OpenFin and view a *different*
profile of the same grid instance in each duplicate, with the choice
surviving a workspace save/restore.

### Problem before

`ProfileManager` stored the active profile id in `localStorage` keyed by
`gridId`. Two views sharing the same `instanceId` (the OpenFin duplicate
case) therefore shared a single active-profile pointer — switching
profile in view A immediately flipped view B. Workspace save/restore had
no way to remember per-view profile state.

### Design

Add a pluggable `ActiveIdSource` to `ProfileManager`:

```ts
interface ActiveIdSource {
  read(): Promise<string | null> | string | null;
  write(id: string): Promise<void> | void;
}
```

- **Read priority** (in `boot()`): `activeIdSource.read()` →
  `localStorage` → reserved Default. Each layer falls through if it has
  no value or points at a row that no longer exists on disk.
- **Write fan-out**: every commit point that flips `activeId`
  (`boot`, `load`, `create`, `clone`, `import` with activate, and
  `remove` of the active profile) calls `activeIdSource.write(id)`
  *after* the existing `localStorage` write. Errors are swallowed —
  the source is best-effort and never blocks the manager.

Markets-grid host injects an OpenFin-aware source via a tiny helper
([`packages/markets-grid/src/openfinViewProfile.ts`](../packages/markets-grid/src/openfinViewProfile.ts)):

- `read()` → `fin.me.getOptions().customData.activeProfileId`
- `write(id)` → `fin.me.updateOptions({ customData: { ..., activeProfileId } })`

Outside OpenFin (`fin` undefined) the factory returns `null` and
`useProfileManager` receives `activeIdSource: undefined` — pure
localStorage fall-through, zero behaviour change for browser/Electron
hosts and tests.

### Why workspace persistence needed no changes

OpenFin's `Platform.getSnapshot()` reads from the same view options that
`updateOptions({ customData })` mutates. Updating `customData` on a profile
switch is therefore captured automatically by the next workspace save
([`packages/openfin-platform/src/workspace-persistence.ts`](../packages/openfin-platform/src/workspace-persistence.ts)
already serializes the live snapshot). On restore, each view boots with
its own `customData.activeProfileId`, the new `ActiveIdSource.read()`
returns it, and `ProfileManager.boot()` loads that profile.

### Files touched

- [`packages/core/src/profiles/ProfileManager.ts`](../packages/core/src/profiles/ProfileManager.ts)
  — `ActiveIdSource` interface + read/write fan-out at five commit
  points.
- [`packages/core/src/profiles/index.ts`](../packages/core/src/profiles/index.ts)
  — export `ActiveIdSource`.
- [`packages/core/src/index.ts`](../packages/core/src/index.ts)
  — re-export `ActiveIdSource` from the package barrel.
- [`packages/core/src/hooks/useProfileManager.ts`](../packages/core/src/hooks/useProfileManager.ts)
  — pass `activeIdSource` through.
- [`packages/markets-grid/src/openfinViewProfile.ts`](../packages/markets-grid/src/openfinViewProfile.ts)
  — new ~50-LOC OpenFin-only source factory.
- [`packages/markets-grid/src/MarketsGrid.tsx`](../packages/markets-grid/src/MarketsGrid.tsx)
  — wire the source into `useProfileManager`.

### Verification

Manual test plan (run after typecheck + unit tests are green):

1. `npm run dev -w @marketsui/openfin-platform` (or the relevant
   provider app) → launch a MarketsGrid view.
2. Duplicate the view from OpenFin's tab menu.
3. In view A, switch to profile X. View B should still show its
   original profile Y.
4. Save the workspace.
5. Reload the platform / re-open the workspace.
6. Confirm both views restore to the profiles they were displaying at
   save time.

Browser smoke (negates regression):

1. Open the demo-react app outside OpenFin.
2. Switch profile, reload page → active profile persists via
   localStorage as before.

### Notes

- The source's `write()` short-circuits when the id is unchanged
  (`current.activeProfileId === id`) to avoid spurious
  `updateOptions` round-trips.
- We do **not** broadcast `customData` updates between views.
  Duplicates start with the same id (OpenFin's duplicate semantics)
  and diverge as each view's user makes a switch — which is exactly
  the desired UX.
- `ProfileManager` knows nothing about OpenFin — the abstraction stays
  in `core`. Other hosts can plug in their own sources (URL hash,
  query string, postMessage from a parent shell, etc.).

---

## Feature 2 — "Save Tab As…" rename now persists across workspace sessions

**Status:** shipped → commits `0ab52a6` (initial) + `9083961` (title-pin
follow-up; see Iteration 2 below).

### Problem before

The rename (commit `98ec87b`) only ran `document.title = "..."` in the
target view via `executeJavaScript`. That's a runtime-only DOM
mutation; the workspace snapshot has nothing to capture. On the next
workspace load the view booted fresh, the page set its own default
title, and the user-chosen tab name was gone.

### Design

Same shape as Feature 1 — small piece of state on `customData`,
captured by the snapshot for free, reapplied by the runtime on boot.

- **RenameViewTab popout** ([apps/markets-ui-react-reference/src/views/RenameViewTab.tsx](../apps/markets-ui-react-reference/src/views/RenameViewTab.tsx))
  on confirm now does two things: (1) `executeJavaScript('document.title = "..."')`
  for the immediate tabstrip update, and (2)
  `view.updateOptions({ customData: { ..., savedTitle } })` so the
  title rides through the workspace snapshot.
- **OpenFinRuntime** ([packages/runtime-openfin/src/OpenFinRuntime.ts](../packages/runtime-openfin/src/OpenFinRuntime.ts))
  gains `applySavedViewTitle()` — reads `customData.savedTitle` during
  construction and reapplies to `document.title`. Best-effort
  no-op when the key is absent or `document` is unavailable.

### Why no platform-side changes

`Platform.getSnapshot()` reads from the same view options that
`updateOptions({ customData })` mutates, so the saved title is
captured automatically — workspace-persistence.ts needed no edits.
This is the same property that made Feature 1 a small change.

### Files touched

- [`apps/markets-ui-react-reference/src/views/RenameViewTab.tsx`](../apps/markets-ui-react-reference/src/views/RenameViewTab.tsx)
  — write `customData.savedTitle` after the `executeJavaScript` call.
- [`packages/runtime-openfin/src/OpenFinRuntime.ts`](../packages/runtime-openfin/src/OpenFinRuntime.ts)
  — `applySavedViewTitle()` helper called from the constructor.
- [`docs/IMPLEMENTED_FEATURES.md`](IMPLEMENTED_FEATURES.md) — corrected
  the §1.O.VTR description (the previous text claimed the rename used
  `view.updateOptions({ title, titlePriority: 'options' })` which is
  the design that was abandoned during implementation — `title` lives
  on the create-time `ViewOptions` shape only, so the call is silently
  dropped at runtime).

### Verification

Manual test plan:

1. Right-click a view tab → "Save Tab As…" → enter a new name → Save.
2. Confirm the tab caption updates immediately.
3. Save the workspace.
4. Close the platform / re-open the workspace.
5. Confirm the renamed tab restores with the user's chosen caption,
   not the page's default `<title>`.

### Iteration 2 — pin against page's mount-time `useEffect`

User-reported regression after iteration 1: tab restores with the
saved name briefly, then flips back to the page's default once the
component finishes loading. Root cause: route views run
`document.title = ...` in a mount `useEffect` (e.g.
`apps/markets-ui-react-reference/src/components/HostedComponent.tsx:280`
and `apps/markets-ui-react-reference/src/views/DataProviders.tsx:57`),
which fires after `OpenFinRuntime`'s constructor-time apply.

Fix: `attachTitlePinObserver()` watches the `<title>` element via
`MutationObserver` for a 3 s post-boot window and resets the title
back to `customData.savedTitle` whenever anything else changes it.
After the window expires the observer disconnects so dynamic title
updates (notification counts, react-helmet, live rename via the
popout) work freely. A `lastAppliedSavedTitle` field guards the
customData poll's re-apply path so unrelated customData mutations
(e.g. `activeProfileId` updates from Feature 1) don't clobber
dynamic titles.

Known minor edge case: a live re-rename within the first 3 s of view
boot may briefly flicker (~500 ms) because the runtime's
`lastCustomData` lags by one poll tick behind the popout's
`updateOptions` write. Self-corrects automatically. Not worth a
chunkier IAB-based "kick" mechanism for the rare case of renaming
during initial boot.
