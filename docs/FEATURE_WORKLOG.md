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
