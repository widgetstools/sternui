# Session 3.1 — Profile state consolidation: audit + design doc

You are a fresh agent session. Your task is to produce a **written design doc** that becomes the playbook for Sessions 3.2 + 3.3. No production code changes in this session — only research and a markdown file.

## Prerequisites

Refactor 1 (MarketsGrid split — Sessions 1.1 + 1.2 + 1.3) must be merged on main:

```sh
git fetch origin main
git log origin/main --oneline -20 | grep -E "characterisation|controller hook|view components"
# Expected: three lines for Sessions 1.1, 1.2, 1.3
```

If any are missing, STOP and ask the user to merge them first.

## Required reading

- [`packages/shared/core/src/profiles/ProfileManager.ts`](../../packages/shared/core/src/profiles/ProfileManager.ts) — 851 LOC, current owner of profile state
- [`packages/shared/core/src/profiles/types.ts`](../../packages/shared/core/src/profiles/types.ts) — `ProfileSnapshot` type
- [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — the other state owner (REST + Dexie mirror)
- [`docs/WORKLOG-DEFERRED-REFACTORS.md`](../WORKLOG-DEFERRED-REFACTORS.md) — Refactor 3 overview
- [`CLAUDE.md`](../../CLAUDE.md)

## Setup

```sh
git fetch origin main
git checkout -b docs/profile-state-design origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

## Task

Produce `docs/PROFILE-STATE-CONSOLIDATION.md`. The next two sessions (3.2 + 3.3) implement what your doc specifies. The doc must answer **every** question those sessions might ask.

### Step 1 — Inventory ProfileManager consumers

```sh
grep -rln "ProfileManager\|profileManager" packages apps \
  --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v dist
```

For each file:
- Which `ProfileManager` methods are called (`saveProfile`, `loadProfile`, `listProfiles`, `subscribe`, etc.)
- Which subscription patterns are used
- Whether it imports the class, a singleton, or constructs its own

Capture in a table.

### Step 2 — Inventory ConfigManager consumers

```sh
grep -rln "configManager\|ConfigManager\." packages apps \
  --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v dist
```

Same fields. Note especially anywhere the same data is being read from both ConfigManager AND ProfileManager — that's the duplication this refactor closes.

### Step 3 — Map the data shapes

For each of `ProfileSnapshot` (core) and the closest equivalent in `@starui/config-service` (probably `AppConfigRow` or similar — read the package), capture:

| Field | ProfileSnapshot | AppConfigRow equivalent | Notes |
|---|---|---|---|
| `id` | string | ? | |
| `gridId` | string | scope path? | |
| `name` | string | ? | |
| `state` | unknown blob | ? | |
| `createdAt` | number ms | ? | |
| `updatedAt` | number ms | ? | |

If the shapes diverge, decide whether to bridge in 3.2 (translate at the façade boundary) or change `AppConfigRow` to accommodate `ProfileSnapshot` directly.

### Step 4 — Map storage paths

ProfileManager and ConfigManager probably both use Dexie. Capture:

| | ProfileManager | ConfigManager |
|---|---|---|
| Dexie DB name | ? | ? |
| Table name | ? | ? |
| Primary key shape | ? | ? |
| REST sync? | no | yes (when restUrl provided) |
| Pending-write queue? | ? | yes (`PENDING_SYNC`) |

If the Dexie databases are **the same**, migration is a single transform of rows from one table to another. If **different**, you need a one-shot copy script.

### Step 5 — Map failure-mode parity

Each thing ProfileManager does, can ConfigManager do?

| Capability | ProfileManager | ConfigManager | Gap |
|---|---|---|---|
| save | ✓ | ✓ | — |
| list | ✓ | ✓ | — |
| delete | ? | ? | ? |
| clone | ? | ? | ? |
| rename | ? | ? | ? |
| export to JSON | ? | ? | ? |
| import from JSON | ? | ? | ? |
| subscribe (live updates) | ? | ? | ? |
| pending-sync queue (REST failure) | no | yes | ProfileManager users gain offline-tolerance after migration |

Any cell that's `✓` for ProfileManager and `?` for ConfigManager needs a new ConfigManager method added in Session 3.2.

### Step 6 — Write the design doc

Create `docs/PROFILE-STATE-CONSOLIDATION.md` with these sections:

```markdown
# Profile state consolidation — design

> Audit + plan for Sessions 3.2 and 3.3.

## Current state

[Insert your inventory tables from Steps 1-5]

## Target state

A single read/write path: `ConfigManager.profiles` (or whatever API
shape we settle on). `ProfileManager` becomes a thin façade — same
public surface, internally delegating to ConfigManager.

### New ConfigManager API surface

[List the methods to add — e.g.]

- `configManager.profiles.list(gridId): Promise<readonly ProfileSnapshot[]>`
- `configManager.profiles.save(snap: ProfileSnapshot): Promise<void>`
- `configManager.profiles.delete(gridId, profileId): Promise<void>`
- `configManager.profiles.subscribe(gridId, fn): Unsubscribe`

(Each method must close every gap from Step 5.)

### Storage decision

[Choose one — justify]

**Option A: Reuse ConfigManager's existing Dexie tables.**
ProfileSnapshot rows become AppConfigRow rows with a fixed
`category: 'profile'` discriminator. Pros: no migration. Cons:
AppConfigRow schema absorbs a foreign shape.

**Option B: Add a dedicated `profiles` table to ConfigManager's Dexie DB.**
Pros: clean separation. Cons: ConfigManager now owns two tables,
and the migration in Session 3.2 must copy from ProfileManager's
existing table.

**Chosen: ____**

[Spell out the reason. The next session implements this.]

## Migration plan

### What runs at first boot after Session 3.2's PR lands

[Describe the migration]

1. Open the ConfigManager Dexie DB
2. Check the `profile-migration-v1` flag in a `_meta` table or localStorage
3. If absent, copy every row from `<old table>` to `<new location>`
4. Set the flag to `'done'`
5. Idempotent — running again is a no-op

### Risk: profile loss

If Session 3.3 ships before 3.2's migration has run on a user device,
that user loses their profiles. Mitigation: the two PRs MUST be
merged separately, with enough soak time between them that every
user boots once on the façade.

## Session 3.2 work (preview)

1. Add the new ConfigManager API methods listed above
2. Implement the Dexie migration as a function in
   `packages/shared/services/config-service/src/migrations/profiles-v1.ts`
3. Rewrite `ProfileManager` so its methods delegate to the new API
4. Public signature of `ProfileManager` is unchanged
5. Move all existing `ProfileManager.test.ts` cases over
6. Add tests for the new ConfigManager methods + migration idempotence

## Session 3.3 work (preview)

1. Find every `import { ProfileManager } from '@starui/core'` in
   packages and apps
2. Replace each with `useHost().configManager.profiles.*` (or the
   final API surface)
3. Update `@starui/grid-react`'s `useProfileManager` hook to delegate
4. Delete `packages/shared/core/src/profiles/ProfileManager.ts`
5. Stop exporting `ProfileManager` from the `@starui/core` barrel
6. Keep `ProfileSnapshot` (it's still a useful type)

## Risk list

Concrete e2e scenarios that could regress:

- [list 5-8 specific scenarios. Examples:]
- Open a profile, edit columns, switch profile, switch back → state restores
- Save a profile, hard reload, profile appears in the picker
- Open ConfigBrowser popout, profile rows are visible (NEW — they weren't before)
- Cross-user scoping: dev1 sees dev1's profiles, alice sees alice's
- REST mode: save a profile, kill the server, save another, restart server → pending writes drain

## Out of scope

[List what stays unchanged]

- AppData mirror (separate concern)
- The dock's theme action (already migrated in the theme reducer PR)
- ProfileSnapshot type shape
```

### Step 7 — Sanity check the doc

Read your own doc as if you were a fresh agent. Could you start Session 3.2 from it without re-doing the audit? If not, expand the sections where you'd need more.

In particular, the **Storage decision** section must be explicit: a Session 3.2 agent should not be deciding between Option A and Option B on the fly.

## Verification

```sh
# 1. Markdown linting / preview
# Open docs/PROFILE-STATE-CONSOLIDATION.md and verify it renders correctly
ls docs/PROFILE-STATE-CONSOLIDATION.md

# 2. No production code touched
git status --short
# Expected: only the new doc file appears

# 3. Final gate (defensive — should be unaffected since no code changed)
npx turbo typecheck build test
# Expected: green
```

## Commit, push, open PR

```sh
git add docs/PROFILE-STATE-CONSOLIDATION.md
git commit -m "$(cat <<'EOF'
docs: profile state consolidation design

Adds the playbook for Sessions 3.2 + 3.3 of the deferred-refactors
worklog. Covers:

- Current state — ProfileManager vs ConfigManager (consumer
  inventory + data shape comparison + storage path comparison +
  failure-mode parity)
- Target state — new ConfigManager.profiles.* API + storage choice
- Migration plan — first-boot Dexie copy, idempotency flag
- Risk list — concrete e2e scenarios that could regress
- Session 3.2 work (preview)
- Session 3.3 work (preview) + the 2-PR merge rule that prevents
  profile loss on user devices

No production code changes. Read this doc before opening
Session 3.2 — it answers every question that session's agent will
ask.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin docs/profile-state-design
gh pr create --title "docs: profile state consolidation design" --body "<see commit>"
```

Report the PR URL. **Block on user review** before Session 3.2 begins — the storage decision is the most consequential choice in the whole worklog.

## Hand-off to Session 3.2

Once this doc PR is merged on main, paste the contents of
`docs/sessions/session-3-2-profilemanager-facade.md` into a new
agent session. That session will implement what your doc specifies.

## Out of scope

- Writing any TypeScript
- Modifying any production file
- Building or running the apps
- Choosing storage shapes without justification (every decision in the doc must be explained)
