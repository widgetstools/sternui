# v3 Architecture

Clean-slate rewrite of the grid customization platform. Preserves feature
parity with v2 while removing the anti-patterns the v2 audit surfaced:

- **No file-level per-grid state.** Every resource (CSS injectors,
  expression engines, event listeners, row caches) lives on the platform's
  `ResourceScope` and is disposed atomically in one `destroy()` call.
  No more `Map<gridId, GridResources>` scattered across 5 modules.
- **One module lifecycle hook.** `activate(platform)` replaces v2's
  split into `onRegister` + `onGridReady` + `onGridDestroy`. The closure
  over `platform` is the only state the module owns; the returned
  disposer is the only cleanup.
- **Single `activate()`-deferred pipeline.** The `PipelineRunner`
  caches per-module outputs on reference identity, so unaffected
  modules skip their transforms entirely on each state change.
- **Framework-agnostic ProfileManager.** A plain class with `subscribe`
  semantics; the React binding (`useProfileManager`) is a thin shell.
  Ready for an Angular binding when we port the grid to Angular.
- **Typed ApiHub.** `platform.api.onReady()` + `.on('cellFocused', …)`
  replaces v2's 26+ `core.getGridApi()` + setInterval polling sites.
- **No circular type imports.** Shared shapes (`ColumnAssignment`,
  `CellStyleOverrides`, `ValueFormatterTemplate`) live in `core/colDef/`
  and are consumed by every module — column-templates can describe what
  it merges into without depending on column-customization.

## Packages

```
packages/core/                 @grid-customizer/core
  src/platform/                GridPlatform, ApiHub, ResourceScope,
                               PipelineRunner, EventBus, Store, topoSort
  src/persistence/             DexieAdapter (IDB), MemoryAdapter
  src/profiles/                ProfileManager + AutoSave
  src/store/                   createGridStore + autosave engine
  src/hooks/                   React bindings (GridProvider, useGridApi,
                               useModuleState, useProfileManager)
  src/expression/              CSP-safe expression engine (unchanged)
  src/colDef/                  Shared colDef types + writers
                               (cellStyleToAgStyle, excelFormatter,
                               tickFormatter, valueFormatterFromTemplate)
  src/css/                     Cockpit design-system CSS (tokens + layout)
  src/ui/settings/             18 Cockpit primitives in ONE file
  src/ui/StyleEditor/          One editor, four sections
  src/ui/ColorPicker/          CompactColorField
  src/ui/FormatterPicker/      Preset / Excel / expression picker +
                               curated preset catalogue
  src/ui/shadcn/               Unchanged shadcn primitives
  src/ui/format-editor/        Unchanged border / color-picker primitives
  src/ui/ExpressionEditor/     Unchanged Monaco editor (opt-in)
  src/modules/                 Every module
    general-settings/          Top-40 AG-Grid options (priority 0)
    column-templates/          Reusable column template bundles (5)
    column-customization/      Per-column overrides + filter + row-group (10)
    calculated-columns/        Virtual expression columns (15)
    column-groups/             User-authored ColGroupDef tree (18)
    conditional-styling/       Expression-driven rules (20)
    saved-filters/             Passive filter list holder (1001)
    toolbar-visibility/        Passive toolbar visibility map (1000)
    grid-state/                Native AG-Grid state capture/replay (200)

packages/markets-grid/         @grid-customizer/markets-grid
  src/MarketsGrid.tsx          Host component + DEFAULT_MODULES + toolbar
  src/useGridHost.ts           Binds GridPlatform to React lifecycle
  src/SettingsSheet.tsx        Drawer with module sidebar + panel body
  src/ProfileSelector.tsx      Profile list / switch / rename / delete
  src/HelpPanel.tsx            Compact cheatsheet
  src/FiltersToolbar.tsx       Saved-filter pills (from v2, v3-adapted)
  src/FormattingToolbar.tsx    Inline quick-style toolbar (lean v3)
  src/DraggableFloat.tsx       Framework-free floating container
```

## Persistence

**Database name kept as `gc-customizer-v2`** for backwards compatibility —
existing profile snapshots load directly into v3. Envelope shape
(`{ v, data }` per module slice) is unchanged; every module's v3
`deserialize` accepts its v2 predecessor's output.

## Module lifecycle example

```ts
export const myModule: Module<MyState> = {
  id: 'my-module',
  schemaVersion: 1,
  priority: 50,

  getInitialState: () => ({ ... }),
  serialize: (s) => s,
  deserialize: (raw) => ({ ...raw }),

  activate(platform) {
    // All side effects + subscriptions live here. Closure over `platform`
    // is the module's only runtime state.
    const css = platform.resources.css('my-module');
    const unsubA = platform.api.on('cellFocused', () => { /* ... */ });
    const unsubB = platform.subscribe((state) => { /* ... */ });
    return () => { css.clear(); unsubA(); unsubB(); };
  },

  transformColumnDefs(defs, state, ctx) {
    // Pure — reads state + `ctx.resources.expression()` / .css() / .cache();
    // returns new defs. PipelineRunner caches on reference identity.
    return defs;
  },
};
```

## Milestones

All 15 milestones (M0 - M15) landed as individual commits on
`v3-clean`, each with isolated typecheck + demo boot verification.
See `git log v3-clean` for per-milestone commit messages.
