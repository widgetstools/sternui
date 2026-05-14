# Session 3.2 — `ProfileManager` → `ConfigManager` façade + Dexie migration

You are a fresh agent session. Session 3.1's design doc (`docs/PROFILE-STATE-CONSOLIDATION.md`) is merged. Your task is to (1) add the new ConfigManager API the doc specifies, (2) write the Dexie migration, and (3) rewrite `ProfileManager` as a thin façade that delegates to the new API.

## Prerequisites

```sh
git fetch origin main
git log origin/main --oneline -10 | grep "profile state consolidation"
# Expected: the "docs: profile state consolidation design" commit
ls docs/PROFILE-STATE-CONSOLIDATION.md
# Expected: file exists
```

If either is missing, STOP and ask the user to merge Session 3.1 first.

## Required reading

- **[`docs/PROFILE-STATE-CONSOLIDATION.md`](../PROFILE-STATE-CONSOLIDATION.md)** — your source of truth for the API surface + storage choice. Read it end-to-end before opening any source file.
- [`packages/shared/core/src/profiles/ProfileManager.ts`](../../packages/shared/core/src/profiles/ProfileManager.ts) — the current implementation. After this session it becomes a façade.
- [`packages/shared/core/src/profiles/ProfileManager.test.ts`](../../packages/shared/core/src/profiles/ProfileManager.test.ts) — existing tests; every case must still pass against the façade.
- [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — where new methods land
- [`CLAUDE.md`](../../CLAUDE.md)

## Setup

```sh
git fetch origin main
git checkout -b feat/profilemanager-facade origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

Capture the current `core` test count so you can verify no regression:

```sh
npm test -w @starui/core 2>&1 | tail -5
# Note the X/X count.
```

## Task

Follow what the design doc specifies. The high-level sequence is:

1. Add new ConfigManager methods (matching the API surface section of the doc)
2. Write the Dexie migration in `packages/shared/services/config-service/src/migrations/profiles-v1.ts`
3. Rewrite `ProfileManager` as a façade delegating to (1)
4. Move + adapt the existing `ProfileManager.test.ts` cases
5. Add new tests for the migration + the new ConfigManager methods

### Step 1 — Add the ConfigManager API

Read the **New ConfigManager API surface** section of the design doc. Add each method. Likely surface (adapt to the doc):

```ts
// packages/shared/services/config-service/src/ConfigManager.ts (or a new
// profiles.ts module that ConfigManager re-exports)

export class ConfigManager {
  // ... existing surface

  readonly profiles = {
    list: async (gridId: string): Promise<readonly ProfileSnapshot[]> => {
      // Read from the Dexie table chosen in the design doc.
    },
    save: async (snap: ProfileSnapshot): Promise<void> => {
      // Persist + queue REST sync if restUrl is set.
    },
    delete: async (gridId: string, profileId: string): Promise<void> => {
      // ...
    },
    subscribe: (gridId: string, fn: (profiles: readonly ProfileSnapshot[]) => void): Unsubscribe => {
      // Live updates. Match whatever ProfileManager's subscribe semantics are today
      // (eager initial emit? skip until first change?).
    },
    // Add anything else the doc specifies (clone, rename, export, import, etc.)
  };
}
```

**Critical**: every method in the doc must be implemented. Don't ship a partial surface.

### Step 2 — Write the Dexie migration

```ts
// packages/shared/services/config-service/src/migrations/profiles-v1.ts

/**
 * One-shot migration: copy ProfileManager-owned rows into ConfigManager's
 * profile tables.
 *
 * Idempotent: a `profile-migration-v1` flag on Dexie's `_meta` table
 * (or whatever the design doc specifies) prevents re-running.
 *
 * Runs on the first ConfigManager.init() after the façade PR lands.
 * After Session 3.3 ships, the legacy ProfileManager Dexie table is
 * dropped — but only after every user has booted once on the façade.
 */

import Dexie from 'dexie';

const MIGRATION_KEY = 'profile-migration-v1';

export async function migrateProfilesIfNeeded(db: Dexie): Promise<{ migrated: number }> {
  const meta = await db.table('_meta').get(MIGRATION_KEY);
  if (meta?.value === 'done') return { migrated: 0 };

  // 1. Read every row from the legacy ProfileManager table.
  //    Table name from the design doc — fill in.
  const legacyRows = await db.table('LEGACY_TABLE_NAME').toArray();

  // 2. Translate each to the new shape (if shapes differ).
  //    See ProfileSnapshot ↔ AppConfigRow mapping in the design doc.
  const translated = legacyRows.map(legacyToNew);

  // 3. Bulk insert into the new table, using `put` so re-running
  //    doesn't error on conflict.
  await db.table('NEW_TABLE_NAME').bulkPut(translated);

  // 4. Set the flag.
  await db.table('_meta').put({ key: MIGRATION_KEY, value: 'done' });

  return { migrated: translated.length };
}

function legacyToNew(row: unknown): unknown {
  // Adapt fields per the design doc.
  // ...
}
```

Wire the migration into `ConfigManager.init()` so it runs once on first boot.

### Step 3 — Rewrite `ProfileManager` as a façade

```ts
// packages/shared/core/src/profiles/ProfileManager.ts (REWRITE)

import type { ConfigClient } from '@starui/config-service';
import type { ProfileSnapshot } from './types.js';

/**
 * ProfileManager — thin façade over ConfigManager.profiles.*
 *
 * Public API unchanged from the pre-consolidation version so every
 * existing consumer continues to compile. Internal storage now lives
 * in ConfigManager — see docs/PROFILE-STATE-CONSOLIDATION.md.
 *
 * Session 3.3 removes this façade entirely once consumers have
 * migrated to direct ConfigManager access.
 */
export class ProfileManager {
  constructor(
    private readonly gridId: string,
    private readonly configManager: ConfigClient,
  ) {}

  async listProfiles(): Promise<readonly ProfileSnapshot[]> {
    return this.configManager.profiles.list(this.gridId);
  }

  async saveProfile(snap: ProfileSnapshot): Promise<void> {
    return this.configManager.profiles.save(snap);
  }

  async deleteProfile(profileId: string): Promise<void> {
    return this.configManager.profiles.delete(this.gridId, profileId);
  }

  subscribe(fn: (profiles: readonly ProfileSnapshot[]) => void): () => void {
    return this.configManager.profiles.subscribe(this.gridId, fn);
  }

  // ...every other public method of the old ProfileManager.
  // Each becomes one-liner delegation. If a method was non-trivial
  // (e.g., import/export with JSON parsing), keep the non-trivial
  // bits — only the storage call site changes.
}
```

**Don't change the public signature.** Every parameter, every return type, every method name stays as-is. If the old class had a `dispose()` method, the façade has one too (it might be a no-op now).

### Step 4 — Move + adapt tests

`ProfileManager.test.ts` should still pass. Many tests probably constructed `new ProfileManager(gridId, storageAdapter)` — but the new façade takes `new ProfileManager(gridId, configManager)`. Update the test setup to construct a ConfigManager (or a stub) instead.

If the design doc said to deprecate the `storageAdapter` parameter, the façade may need to accept both shapes for back-compat through Session 3.3:

```ts
// In ProfileManager constructor — accept both for the façade's life:
constructor(
  gridId: string,
  configManagerOrAdapter: ConfigClient | StorageAdapter,
) {
  if (isConfigClient(configManagerOrAdapter)) {
    this.configManager = configManagerOrAdapter;
  } else {
    // Wrap the StorageAdapter in an ad-hoc ConfigManager-shaped object.
    // This branch dies in Session 3.3 when consumers stop passing
    // StorageAdapter.
    this.configManager = adaptStorageAdapter(configManagerOrAdapter);
  }
}
```

Cite the design doc for whichever pattern you choose.

### Step 5 — Add new tests

`packages/shared/services/config-service/src/profiles.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { ConfigManager } from './ConfigManager';
import { migrateProfilesIfNeeded } from './migrations/profiles-v1';

describe('ConfigManager.profiles', () => {
  let cm: ConfigManager;

  beforeEach(async () => {
    cm = new ConfigManager(/* args per design doc */);
    await cm.init();
  });

  afterEach(async () => {
    await cm.dispose();
  });

  it('list returns rows the migration copied', async () => {
    // ...
  });

  it('save round-trips: save → list returns the saved row', async () => {
    // ...
  });

  it('delete removes the row from subsequent list', async () => {
    // ...
  });

  it('subscribe fires when a profile is saved', async () => {
    // ...
  });

  it('migration is idempotent — running twice produces no duplicates', async () => {
    // Set up a Dexie db with N legacy rows. Run migration. Assert N
    // new rows. Run again. Assert still N new rows (no doubling).
  });
});
```

## Verification

```sh
# 1. Core tests (ProfileManager façade)
npm test -w @starui/core
# Expected: same pass count as the baseline. ANY regression here is a behaviour break.

# 2. ConfigManager tests (new methods + migration)
npm test -w @starui/config-service

# 3. Markets-grid tests (uses ProfileManager — must still work)
npm test -w @starui/markets-grid

# 4. Apps typecheck
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 5. E2E FULL regression
npx playwright test
# Expected: 193/193 (or current main's baseline). Pay special attention to:
#   - v2-profile-lifecycle.spec.ts
#   - v2-profile-stress.spec.ts
#   - v2-two-grid-isolation.spec.ts

# 6. Final gate
npx turbo typecheck build test
```

## Manual smoke (mandatory — this is the migration session)

Boot every affected app once and verify profile data survives:

```sh
# In one terminal:
npm run dev -w @starui/demo-configservice-react
# In the browser at http://localhost:5191:
# - Save a profile (e.g., rename a column, click save)
# - Confirm it appears in the picker
# - Open ConfigBrowser popout (Database icon on toolbar)
# - Confirm the profile row is visible there too (it WASN'T visible before — that's the audit symptom this PR closes)
# - Reload the page
# - Profile is still there
```

Repeat with `demo-react` and `markets-ui-react-reference`.

## Commit, push, open PR

```sh
git add packages/shared/core/src/profiles/ \
        packages/shared/services/config-service/src/ \
        docs/PROFILE-STATE-CONSOLIDATION.md  # only if you amended it
git commit -m "$(cat <<'EOF'
refactor(core): ProfileManager backed by ConfigManager — single source of truth

Implements docs/PROFILE-STATE-CONSOLIDATION.md (Session 3.2 of the
deferred-refactors worklog).

Changes:

1. New ConfigManager.profiles API:
     - list(gridId)
     - save(snap)
     - delete(gridId, profileId)
     - subscribe(gridId, fn)
     - [+ whatever else the design doc specified]

2. Dexie migration at packages/shared/services/config-service/src/migrations/profiles-v1.ts
   Runs once on ConfigManager.init() after this PR lands. Copies
   legacy ProfileManager rows into ConfigManager's profile tables.
   Idempotent (guarded by `profile-migration-v1` meta flag).

3. ProfileManager is now a thin façade over ConfigManager.profiles.
   Public signature UNCHANGED — every consumer continues to compile.
   Session 3.3 removes this façade once consumers migrate to direct
   ConfigManager access.

Why two PRs (3.2 façade, 3.3 remove): if 3.3 ships before this
migration has run on user devices, users lose their profiles. The
façade ensures every user boots once on the migration path before
the façade is removed.

Verification:
  - npm test -w @starui/core: X/X (= baseline)
  - npm test -w @starui/config-service: green
  - npm test -w @starui/markets-grid: green
  - npx playwright test: 193/193
  - Manual smoke: ConfigBrowser popout shows profile rows (NEW —
    they were invisible before this PR closed the duplication)
  - Final gate: npx turbo typecheck build test — green

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/profilemanager-facade
gh pr create --title "refactor(core): ProfileManager façade over ConfigManager" --body "$(cat <<'EOF'
Session 3.2 of the deferred refactors. **Do NOT merge Session 3.3 until
this PR has been on main long enough for every developer device to
boot once.** See `docs/PROFILE-STATE-CONSOLIDATION.md` for the rationale.

## Summary

[Expand the commit message into a full PR body. List the new
ConfigManager methods, attach a sample migration log, link to the
design doc.]

## Test plan

- [x] npm test -w @starui/core: X/X (= baseline)
- [x] npm test -w @starui/config-service: green
- [x] npm test -w @starui/markets-grid: green
- [x] npx playwright test: 193/193
- [x] Final gate: npx turbo typecheck build test — green
- [x] Manual smoke on every app — see PR description

## Worktree note

This PR doesn't add a new workspace package, so the worktree symlink
trap doesn't apply. But it DOES introduce a Dexie schema migration —
every developer's local IndexedDB will run the one-shot copy on next
boot.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL. **Tell the user**: don't merge Session 3.3 until this has been on main for at least a week (or until everyone has booted once locally).

## Out of scope

- Removing the `ProfileManager` façade — that's Session 3.3
- Migrating consumer call sites — that's Session 3.3
- Changing `ProfileSnapshot` shape
- Dropping the legacy Dexie table — that's a future cleanup PR after 3.3 lands
- Touching the AppData mirror
- Anything outside profile state
