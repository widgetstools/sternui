# Code Organization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the marketsui-platform monorepo into the bucket layout defined by [`code-organization.md`](./code-organization.md) — without losing a single feature, functionality, look-and-feel, or behavior.

**Architecture:** Eleven sequenced PRs, each mechanically isolated and individually revertible. PR-1 deletes dead apps + the Stern shell. PR-1.5 sweeps confirmed dead code in surviving packages. PR-2 through PR-4 dismantle the old dock/registry editors and extract Workspace Setup to the new tools/ sub-bucket. PR-5 through PR-9 perform pure folder moves to land every package in its sub-bucket and split the `core` god-package into vanilla-only `core` + React `grid-react`. PR-10 updates workspace globs and docs. PR-11 adds the tarball-consumption workflow.

**Tech Stack:** npm 10 workspaces (never pnpm/yarn), Turborepo 2, TypeScript 5, Vitest 4 + jsdom 29 (unit), Playwright 1.59 (e2e), conventional commits.

---

## ⚠ Paramount constraint — applies to every Task

**Zero loss of features, functionality, look-and-feel, or behavior.**
This overrides every other consideration in this plan. Cleaner package
layout is the goal; preserving every end-user behavior is the constraint.

If a Task cannot satisfy this constraint as written, **the Task is wrong** —
pause, consult the user, do not paper over with TODOs or "fix later" notes.

---

## Verification protocol — every Task runs before-and-after

Every Task starts with a baseline capture and ends with a parity check.

### Pre-task baseline (run before touching anything)

```bash
# From repo root
git status                                                # must be clean
git checkout main && git pull && git checkout -b <branch> # fresh branch off main

# Capture baseline
npx turbo run typecheck build test 2>&1 | tee /tmp/before-typecheck-build-test.log
npx turbo run e2e 2>&1 | tee /tmp/before-e2e.log || true   # e2e may fail; record state
```

Note the **exact** counts in [`docs/E2E_STATUS.md`](../E2E_STATUS.md):
- Vitest baseline: **298 passing**
- Playwright baseline: **195/214 passing** (19 pre-existing failures)

### Post-task parity check (run before committing the final commit of the Task)

```bash
npx turbo run typecheck build test 2>&1 | tee /tmp/after-typecheck-build-test.log
npx turbo run e2e 2>&1 | tee /tmp/after-e2e.log || true

diff /tmp/before-typecheck-build-test.log /tmp/after-typecheck-build-test.log
# Acceptable diffs: build cache messages, file-path strings, timing.
# Unacceptable diffs: any new failure, any test count regression.
```

**Acceptance gate (binary):**

- Vitest passing count ≥ 298 (baseline).
- Playwright passing count ≥ 195 (baseline). NEVER WORSE.
- `typecheck` exit code = 0.
- `build` exit code = 0.

If any gate fails: **stop, do not commit, investigate**.

### Visual/UX parity check (Tasks that touch React/Angular packages)

For any Task that modifies a package consumed by a demo or reference app:

```bash
# In a separate terminal:
cd apps/demo-react && npm run dev
# Open http://localhost:5173 (or whatever port)
# Manually exercise: dock, workspace setup, profile save/load, config browser, any visible UI
# Compare against pre-task screenshots if doubt arises
```

For OpenFin behavior: launch the OpenFin reference app and confirm dock, workspace, layout persist exactly as before.

> The user is the visual-parity authority. When any visual or interactive doubt arises, stop and ask.

---

## Commit + branch conventions

- One PR per Task. Branch name: `refactor/pr-<NN>-<slug>`. Examples:
  `refactor/pr-01-delete-dead-apps`, `refactor/pr-08-extract-grid-react`.
- Conventional commit prefixes: `chore:`, `refactor(<pkg>):`, `feat(<pkg>):`, `fix(<pkg>):`, `docs:`, `test:`.
- Every commit ends with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- Frequent commits per Task — every logical step, not one mega-commit per PR.

---

## Task 1 (PR-1): Delete dead apps + Stern shell + axe-blotter + fi-trading

**Goal:** Pure deletions. No rewiring required because the deleted apps are unused (empty or out-of-scope), and the Stern package's only consumer (`widgets-react/src/blotter/BlotterToolbar.tsx`) needs its single import dropped.

**Files:**

- Delete (recursive):
  - `apps/stern-reference-react/`
  - `apps/stern-reference-angular/`
  - `apps/fi-trading-reference/`
  - `apps/fi-trading-reference-angular/`
  - `apps/axe-blotter-demo/`
  - `apps/markets-ui-angular-reference/` (deferred — Angular parity behind; see Decision 1)
  - `packages/shared/openfin-platform-stern/`

- Modify:
  - `package.json` (root) — remove the deleted apps and the `openfin-platform-stern` package from the workspace globs / explicit list.
  - `packages/react/widgets-react/package.json` — remove `"@starui/openfin-platform-stern"` from `dependencies`.
  - `packages/react/widgets-react/src/blotter/BlotterToolbar.tsx` — drop any `@starui/openfin-platform-stern` import; replace usage with the equivalent symbol from a non-Stern package (verify what's actually being used in step 1 below).

- [ ] **Step 1: Pre-task baseline + branch**

```bash
cd /Users/develop/wfh/marketsui-platform
git status                       # MUST be clean
git checkout main && git pull
git checkout -b refactor/pr-01-delete-dead-apps
npx turbo run typecheck build test 2>&1 | tee /tmp/pr01-before.log
grep -E "passing|failing|errors|Tests" /tmp/pr01-before.log | tail -20
```

Expected: typecheck/build green; Vitest ≥ 298 passing.

- [ ] **Step 2: Inventory the Stern consumer surface**

```bash
grep -rn "@starui/openfin-platform-stern" packages apps --include='*.ts' --include='*.tsx' --include='package.json' | grep -v dist
```

Expected output: at minimum the `widgets-react/src/blotter/BlotterToolbar.tsx` consumer plus the `widgets-react/package.json` dep declaration. Any OTHER consumer surfaced by this grep means the deletion plan needs revisiting before continuing — pause and consult Decision 4 of the spec.

- [ ] **Step 3: Repoint or drop the Stern import in BlotterToolbar.tsx**

Read the import. If it pulls a symbol that has a non-Stern equivalent (e.g. a generic `OpenFinAdapter` exists in `@starui/openfin-platform`), switch to that. If the import is for Stern-specific behavior (bank-customized chrome, brand colors, Stern-only IAB topic), the behavior must be either (a) preserved by extracting to a non-Stern location, or (b) explicitly removed with user sign-off because Stern is being deleted from the product.

```bash
# Inspect the file:
sed -n '1,50p' packages/react/widgets-react/src/blotter/BlotterToolbar.tsx
```

Make the edit using the Edit tool. Document the resolution in the PR description.

- [ ] **Step 4: Delete the Stern package directory**

```bash
git rm -r packages/shared/openfin-platform-stern/
```

- [ ] **Step 5: Drop the Stern dep from widgets-react**

Edit `packages/react/widgets-react/package.json`:

```diff
   "dependencies": {
-    "@starui/openfin-platform-stern": "*",
     "@starui/openfin-platform": "*",
     ...
   }
```

- [ ] **Step 6: Delete the dead apps**

```bash
git rm -r apps/stern-reference-react/
git rm -r apps/stern-reference-angular/
git rm -r apps/fi-trading-reference/
git rm -r apps/fi-trading-reference-angular/
git rm -r apps/axe-blotter-demo/
git rm -r apps/markets-ui-angular-reference/
```

- [ ] **Step 7: Update root workspace globs**

Read `package.json` at repo root, then remove every deleted path from the `"workspaces"` array.

```bash
grep -n "workspaces" package.json
# Inspect and edit using the Edit tool.
```

- [ ] **Step 8: Reinstall to update lockfile**

```bash
npm ci --legacy-peer-deps
```

Expected: clean install, no errors. The `--legacy-peer-deps` flag is required (see CLAUDE.md).

- [ ] **Step 9: Run the baseline-equivalent post-task checks**

```bash
npx turbo run typecheck build test 2>&1 | tee /tmp/pr01-after.log
grep -E "passing|failing|errors|Tests" /tmp/pr01-after.log | tail -20
```

Acceptance: Vitest passing ≥ 298. Build green. Typecheck green.

- [ ] **Step 10: Manual visual check**

```bash
cd apps/demo-react && npm run dev
# Open in browser. Verify:
#   - Dock loads.
#   - MarketsGrid renders.
#   - Profile save/load works.
#   - No console errors.
# Then Ctrl+C to stop.
cd -
```

If anything looks off: stop, do not commit, investigate. The Stern deletion should not affect demo-react because demo-react never depended on Stern — but visual confirmation is the catch-net.

- [ ] **Step 11: Update IMPLEMENTED_FEATURES.md**

Open `docs/IMPLEMENTED_FEATURES.md`. Remove any entries describing Stern-specific features (the bank shell, fi-trading-specific behavior, axe-blotter functionality). Add a single line in a "Removed" or "Cleanup" section noting the deletions per Decision 1 of the code-organization spec.

- [ ] **Step 12: Commit and open PR**

```bash
git add -A
git status     # review what's staged
git commit -m "$(cat <<'EOF'
chore: delete Stern shell, fi-trading, axe-blotter, and stale Angular reference

Per docs/plans/plan-2026-05-07/code-organization.md Decision 1 and Decision 10:
- Stern is being deleted from the product. apps/stern-reference-{react,angular}
  and packages/shared/openfin-platform-stern/ removed.
- fi-trading scope removed (apps/fi-trading-reference{,-angular} were empty).
- apps/axe-blotter-demo removed (out of scope).
- apps/markets-ui-angular-reference removed (deferred until Angular parity catches up).
- widgets-react no longer imports @starui/openfin-platform-stern.

Verification: Vitest 298 passing (baseline), build + typecheck green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/pr-01-delete-dead-apps
gh pr create --title "chore(PR-1): delete Stern shell, fi-trading, axe-blotter" --body "$(cat <<'EOF'
## Summary
- Deletes Stern apps + `openfin-platform-stern` package (Decision 1, Decision 10).
- Deletes fi-trading-reference apps (empty).
- Deletes axe-blotter-demo (out of scope).
- Deletes markets-ui-angular-reference (deferred per Decision 1).
- Drops `@starui/openfin-platform-stern` dep from `widgets-react`.

## Test plan
- [x] `npx turbo run typecheck build test` passes.
- [x] Vitest ≥ 298 passing (baseline preserved).
- [x] `apps/demo-react` boots cleanly with no console errors.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Task 2 (PR-1.5): Sweep confirmed dead code in surviving packages

**Goal:** Delete the dead code identified by the audit (Decision 12) that does NOT auto-clear when other PRs delete `dock-editor-react` / `registry-editor-react`. Skip the demo-app duplicates (user-pruned) and skip `core/ui/shadcn/` (waits for PR-8).

**Files (deletions):**

- Modify: `packages/react/widgets-react/src/dock/DockConfigurator.tsx` (671 LOC) → delete file.
- Modify: `packages/react/widgets-react/src/index.ts` → drop the `DockConfigurator` re-export.
- Modify: `packages/react/markets-grid/src/formatter/formatterPresets.ts` → delete unused exports `FMT_USD`, `FMT_EUR`, `FMT_GBP`, `FMT_JPY`, `currentTickToken`, `TICK_MENU`.
- Modify: `packages/react/markets-grid/src/streamSafeNumberFloatingFilter.ts` → drop the `parseNumberExpression` export (delete fn entirely if not used internally; check first).
- Modify: `packages/shared/core/src/modules/conditional-styling/transforms.ts` → delete `FLASH_PULSE_RULE_ID`, `FLASH_PULSE_CSS`, `buildCssText`, `buildCellClassPredicate`.
- Modify: `packages/shared/core/src/ui/format-editor/index.ts` → drop `FormatSwatch`, `hexToHsv`, `hsvToHex` exports (delete underlying definitions if unused internally).
- Modify: `packages/shared/core/src/ui/ExpressionEditor/index.ts` → drop `LANGUAGE_ID`, `defaultFunctionsProvider` exports.
- Modify: `packages/shared/core/src/modules/calculated-columns/fieldSchema.tsx` → drop the unused exports `Row`, `OptNumberControl`, `TextControl`, `SelectControl`, `FieldRenderer` (keep their definitions if still used inside the file; just remove the exports).
- Delete: `packages/react/widget-sdk/src/types/index.ts` (23 LOC, unimported file). Verify with grep first.
- Modify: `packages/react/widget-sdk/src/providers/WidgetHost.tsx` → drop the `WidgetHostContext` export.
- Modify: `packages/react/config-browser-react/src/agGridTheme.ts` → drop `agGridThemeDark`, `agGridThemeLight` exports (delete the definitions if not used internally).
- Modify: `packages/react/ui/package.json` → remove unused deps `@hookform/resolvers`, `date-fns`, `zod`.
- Modify: `packages/react/markets-grid/package.json` → remove unused devDep `@testing-library/user-event`.
- Modify: `packages/react/widget-sdk/package.json` → remove unused devDep `@types/react-dom`.
- Modify: `packages/react/widgets-react/package.json` → remove unused devDep `ag-grid-enterprise`.
- Modify: `packages/shared/core/package.json` → remove unused dep `@monaco-editor/react`.

- [ ] **Step 1: Pre-task baseline + branch**

```bash
git checkout main && git pull
git checkout -b refactor/pr-1.5-dead-code-sweep
npx turbo run typecheck build test 2>&1 | tee /tmp/pr15-before.log
grep -E "Tests|passing|failing" /tmp/pr15-before.log | tail -10
```

- [ ] **Step 2: Re-verify each "dead" candidate before deletion (per the paramount constraint)**

For each candidate file/symbol, run a hardened grep to make sure no consumer was missed (dynamic imports, string-keyed lookups, css class names referenced by string).

```bash
# DockConfigurator
grep -rn "DockConfigurator" packages apps --include='*.ts' --include='*.tsx' --include='*.css' --include='*.scss' --include='*.html' | grep -v dist | grep -v node_modules
# If ANY result outside packages/react/widgets-react/src/dock/DockConfigurator.tsx and the index re-export → STOP and re-check.

# Repeat for each export in formatterPresets:
for sym in FMT_USD FMT_EUR FMT_GBP FMT_JPY currentTickToken TICK_MENU; do
  echo "=== $sym ==="
  grep -rn "\\b$sym\\b" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules
done

# Repeat for the conditional-styling exports:
for sym in FLASH_PULSE_RULE_ID FLASH_PULSE_CSS buildCssText buildCellClassPredicate; do
  echo "=== $sym ==="
  grep -rn "\\b$sym\\b" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules
done

# Repeat for format-editor + ExpressionEditor exports:
for sym in FormatSwatch hexToHsv hsvToHex LANGUAGE_ID defaultFunctionsProvider; do
  echo "=== $sym ==="
  grep -rn "\\b$sym\\b" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules
done

# WidgetHostContext
grep -rn "\\bWidgetHostContext\\b" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules

# agGridTheme exports
for sym in agGridThemeDark agGridThemeLight; do
  echo "=== $sym ==="
  grep -rn "\\b$sym\\b" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules
done
```

For each candidate: only one declaration site (the one we plan to delete) ⇒ safe. Multiple sites ⇒ stop and reassess.

- [ ] **Step 3: Delete `DockConfigurator.tsx` and its re-export**

```bash
git rm packages/react/widgets-react/src/dock/DockConfigurator.tsx
```

Edit `packages/react/widgets-react/src/index.ts` to drop the `DockConfigurator` line. Use the Edit tool with the exact line.

- [ ] **Step 4: Trim dead exports in `markets-grid/src/formatter/formatterPresets.ts`**

Open the file, identify the export statements for the 6 dead symbols, delete them. If the underlying definitions are also dead, delete those too. Run the file's tests (if any) to confirm nothing breaks: `npx vitest run packages/react/markets-grid -t formatter`.

- [ ] **Step 5: Trim `parseNumberExpression` from `streamSafeNumberFloatingFilter.ts`**

Same pattern. Verify the function isn't called internally before deleting the body.

- [ ] **Step 6: Trim dead exports in `core/modules/conditional-styling/transforms.ts`**

Same pattern.

- [ ] **Step 7: Trim dead exports in `core/ui/format-editor/index.ts` + `core/ui/ExpressionEditor/index.ts`**

Same pattern.

- [ ] **Step 8: Trim unused exports in `core/modules/calculated-columns/fieldSchema.tsx`**

Drop only the `export` keyword; leave the definitions in place if they're used inside the file.

- [ ] **Step 9: Delete `widget-sdk/src/types/index.ts` and trim `WidgetHostContext`**

```bash
git rm packages/react/widget-sdk/src/types/index.ts
```

Edit `WidgetHost.tsx` to drop the `WidgetHostContext` export.

- [ ] **Step 10: Trim dead exports in `config-browser-react/src/agGridTheme.ts`**

Same pattern.

- [ ] **Step 11: Drop unused production deps from `packages/react/ui/package.json`**

```diff
   "dependencies": {
-    "@hookform/resolvers": "...",
-    "date-fns": "...",
-    "zod": "...",
     ...
   }
```

- [ ] **Step 12: Drop unused devDeps from the four package.jsons**

Edit each:
- `packages/react/markets-grid/package.json` → remove `@testing-library/user-event` from devDependencies.
- `packages/react/widget-sdk/package.json` → remove `@types/react-dom`.
- `packages/react/widgets-react/package.json` → remove `ag-grid-enterprise`.
- `packages/shared/core/package.json` → remove `@monaco-editor/react`.

- [ ] **Step 13: Reinstall + parity check**

```bash
npm ci --legacy-peer-deps
npx turbo run typecheck build test 2>&1 | tee /tmp/pr15-after.log
diff <(grep -E "Tests|passing|failing" /tmp/pr15-before.log) <(grep -E "Tests|passing|failing" /tmp/pr15-after.log)
```

Acceptance: Vitest passing ≥ 298. Build + typecheck green.

- [ ] **Step 14: Visual smoke check**

```bash
cd apps/demo-react && npm run dev
# Verify dock, grid, profile save/load, formatter dropdowns. No console errors.
cd -
```

- [ ] **Step 15: Commit and open PR**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: sweep confirmed dead code from surviving packages (PR-1.5)

Per docs/plans/plan-2026-05-07/code-organization.md Decision 12. Audited
via knip + targeted grep; every deletion verified to have zero consumers.

Files deleted:
- widgets-react/src/dock/DockConfigurator.tsx (671 LOC, no consumers)
- widget-sdk/src/types/index.ts (23 LOC, unimported)

Exports dropped (definitions kept where used internally):
- markets-grid: FMT_{USD,EUR,GBP,JPY}, currentTickToken, TICK_MENU,
  parseNumberExpression
- core: FLASH_PULSE_*, buildCssText, buildCellClassPredicate,
  FormatSwatch, hexToHsv, hsvToHex, LANGUAGE_ID, defaultFunctionsProvider,
  Row, OptNumberControl, TextControl, SelectControl, FieldRenderer
- widget-sdk: WidgetHostContext
- config-browser-react: agGridThemeDark, agGridThemeLight

Unused deps removed:
- @starui/ui: @hookform/resolvers, date-fns, zod
- markets-grid devDep: @testing-library/user-event
- widget-sdk devDep: @types/react-dom
- widgets-react devDep: ag-grid-enterprise
- core dep: @monaco-editor/react

Verification: Vitest 298 passing (baseline), build + typecheck green,
demo-react smoke-tested.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/pr-1.5-dead-code-sweep
gh pr create --title "chore(PR-1.5): sweep confirmed dead code" --body "..."  # similar body
```

---

## Task 3 (PR-2): Repoint old-editor consumers

**Goal:** Drop every `@starui/dock-editor` and `@starui/registry-editor` import from packages and apps that aren't being deleted, replacing each one with its non-editor equivalent. Sets the stage for PR-3 (extract Workspace Setup) and PR-4 (delete the editors).

**Files (per the spec's Decision 4 consumer table):**

- Modify: `packages/react/config-browser-react/src/editorStyles.ts` (7 LOC) — currently re-exports `injectEditorStyles` from `@starui/dock-editor`. Move `injectEditorStyles` itself into `@starui/core` (vanilla CSS helper, not editor-specific) and re-export from there.
  - Move source: find current `injectEditorStyles` definition in `dock-editor-react`. Likely in `dock-editor-react/src/components/dock-editor/editorStyles.ts` (171 LOC).
  - New home: `packages/shared/core/src/css/injectEditorStyles.ts`.
  - Re-export from `@starui/core`'s root `index.ts`.

- Modify: `apps/markets-ui-react-reference/src/main.tsx` — drop the `import("@starui/dock-editor").then(m => m.ImportConfig)` and `m.WorkspaceSetup` lines. Wait until PR-3 lands the new `workspace-setup-react` package, then re-add against the new package. **For PR-2: comment out these imports and any routes they back, with a clear `// TODO(PR-3): re-wire to @starui/workspace-setup-react` marker.** This is the single allowed "pause" because the consumer can't be functional until PR-3 ships its replacement.

- Modify: `apps/markets-ui-react-reference/src/views/DockEditor.tsx` — view file is unused after PR-2 disables the dock-editor route. Delete the file in PR-2 (or in PR-4; defer to whichever is cleaner — recommend PR-4 since the file won't be imported by anyone after this PR).

- Modify: `apps/markets-ui-react-reference/src/views/RegistryEditor.tsx` — same as DockEditor.tsx; delete in PR-4.

- Modify: `apps/markets-ui-react-reference/src/main.tsx` route table — comment out the old DockEditor/RegistryEditor routes. The route URLs return 404 temporarily until WorkspaceSetup replaces them in PR-3.

- Verify: `packages/react/widgets-react/` — earlier grep showed NO actual import of `@starui/dock-editor` from widgets-react/src. The package.json grep was a false positive. **Re-run the grep before declaring this true. If the import exists, repoint it.**

- [ ] **Step 1: Pre-task baseline + branch**

```bash
git checkout main && git pull
git checkout -b refactor/pr-02-repoint-editor-consumers
npx turbo run typecheck build test 2>&1 | tee /tmp/pr02-before.log
```

- [ ] **Step 2: Locate the canonical `injectEditorStyles` definition**

```bash
grep -rn "export function injectEditorStyles\|export const injectEditorStyles" packages --include='*.ts' --include='*.tsx' | grep -v dist
```

Expected: a single source-of-truth file inside `dock-editor-react`.

- [ ] **Step 3: Move `injectEditorStyles` into `@starui/core`**

Create `packages/shared/core/src/css/injectEditorStyles.ts` with the function body verbatim (preserves behavior — paramount constraint). Add the re-export to `packages/shared/core/src/index.ts` and `packages/shared/core/src/css/index.ts` if it exists.

- [ ] **Step 4: Repoint config-browser-react's editorStyles re-export**

Edit `packages/react/config-browser-react/src/editorStyles.ts`:

```diff
-export { injectEditorStyles } from "@starui/dock-editor";
+export { injectEditorStyles } from "@starui/core";
```

- [ ] **Step 5: Comment out the two main.tsx imports in markets-ui-react-reference**

Edit `apps/markets-ui-react-reference/src/main.tsx`:

```diff
-// ImportConfig lives in the @starui/dock-editor package (not a local view file).
-const ImportConfig = lazy(() =>
-  import("@starui/dock-editor").then((m) => ({ default: m.ImportConfig })),
-);
-const WorkspaceSetup = lazy(() =>
-  import("@starui/dock-editor").then((m) => ({ default: m.WorkspaceSetup })),
-);
+// TODO(PR-3): re-wire to @starui/workspace-setup-react once extracted.
+const ImportConfig: React.LazyExoticComponent<React.ComponentType> | null = null;
+const WorkspaceSetup: React.LazyExoticComponent<React.ComponentType> | null = null;
```

Then disable the route table entries that point at these components — do not remove them; only guard them so they render an empty component or 404 placeholder. The reference app must still BUILD; only the dock/workspace routes are temporarily inert.

- [ ] **Step 6: Same for the views/DockEditor.tsx and views/RegistryEditor.tsx route entries**

Comment out those route registrations in `main.tsx` with the same `TODO(PR-3)` marker. **Leave the view files themselves on disk** — they get deleted in PR-4 alongside the package they import from. Doing it here would create a typecheck error on the dangling import.

- [ ] **Step 7: Verify no other consumers**

```bash
grep -rn "@starui/dock-editor" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules
grep -rn "@starui/registry-editor" packages apps --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules
```

Remaining valid uses after PR-2:
- `packages/react/registry-editor-react/src/editorStyles.ts` (deleted in PR-4)
- `packages/react/dock-editor-react/src/WorkspaceSetup.tsx` (the WorkspaceSetup→useRegistryEditor edge — extracted together in PR-3)
- `packages/react/dock-editor-react/src/index.ts` and other internal files (deleted in PR-4)
- `apps/markets-ui-react-reference/src/views/DockEditor.tsx` and `views/RegistryEditor.tsx` (deleted in PR-4)

ANY OTHER hit means the consumer table is stale — pause and reconcile.

- [ ] **Step 8: Reinstall + parity check**

```bash
npm ci --legacy-peer-deps
npx turbo run typecheck build test 2>&1 | tee /tmp/pr02-after.log
diff <(grep -E "Tests|passing|failing" /tmp/pr02-before.log) <(grep -E "Tests|passing|failing" /tmp/pr02-after.log)
```

Acceptance: Vitest ≥ 298 passing. Build + typecheck green.

- [ ] **Step 9: Visual smoke**

```bash
cd apps/demo-react && npm run dev   # demo-react doesn't use dock-editor; should be unchanged.
cd -
cd apps/markets-ui-react-reference && npm run dev
# Routes other than /dock-editor and /registry-editor must still work.
# /dock-editor and /registry-editor render an empty placeholder (acceptable for PR-2).
cd -
```

- [ ] **Step 10: Commit and open PR**

Pattern matches Task 1 / Task 2. Commit message references PR-2 and Decision 4.

---

## Task 4 (PR-3): Extract Workspace Setup (and its dependencies)

**Goal:** Create the new `packages/react/tools/workspace-setup-react/` package containing `WorkspaceSetup.tsx`, the `components/workspace-setup/` folder, and ANY `registry-editor-react` primitives WorkspaceSetup depends on (`useRegistryEditor` confirmed; check for others). Decide ImportConfig's home: same package or `tools/import-config-react/`. Update reference app to import from new location.

**Files:**

- Create: `packages/react/tools/workspace-setup-react/` — new package directory.
  - `package.json` — `@starui/workspace-setup-react`, peer-deps React, deps on `@starui/ui`, `@starui/core`, `@starui/openfin-platform` (the runtime, not the editor).
  - `tsconfig.json` — extends `../../../../tsconfig.base.json` (4 levels deep — verify; the bucket adds one level vs the old layout).
  - `src/index.ts` — barrel exporting `WorkspaceSetup`, `useRegistryEditor` (folded in), and possibly `ImportConfig`.
  - `src/WorkspaceSetup.tsx` — moved from `dock-editor-react/src/WorkspaceSetup.tsx`. **Byte-identical content** initially; only fix import paths.
  - `src/components/workspace-setup/*` — moved from `dock-editor-react/src/components/workspace-setup/*`. Byte-identical.
  - `src/registry/useRegistryEditor.ts` — moved from `registry-editor-react/src/...`. Byte-identical.

- Modify: `apps/markets-ui-react-reference/src/main.tsx` — replace the PR-2 `null`-stubbed lazy imports with real lazy imports against `@starui/workspace-setup-react`. Re-enable the routes.

- Modify: root `package.json` — add `packages/react/tools/workspace-setup-react` to workspace globs.

- Decision: `ImportConfig` (243 LOC in dock-editor-react). Inspect what it does. If it's a Workspace Setup sub-feature → fold into `workspace-setup-react`. If it's a distinct user-facing capability → create `packages/react/tools/import-config-react/` (separate package). Recommend folding unless the file's surface area says otherwise.

- [ ] **Step 1: Pre-task baseline + branch**

```bash
git checkout main && git pull
git checkout -b refactor/pr-03-extract-workspace-setup
npx turbo run typecheck build test 2>&1 | tee /tmp/pr03-before.log
```

- [ ] **Step 2: Inspect ImportConfig.tsx to decide its home**

```bash
sed -n '1,80p' packages/react/dock-editor-react/src/ImportConfig.tsx
```

Look at the public surface: does it export a single component used as a route page (likely fold into workspace-setup), or is it a richer capability (separate package). Document the decision in the PR description.

- [ ] **Step 3: Identify ALL of WorkspaceSetup's dependencies**

```bash
# Imports inside the WorkspaceSetup tree:
grep -rh "^import" packages/react/dock-editor-react/src/WorkspaceSetup.tsx packages/react/dock-editor-react/src/components/workspace-setup/ | sort -u
```

Build a list. For each `@starui/*` import: is it from a package that survives (e.g. `@starui/ui`, `@starui/core`)? Then keep the import. Is it from `@starui/registry-editor` or `@starui/dock-editor` (deleted in PR-4)? Then either move that symbol into the new package or repoint to a survivor.

- [ ] **Step 4: Scaffold the new package**

```bash
mkdir -p packages/react/tools/workspace-setup-react/src/components/workspace-setup
mkdir -p packages/react/tools/workspace-setup-react/src/registry
```

Create `packages/react/tools/workspace-setup-react/package.json`:

```jsonc
{
  "name": "@starui/workspace-setup-react",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "rimraf dist && tsc",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "dependencies": {
    "@starui/ui": "*",
    "@starui/core": "*",
    "@starui/openfin-platform": "*"
  },
  "devDependencies": {
    "rimraf": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

Create `packages/react/tools/workspace-setup-react/tsconfig.json`:

```jsonc
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

Verify the `extends` path resolves correctly from this depth (4 levels: `react/tools/workspace-setup-react/` → `../../../../tsconfig.base.json` → repo root). If wrong, fix the relative path.

- [ ] **Step 5: Move the WorkspaceSetup files (preserves git history via `git mv`)**

```bash
git mv packages/react/dock-editor-react/src/WorkspaceSetup.tsx \
       packages/react/tools/workspace-setup-react/src/WorkspaceSetup.tsx
git mv packages/react/dock-editor-react/src/components/workspace-setup \
       packages/react/tools/workspace-setup-react/src/components/workspace-setup
```

- [ ] **Step 6: Move `useRegistryEditor` and any other transitive primitives**

Inspect `packages/react/registry-editor-react/src/` to find `useRegistryEditor` and any helpers it depends on. `git mv` them into `packages/react/tools/workspace-setup-react/src/registry/`.

```bash
# Locate:
grep -rln "export function useRegistryEditor\|export const useRegistryEditor" packages/react/registry-editor-react/src/
# Move (paths from the grep output):
git mv packages/react/registry-editor-react/src/<found-path> \
       packages/react/tools/workspace-setup-react/src/registry/useRegistryEditor.ts
```

- [ ] **Step 7: Decide and execute on ImportConfig**

Based on Step 2's inspection: either `git mv` it into `workspace-setup-react/src/` (fold) or scaffold `packages/react/tools/import-config-react/` (separate package). Folding is recommended unless the file argues otherwise.

- [ ] **Step 8: Fix import paths in the moved files**

The moved files now have the wrong relative imports. Walk each moved file and update:
- `from "@starui/registry-editor"` → `from "./registry/useRegistryEditor"` (or whatever the local path becomes).
- `from "../components/..."` etc. → re-resolve against the new src tree layout.

This is the bulk of the work in PR-3. No symbol renames; only path adjustments.

- [ ] **Step 9: Create the package barrel**

```typescript
// packages/react/tools/workspace-setup-react/src/index.ts
export { WorkspaceSetup } from "./WorkspaceSetup";
export { useRegistryEditor } from "./registry/useRegistryEditor";
// If ImportConfig folded:
export { ImportConfig } from "./ImportConfig";
```

- [ ] **Step 10: Update root workspace globs**

Edit root `package.json` to add `packages/react/tools/workspace-setup-react` (and `packages/react/tools/import-config-react` if separate) to `"workspaces"`.

- [ ] **Step 11: Repoint markets-ui-react-reference**

Replace the PR-2 stubs in `apps/markets-ui-react-reference/src/main.tsx`:

```diff
-// TODO(PR-3): re-wire to @starui/workspace-setup-react once extracted.
-const WorkspaceSetup: React.LazyExoticComponent<React.ComponentType> | null = null;
+const WorkspaceSetup = lazy(() =>
+  import("@starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
+);
```

Re-enable the route. Same pattern for ImportConfig.

Edit `apps/markets-ui-react-reference/package.json` to add the new dep:

```diff
   "dependencies": {
+    "@starui/workspace-setup-react": "*",
     ...
   }
```

- [ ] **Step 12: Reinstall, build, typecheck, test**

```bash
npm ci --legacy-peer-deps
npx turbo run typecheck build test 2>&1 | tee /tmp/pr03-after.log
diff <(grep -E "Tests|passing|failing" /tmp/pr03-before.log) <(grep -E "Tests|passing|failing" /tmp/pr03-after.log)
```

Acceptance: Vitest ≥ 298 passing. Build + typecheck green.

- [ ] **Step 13: Visual + interactive parity check (CRITICAL)**

```bash
cd apps/markets-ui-react-reference && npm run dev
# Open the WorkspaceSetup route. Compare against a pre-PR-2 screenshot
# (or against the old behavior if you saved one). Every interaction must
# work identically: tabs, panes, components list, inspector, drag-drop.
# Same for ImportConfig if applicable.
cd -
```

This is the highest-risk visual parity check in the entire migration. Take screenshots, click everything, save and load workspaces. If anything differs from baseline behavior: stop, do not commit, investigate.

- [ ] **Step 14: Commit and open PR**

Multi-commit per logical step (move, fix imports, scaffold barrel, repoint app). Final PR description references Decision 4 + Decision 11 (PR-3) and includes a "Visual parity verified by [user/anand]" line — the user is the visual authority.

---

## Task 5 (PR-4): Delete dock-editor-react + registry-editor-react (+ Angular twins)

**Goal:** Delete the four packages now that everything they exposed is either re-homed or confirmed dead. Delete the unused `views/DockEditor.tsx` and `views/RegistryEditor.tsx` files in the React reference app.

**Files (deletions):**

- Delete: `packages/react/dock-editor-react/`
- Delete: `packages/react/registry-editor-react/`
- Delete: `packages/angular/dock-editor-angular/`
- Delete: `packages/angular/registry-editor-angular/`
- Delete: `apps/markets-ui-react-reference/src/views/DockEditor.tsx`
- Delete: `apps/markets-ui-react-reference/src/views/RegistryEditor.tsx`

- Modify: root `package.json` workspace globs — drop the deleted package paths.
- Modify: `apps/markets-ui-react-reference/package.json` — drop `@starui/dock-editor`, `@starui/registry-editor` deps.

- [ ] **Step 1: Pre-task baseline + branch**

(same shape as prior Tasks)

- [ ] **Step 2: Final consumer grep — paramount constraint**

```bash
grep -rn "@starui/dock-editor\|@starui/registry-editor\|@starui/angular-dock-editor\|@starui/angular-registry-editor" packages apps --include='*.ts' --include='*.tsx' --include='package.json' | grep -v dist | grep -v node_modules
```

Expected: ZERO hits. Any hit = stop and resolve before deleting.

- [ ] **Step 3: Delete the four packages**

```bash
git rm -r packages/react/dock-editor-react/
git rm -r packages/react/registry-editor-react/
git rm -r packages/angular/dock-editor-angular/
git rm -r packages/angular/registry-editor-angular/
```

- [ ] **Step 4: Delete the orphaned reference-app views**

```bash
git rm apps/markets-ui-react-reference/src/views/DockEditor.tsx
git rm apps/markets-ui-react-reference/src/views/RegistryEditor.tsx
```

- [ ] **Step 5: Drop deps + update workspace globs**

Edit `apps/markets-ui-react-reference/package.json` to remove the editor deps.
Edit root `package.json` workspace list.

- [ ] **Step 6: Reinstall + parity check + visual smoke**

```bash
npm ci --legacy-peer-deps
npx turbo run typecheck build test
```

WorkspaceSetup route in markets-ui-react-reference still works (already verified in PR-3, re-verify after deletion).

- [ ] **Step 7: Update IMPLEMENTED_FEATURES.md**

Note that the standalone Dock Editor and Component Registry editors are removed; Workspace Setup is the unified replacement.

- [ ] **Step 8: Commit + open PR**

---

## Task 6 (PR-5): Move config-browser-react into tools/

**Goal:** Folder move only. Package name unchanged (`@starui/config-browser-react`). All consumers continue to import the same package name.

**Files:**

- Move: `packages/react/config-browser-react/` → `packages/react/tools/config-browser-react/`.
- Modify: root `package.json` workspace globs.
- Modify: `packages/react/tools/config-browser-react/tsconfig.json` — fix relative paths (extends goes from 3 levels to 4).

- [ ] **Step 1: Branch + baseline.**
- [ ] **Step 2: `git mv packages/react/config-browser-react packages/react/tools/config-browser-react`**.
- [ ] **Step 3:** Update root `package.json` workspace path.
- [ ] **Step 4:** Update `tsconfig.json`'s `extends` to `"../../../../tsconfig.base.json"`.
- [ ] **Step 5:** `npm ci --legacy-peer-deps && npx turbo run typecheck build test`.
- [ ] **Step 6:** Visual smoke in any app that mounts ConfigBrowser.
- [ ] **Step 7:** Commit + PR.

---

## Task 7 (PR-6): Sub-bucket the rest of packages/react/

**Goal:** Folder moves only. Package names unchanged.

**Moves:**

- `packages/react/host-wrapper-react/` → `packages/react/hosts/host-wrapper-react/`
- `packages/react/data-plane-react/` → `packages/react/providers/data-plane-react/`
- `packages/react/widget-sdk/` → `packages/react/sdk/widget-sdk/`
- `packages/react/markets-grid/` → `packages/react/widgets/markets-grid/`
- `packages/react/widgets-react/` → `packages/react/widgets/widgets-react/`

**Per-package steps (apply to each move):**

- [ ] `git mv <old> <new>`.
- [ ] Update the package's `tsconfig.json` `extends` to add the extra level (`../../../../tsconfig.base.json`).
- [ ] Verify the package's own internal imports still resolve (no relative paths broken by the move).

**One-pass-per-package, then global:**

- [ ] Update root `package.json` workspaces with all five new paths.
- [ ] `npm ci --legacy-peer-deps && npx turbo run typecheck build test`.
- [ ] Visual smoke in `apps/demo-react` and `apps/markets-ui-react-reference`.
- [ ] Commit + PR.

---

## Task 8 (PR-7): Sub-bucket packages/shared/

**Goal:** Folder moves only. Package names unchanged.

**Moves:**

- Foundation: `shared-types`, `design-system`, `icons-svg` → `packages/shared/foundation/<name>/`. Also: `packages/angular/tokens-primeng/` → `packages/shared/foundation/tokens-primeng/` (it's CSS-only, framework-agnostic — Decision 5).
- Runtime: `runtime-port`, `runtime-browser`, `runtime-openfin` → `packages/shared/runtime/<name>/`.
- Services: `config-service`, `data-plane`, `component-host` → `packages/shared/services/<name>/`.
- Platform: `openfin-platform` → `packages/shared/platform/openfin-platform/`.
- Core stays at `packages/shared/core/` (single package, peer to the sub-buckets — see Decision 5).

**Per-move steps:**

- [ ] `git mv <old> <new>`.
- [ ] Update `tsconfig.json` `extends` for the new depth.
- [ ] Verify internal relative imports still resolve.

**Global:**

- [ ] Update root `package.json` workspaces with all new paths.
- [ ] `npm ci --legacy-peer-deps && npx turbo run typecheck build test`.
- [ ] Visual smoke in demo-react.
- [ ] Commit + PR.

---

## Task 9 (PR-8): Extract core's React content into grid-react (HIGH RISK — most complex Task)

**Goal:** Move `packages/shared/core/src/{ui,hooks,modules}/` (~24,259 LOC) into a new `packages/react/widgets/grid-react/` package. `markets-grid` repoints from `@starui/core` to `@starui/grid-react` for the moved symbols. Drop the duplicate `core/ui/shadcn/` in favor of `@starui/ui`.

**This Task gets its own dedicated PR plan document because the cross-cutting nature of the move warrants per-symbol verification.**

**At a minimum, the Task does:**

- Create: `packages/react/widgets/grid-react/` with `package.json`, `tsconfig.json`, `src/index.ts`.
  - Peer deps: React, react-dom.
  - Deps: `@starui/core` (vanilla grid platform), `@starui/ui` (shadcn).
- `git mv packages/shared/core/src/ui packages/react/widgets/grid-react/src/ui` (then resolve the shadcn duplication).
- `git mv packages/shared/core/src/hooks packages/react/widgets/grid-react/src/hooks`
- `git mv packages/shared/core/src/modules packages/react/widgets/grid-react/src/modules`
- For each file moved: fix imports. Imports that referenced sibling subdirs of `core/src/` now need to reach back via `@starui/core` (cross-package).
- Update `core`'s `index.ts` to **stop re-exporting** the moved symbols. Add equivalent re-exports to `grid-react`'s `index.ts`.
- Walk every consumer of `@starui/core` and check whether they import a moved symbol. If so, switch the import to `@starui/grid-react`. (The biggest consumer here is `markets-grid` itself.)
- Drop `packages/shared/core/src/ui/shadcn/` after migrating its internal consumers to import `@starui/ui` instead.
- Drop React peer-deps from `core`'s `package.json` (it's now vanilla-only).

**Verification gate is exceptionally tight:** every Vitest test in markets-grid must still pass, every Playwright test in demo-react / markets-ui-react-reference must still pass, and the visual / interactive behavior of MarketsGrid (column customization, conditional styling, calculated columns, saved filters, grid state, expressions) must be identical pre/post.

**Recommendation:** Before starting this Task, write out a separate PR-8 plan document (`pr-08-extract-grid-react.md`) detailing the per-symbol move list, the consumer-by-consumer repoint table, and per-module visual checks. Do not execute PR-8 from this top-level plan.

- [ ] **Step 1:** Pause and request a dedicated PR-8 plan from the user before executing.

---

## Task 10 (PR-9): Sub-bucket packages/angular/ + naming cleanup

**Goal:** Folder moves + two package renames.

**Moves:**

- `packages/angular/host-wrapper-angular/` → `packages/angular/hosts/host-wrapper-angular/`
- `packages/angular/config-browser-angular/` → `packages/angular/tools/config-browser-angular/` AND rename pkg `@starui/angular-config-browser` → `@starui/config-browser-angular`.
- `packages/angular/angular/` → `packages/angular/widgets/widgets-angular/` AND rename pkg `@starui/angular` → `@starui/widgets-angular`.

**Per-rename steps:**

- [ ] `git mv` the directory.
- [ ] Edit the moved `package.json` to update `"name"`.
- [ ] Grep every consumer for the old package name and switch to the new name. (Likely consumers: `apps/demo-angular`.)
- [ ] Update `tsconfig.json` `extends` for new depth.

**Global:**

- [ ] Update root `package.json` workspaces.
- [ ] `npm ci --legacy-peer-deps && npx turbo run typecheck build test`.
- [ ] Visual smoke in `apps/demo-angular`.
- [ ] Commit + PR.

---

## Task 11 (PR-10): Update workspace globs + docs

**Goal:** Reflect the new layout in living documentation.

**Files:**

- Modify: `package.json` (root) — final pass on the workspaces array. By this Task it should already be correct from prior Tasks; this is the audit pass.
- Modify: `docs/ARCHITECTURE.md` — redraw the layer diagram against the new sub-buckets.
- Modify: `CLAUDE.md` — update the "Package layout" section to describe the sub-buckets.
- Modify: `docs/IMPLEMENTED_FEATURES.md` — add a "Package layout" entry recording the migration.
- Modify: `docs/DEPS_STANDARD.md` — confirm no dep version drift.

**Steps:**

- [ ] Audit root `package.json` workspaces vs the actual file tree (`find packages apps -maxdepth 4 -name package.json`). Reconcile.
- [ ] Rewrite the relevant sections of `docs/ARCHITECTURE.md` and `CLAUDE.md`.
- [ ] `npx turbo run typecheck build test`.
- [ ] Commit + PR.

---

## Task 12 (PR-11): Tarball pack workflow

**Goal:** Add the `pack:libs` script and `/lib/` gitignore. No app changes.

**Files:**

- Create: `scripts/pack-libs.mjs` (Node script — iterates workspaces, runs `npm pack --pack-destination ../../lib` for each).
- Modify: root `package.json` — add `"pack:libs": "node scripts/pack-libs.mjs"` to scripts.
- Modify: root `.gitignore` — add `/lib/`.

**Steps:**

- [ ] Branch + baseline.
- [ ] Write `scripts/pack-libs.mjs`. It:
  1. Runs `npx turbo run build` to ensure all `dist/` are fresh.
  2. Reads workspace package list from root `package.json`.
  3. For each workspace package, runs `npm pack --pack-destination /lib` (resolved as repo-root relative).
  4. Optionally emits `lib/manifest.json` with package-name → tarball-filename map (for use in reference-app `overrides`).
- [ ] Add `/lib/` to `.gitignore` (and create `/lib/.gitkeep` if you want the dir tracked).
- [ ] Run `npm run pack:libs` end-to-end. Verify every package produces a tarball without error.
- [ ] Inspect a couple of `.tgz` (`tar tzf lib/starui-markets-grid-react-*.tgz | head -20`) — confirm `dist/`, `package.json`, README are inside; no source TS leaks.
- [ ] Commit + PR.

---

## Final state

After all 12 Tasks merge to main:

- `apps/` contains: `reference-react-browser` (renamed from `markets-ui-react-reference`), `config-service-server`, `demo-react`, `demo-angular`, `demo-configservice-react`. (Plus optional `reference-react-openfin` if Decision 1a is settled.)
- `packages/shared/` is sub-bucketed into `foundation/`, `runtime/`, `services/`, `platform/`, with `core/` as a peer (vanilla-only, ~7,972 LOC).
- `packages/react/` is sub-bucketed into `ui`, `sdk/`, `grid/` (or `widgets/grid-react/`), `widgets/`, `hosts/`, `providers/`, `tools/`.
- `packages/angular/` is sub-bucketed into `hosts/`, `providers/` (when populated), `widgets/`, `tools/`.
- Old Dock Editor, Component Registry, and Stern packages are gone.
- `/lib/` exists (gitignored) with a `pack:libs` script ready for new reference apps.
- Vitest still 298+ passing. Playwright still 195+ passing. Zero behavior changes observed.

---

## Self-review notes

- Spec coverage: every Decision (1–14) is covered by at least one Task. Decision 1a (browser vs openfin shape) is explicitly noted as deferred until after the layout settles. Decision 2 (demo apps stay) is honored in every Task. Decisions 3, 4, 11, 13, 14 each map to a Task or set of Tasks.
- Placeholder scan: Task 9 is **deliberately under-detailed** (it's flagged HIGH RISK and explicitly defers to a dedicated PR-8 plan). This is not a placeholder failure — it's a scope-control decision documented in the Task itself.
- Type consistency: The plan does not introduce new types or method signatures; it moves existing files. The single new package, `@starui/workspace-setup-react`, has its surface defined in Task 4 (export list) and consumed in Task 4's Step 11 — consistent.

---

## Execution handoff

Plan complete and saved to `docs/plans/plan-2026-05-07/code-organization-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per Task, review between Tasks, fast iteration. Each Task's verification gate runs before the subagent reports back.

**2. Inline Execution** — Execute Tasks in this session using executing-plans, batch execution with checkpoints for user review.

**Which approach?**
