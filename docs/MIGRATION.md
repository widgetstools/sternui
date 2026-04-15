# Migrating from v1 (`@grid-customizer/core` + `@grid-customizer/markets-grid`) to v2 (`@grid-customizer/core-v2` + `@grid-customizer/markets-grid-v2`)

v2 is a clean rewrite of the core platform that fixes four architectural seams that had accreted real debt in v1. This document is written for a consumer app (like the `apps/demo` demo, or any downstream app that mounts `MarketsGrid`) deciding whether and how to switch.

**TL;DR** — the v2 mount has the same prop surface for the 95% case, persists to its own IndexedDB database, and removes the need to click "Save All" to persist edits. Migration is opt-in and can run side-by-side with v1 indefinitely.

---

## What changed and why

### 1. Single source of truth
v1 kept three parallel copies of every grid's state: a `gc-state:<id>` localStorage cache, a `gc-grid:<id>` per-grid snapshot, and the profile snapshot in IndexedDB. None of them was canonical, and reload outcomes depended on which loader finished first.

v2 deletes those two localStorage keys on first mount and treats the profile snapshot in IndexedDB as the **only** persisted form. The one key v2 writes to localStorage is `gc-active-profile:<gridId>` — a pointer to which profile to load on mount.

### 2. Per-module schema versioning
In v1, any field rename in a module silently corrupted every old profile snapshot. In v2, every module declares `schemaVersion: number` and optionally a `migrate(raw, fromVersion)` function. Snapshots are stored as `{ moduleId: { v: N, data: ... } }`. On load with a version mismatch, `migrate` runs or the module's state is dropped with a warning — the grid never crashes on stale data.

### 3. Explicit save API, no refs or window events
v1's Save All path relied on `activeFiltersRef` mutation + a `gc:save-all` window event that `MarketsGrid` and `FiltersToolbar` both had to remember to wire up. Forget either side → silent persistence failure.

v2 exposes `profiles.saveActiveProfile()` as a direct call. The Save All button, the auto-save debouncer, and any future caller all converge on that one function. The `activeFiltersRef` pattern is gone entirely; `FiltersToolbar` v2 reads filters exclusively from `useModuleState('saved-filters')`.

### 4. Auto-save (you probably don't need Save All anymore)
v2 subscribes to every store change and writes to the active profile snapshot on a 300ms debounce. The Save All button is still there, but it's a "force flush + flash confirmation" affordance rather than a correctness requirement. Tests that wrote `await page.click('button[title*="Save all settings"]')` before every reload can drop those clicks against v2.

### 5. Enforced module dependencies + topological registration
v1's `module.dependencies[]` field was declared but never enforced. v2's `core.registerModule(m)` throws if any declared dependency isn't yet registered, and registration order = a topological sort of the dependency graph. Ordering bugs surface at mount time, not at runtime.

---

## Scope — which modules are in v2 today

| Module                 | v1    | v2    |
|------------------------|-------|-------|
| general-settings       | ✓     | ✓     |
| column-customization   | ✓     | ✓     |
| conditional-styling    | ✓     | ✓     |
| saved-filters          | ✓     | ✓     |
| toolbar-visibility     | ✓     | ✓ (state only; pills/stacked UI pending) |
| cell-flashing          | ✓     | deferred to v2.1 |
| calculated-columns     | ✓     | deferred to v2.1 |
| column-groups          | ✓     | deferred to v2.2 |
| column-templates       | ✓     | deferred to v2.1 |
| data-management        | ✓     | deferred to v2.2 |
| editing                | ✓     | deferred to v2.2 |
| entitlements           | ✓     | deferred to v2.2 |
| export-clipboard       | ✓     | deferred to v2.2 |
| expression-editor      | ✓     | deferred to v2.2 |
| named-queries          | ✓     | deferred to v2.1 |
| performance            | ✓     | deferred to v2.2 |
| profiles-panel UI      | ✓     | replaced by inline `ProfileSelector` |
| sort-filter            | ✓     | deferred to v2.2 |
| theming                | ✓     | deferred to v2.2 |
| undo-redo              | ✓     | deferred to v2.2 |

Consumers that need any of the "deferred" modules should keep mounting v1 until those modules land in v2.1 / v2.2.

---

## Switching a consumer app to v2

### Package.json
```jsonc
// Before
"@grid-customizer/core": "*",
"@grid-customizer/markets-grid": "*"

// After (both can live side-by-side)
"@grid-customizer/core": "*",
"@grid-customizer/core-v2": "*",
"@grid-customizer/markets-grid": "*",
"@grid-customizer/markets-grid-v2": "*"
```

### Imports
```ts
// Before
import { MarketsGrid } from '@grid-customizer/markets-grid';
import { DexieAdapter } from '@grid-customizer/core';

// After
import { MarketsGrid } from '@grid-customizer/markets-grid-v2';
import { DexieAdapter } from '@grid-customizer/core-v2';
```

### Props
The prop surface is a **strict subset** of v1's — these props are identical in shape and behavior:

- `rowData`, `columnDefs`, `theme`, `storageAdapter`, `gridId`, `rowIdField`
- `showToolbar`, `showFiltersToolbar`, `showSaveButton`, `showProfileSelector`
- `rowHeight`, `headerHeight`, `animateRows`, `sideBar`, `statusBar`, `defaultColDef`
- `onGridReady`, `className`, `style`, `toolbarExtras`

Removed or renamed:

| v1 prop          | v2 equivalent                                    |
|------------------|--------------------------------------------------|
| `extraToolbars`  | deferred — port with the pills/stacked-toolbar UI in v2.1 |
| `autoSaveDebounceMs` (new)     | defaults to 300ms; set to `0` to write on every store change |

### Storage migration
v1's IndexedDB database is named `GridCustomizerDB`; v2's is `gc-customizer-v2`. They are separate — a v2 mount does **not** auto-read v1 profiles. If you need to carry v1 profiles forward, export them from v1 via `DexieAdapter.listProfiles` and write them into the v2 adapter. A dedicated `v1-to-v2 profile importer` helper is planned for v2.1.

On first mount, v2 runs `migrateLegacyLocalStorage()` which deletes any `gc-state:<gridId>` and `gc-grid:<gridId>` keys so they stop shadowing the profile snapshot. The `gc-active-profile:<gridId>` key is reused (same name, same meaning).

### E2E specs
Specs that targeted v1's DOM contract continue to work unchanged against v1. For specs moved to v2:

- Drop `await page.click('button[title*="Save all settings"]')` before reloads — auto-save fires within ~500ms of any state change.
- Use the same `.gc-filter-pill` / `.gc-filters-add-btn` / `.gc-profile-badge` selectors (v2 keeps the class names for DOM-contract parity).
- `data-testid="profile-selector-trigger" | "profile-selector-popover" | "profile-name-input" | "profile-create-btn" | "save-all-btn"` are new in v2 and replace v1's less-structured selectors.
- Reference: `e2e/v2-autosave.spec.ts` shows the auto-save contract end to end.

---

## Rollback
v1 remains the default in the demo app (`/`). To rollback a v2 consumer app that went to prod, revert the import change; no data migration is needed since v1 and v2 use different IndexedDB databases.
