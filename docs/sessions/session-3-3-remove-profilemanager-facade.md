# Session 3.3 — Remove `ProfileManager` façade, migrate consumers

You are a fresh agent session. Session 3.2's façade PR has been on main long enough for every developer device to have booted once and run the migration. Your task is to migrate every consumer off the `ProfileManager` import and delete the façade.

## Prerequisites (read carefully)

```sh
git fetch origin main
git log origin/main --oneline -20 | grep "ProfileManager backed by ConfigManager"
# Expected: the Session 3.2 façade PR commit
```

**Critically:** confirm with the user that **enough time has passed** since Session 3.2 merged. If anyone's local IndexedDB hasn't run the migration yet, their profiles vanish when this PR ships. The safe minimum is "every developer has run the app at least once since 3.2 merged."

If unclear, STOP and ask. **Don't proceed on assumption.**

## Required reading

- [`docs/PROFILE-STATE-CONSOLIDATION.md`](../PROFILE-STATE-CONSOLIDATION.md) — Session 3.1's design doc
- [`docs/sessions/session-3-2-profilemanager-facade.md`](./session-3-2-profilemanager-facade.md) — what state the façade is in
- [`packages/shared/core/src/profiles/ProfileManager.ts`](../../packages/shared/core/src/profiles/ProfileManager.ts) — currently a façade; this session deletes it

## Setup

```sh
git fetch origin main
git checkout -b feat/remove-profilemanager-facade origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

Capture current LOC of files this session deletes:

```sh
wc -l packages/shared/core/src/profiles/ProfileManager.ts
# Note the value — the commit message reports the LOC reduction.
```

## Task

Find every `import { ProfileManager }` in packages and apps. Replace each with the new direct ConfigManager access. Delete `ProfileManager.ts` and its barrel export.

### Step 1 — Find all consumers

```sh
grep -rln "from '@starui/core'.*ProfileManager\|from \"@starui/core\".*ProfileManager" packages apps \
  --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v dist
```

Also catch other import shapes:

```sh
grep -rln "import.*ProfileManager.*from '@starui/core'" packages apps \
  --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v dist
```

Capture the full list. There will likely be 5-15 hits.

### Step 2 — Migrate each call site

For each consumer file, the migration is:

**Before:**
```ts
import { ProfileManager } from '@starui/core';

const pm = new ProfileManager(gridId, storageAdapter);
const profiles = await pm.listProfiles();
pm.subscribe(handleChange);
```

**After:**
```ts
import { useHost } from '@starui/host-wrapper-react'; // or whatever exposes ConfigManager
// or, for non-React code:
import type { ConfigClient } from '@starui/config-service';

const { configManager } = useHost();
const profiles = await configManager.profiles.list(gridId);
const unsubscribe = configManager.profiles.subscribe(gridId, handleChange);
```

For React hook consumers, the existing `useProfileManager` hook in `@starui/grid-react` becomes a thin wrapper. Read its current shape and decide:

- **Option A:** keep the hook signature; internally call ConfigManager.profiles
- **Option B:** deprecate the hook; consumers call `useHost().configManager.profiles` directly

Pick whichever the design doc prefers. If unclear, default to Option A (less consumer churn).

For non-React consumers (e.g., a module that takes a `storageAdapter` argument), the API surface changes from accepting `StorageAdapter` to accepting `ConfigClient`. Update each consumer's signature too.

### Step 3 — Delete the façade

```sh
git rm packages/shared/core/src/profiles/ProfileManager.ts
git rm packages/shared/core/src/profiles/ProfileManager.test.ts  # tests move to config-service
```

Keep `types.ts` — `ProfileSnapshot` is still a useful type. Update the package barrel:

```ts
// packages/shared/core/src/profiles/index.ts
// REMOVE:
// export { ProfileManager } from './ProfileManager.js';

// KEEP:
export type { ProfileSnapshot } from './types.js';
```

Update the top-level `@starui/core` barrel similarly if it re-exports ProfileManager.

### Step 4 — Decide about the legacy Dexie table

The migration from Session 3.2 copied rows into the new table but left the legacy table in place (defensive — restores possible if migration broke). At this stage you can:

- **Drop the legacy table** in a Dexie migration v2 — frees disk, no rollback path
- **Leave it** — costs ~nothing; can drop in a follow-up

**Default: leave it.** The follow-up PR can drop it once we're confident this refactor is stable.

### Step 5 — Add a "ProfileManager is gone" guard

In `packages/shared/core/src/profiles/index.ts`, add a clear error for accidental imports:

```ts
// No-op TypeScript barrel — only types are exported now.
// `ProfileManager` lives at `configManager.profiles.*` since the
// 3.3 refactor. See docs/PROFILE-STATE-CONSOLIDATION.md.
export type { ProfileSnapshot } from './types.js';
```

If a developer types `import { ProfileManager } from '@starui/core'` after this, they'll get a TypeScript error pointing them at the new API — desired behaviour.

### Step 6 — Update docstrings

Search for stale references in comments:

```sh
grep -rn "ProfileManager" packages apps \
  --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v dist | grep -v "ProfileSnapshot"
```

Update each comment to reference `configManager.profiles.*` instead.

## Verification

```sh
# 1. Every workspace package tests
npm test
# Expected: all green, no regression vs baseline

# 2. Every app typechecks
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 3. E2E FULL regression — this is the last profile-state PR, so the
#    full suite must pass.
npx playwright test
# Expected: 193/193

# 4. LOC verification — confirm the deletion
wc -l packages/shared/core/src/profiles/*.ts
# Expected: no ProfileManager.ts, only types.ts + index.ts

# 5. Final gate
npx turbo typecheck build test
# Expected: 55/55 typecheck, 33/33 build, 42/42 test
```

## Manual smoke (mandatory — last profile-state PR)

For each of the three apps:

```sh
npm run dev -w @starui/demo-react
npm run dev -w @starui/demo-configservice-react
npm run dev -w @starui/markets-ui-react-reference
```

In each:
- Open a blotter / grid
- Switch between profiles
- Save current profile (change column width, save, reload, verify)
- Clone profile
- Rename clone
- Delete clone
- Export profile to JSON
- Import a profile from JSON

Every interaction must behave **identically** to before this session. If anything is subtly different, the consumer migration in Step 2 is incomplete.

## Commit, push, open PR

```sh
git add -A
git status --short
# Expected: ProfileManager.ts, ProfileManager.test.ts shown as deleted;
# every consumer file shown as modified; index.ts updated.

git commit -m "$(cat <<'EOF'
refactor(core): remove ProfileManager — consumers use ConfigManager directly

Final step of the profile state consolidation (Session 3.3 of the
deferred-refactors worklog).

Deletes:
  - packages/shared/core/src/profiles/ProfileManager.ts (-XXX LOC)
  - packages/shared/core/src/profiles/ProfileManager.test.ts (-YYY LOC)
    [test cases live in @starui/config-service since Session 3.2]

Migrates every consumer (N files) from
  `new ProfileManager(gridId, adapter).listProfiles()`
to
  `configManager.profiles.list(gridId)`

@starui/grid-react's `useProfileManager` hook is now a thin wrapper
over `useHost().configManager.profiles` — the hook signature is
unchanged so widget consumers don't need to touch their code.

ProfileSnapshot type is kept (still exported from @starui/core/profiles).

The legacy Dexie table is left in place defensively — a follow-up PR
can drop it once the new layout has soaked.

Verification:
  - npm test (every package): green
  - npm run typecheck (every app): clean
  - npx playwright test: 193/193 — last profile-state PR, so full
    regression mandatory
  - Manual smoke on every app: every profile interaction behaves
    identically
  - Final gate: npx turbo typecheck build test — green
  - Net deletion: ~XXX LOC

This was Session 3.3 — separated from Session 3.2's façade PR so
every user boots once on the migration path before the legacy
ProfileManager is removed. See docs/PROFILE-STATE-CONSOLIDATION.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/remove-profilemanager-facade
gh pr create --title "refactor(core): remove ProfileManager façade" --body "<see commit>"
```

Report the PR URL.

## Hand-off — cleanup PR

After this PR merges, **Refactor 3 is complete**. The full audit's 12 items are also complete (3 already shipped, 9 in this worklog).

A short follow-up PR is recommended to:
1. Strip the dev-trace `console.log` lines from `MarketsGrid.tsx` / `useMarketsGridController.ts` (they were preserved through the refactors because the characterisation tests assert on them; with Refactor 3 done they can be gated behind `import.meta.env.DEV` or removed)
2. Update `docs/ARCHITECTURE.md` to describe the new seams (`useMarketsGridController`, theme reducer, popout transport, `configManager.profiles`)
3. Drop the legacy Dexie table from Session 3.2's migration (after another soak period)

That follow-up is described in the bottom section of [`docs/WORKLOG-DEFERRED-REFACTORS.md`](../WORKLOG-DEFERRED-REFACTORS.md).

## Out of scope

- Removing other modules from `@starui/core`
- Renaming `ProfileSnapshot`
- Touching the AppData mirror
- Dropping the legacy Dexie table (follow-up PR)
- The console.log strip (follow-up PR)
- Documentation updates beyond the consumer file docstrings (follow-up PR)
