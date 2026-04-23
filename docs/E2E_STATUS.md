# E2E status — post-consolidation baseline

**Last run:** Day 8 of consolidation (commit `293093b`, branch `feat/consolidation`)

## Summary

```
Total:   214 tests in 19 spec files
Passed:  195
Failed:   19  (pre-existing, unrelated to consolidation)
Runtime: ~4.6 min on local macOS, single Chromium worker
```

All 19 failures cluster in 4 specs and **existed on `main` before the
consolidation branch was cut.** `git diff main..feat/consolidation`
reports zero changes to those spec files. The consolidation work has
not introduced any new E2E regressions.

## Pre-existing failures (not caused by consolidation)

### 1. `v2-column-templates.spec.ts` — 9 failures

**Root cause:** Stale testids. Commit `13cb08f`
("feat(formatter-toolbar,profiles): undo/redo, unified templates, …")
replaced the old `save-tpl-input` / `save-tpl-btn` / "Save as template"
menu UI with a unified `<TemplateManager>` component using a `<Select>`
+ `{testIdPrefix}-save-input` / `{testIdPrefix}-save-btn` scheme
(`testIdPrefix="tb-tpl"` in horizontal / toolbar mode,
`"fmt-panel-tpl"` in popped-panel mode). The e2e suite still expects
the pre-unification testids.

**Fix scope:** Rewrite the spec against the Select-based UX. Not a
mechanical rename — the interaction shape changed from
"popover-with-menu-items" to "select-dropdown-then-input". Tracked
separately; **NOT** part of the consolidation PR.

### 2. `v2-formatting-toolbar.spec.ts` — 3 failures

Same family as (1): references to "Save as template" button and
pre-unification behaviour. Same fix scope.

### 3. `v2-popout-design-system.spec.ts` — 4 failures

Popout window parity checks. Require a real BrowserContext popup
handle; current test flow fails on `window.open` handshake in
headless Chromium. Pre-existing; unrelated to monorepo structure.

### 4. `v2-popout-toolbar.spec.ts` — 3 failures

Popout window feature-string assertions (`width=400 height=620`) and
section-count inside the popup iframe. Same popup-handshake family
as (3).

## Consolidation-related verification (all green)

The passing 195 tests cover every domain touched by the
consolidation:

- ✅ Two-grid cross-isolation (gridId scoping)
- ✅ Profile lifecycle (create / clone / delete / switch / persist)
- ✅ Profile stress (20+ rapid CRUD)
- ✅ Autosave + debounced persistence
- ✅ Calculated columns
- ✅ Column customization + column groups
- ✅ Conditional styling
- ✅ Filters toolbar
- ✅ General settings
- ✅ Performance smoke
- ✅ Settings panels (dropdown nav)
- ✅ Profile isolation across structural + styling changes
- ✅ Popout window basics (open/close, iframe mount)

All AG-Grid / GridPlatform / module-system / Dexie-persistence
surfaces exercised by the passing specs behave identically on the
consolidated monorepo as they did on the four source repos.

## Action items (post-merge)

1. Open a dedicated ticket to rewrite the 4 failing spec files
   against the current TemplateManager / popout window APIs.
2. Until then, the Playwright job in `.github/workflows/e2e.yml`
   will stay RED — acceptable for the consolidation PR since the
   failures pre-existed. After consolidation lands, the rewrite
   ticket unblocks a green e2e job on `main`.

## How to reproduce

```bash
# From the monorepo root:
npm ci --legacy-peer-deps
npx playwright install chromium
npx turbo build --filter=@marketsui/demo-react...
npx playwright test
```

The Vite dev server binds `:5190`; the config reuses an existing
server if one is already running.
