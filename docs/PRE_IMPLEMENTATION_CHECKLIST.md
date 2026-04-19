# Pre-Implementation Checklist

**Run this BEFORE writing code for any feature add, update, or removal.**

Pair with `e2e/README.md` (test policy) and `docs/IMPLEMENTED_FEATURES.md`
(feature-doc contract).

---

## 1. Architecture fit

- [ ] Does the feature belong in an existing module, or does it warrant
      a new one? Prefer extending an existing module when the data shape fits.
- [ ] If it's a new module, does it follow the plugin pattern (pure
      reducers, `activate(platform)`, `transformColumnDefs`, serialize /
      deserialize)?
- [ ] Does the state shape round-trip through the profile store cleanly
      (JSON-serializable, deterministic deserialize with default)?
- [ ] Does it respect the module priority order (grid-state last, cols
      before conditional styling, etc.)?
- [ ] Are grid-api subscriptions going through `platform.api.on(...)` /
      `useGridEvent(...)` — NOT raw `addEventListener`?

## 2. Design-system fit

- [ ] UI changes consume the `--ck-*` cockpit tokens, not hex literals.
- [ ] No native `<input>` / `<textarea>` / `<select>` inside settings
      panels — use the shadcn primitives (`Input`, `Textarea`, `Select`, `Switch`).
- [ ] Inline styles are for one-off overrides only; repeating patterns
      go in a component-scoped `.css` file.
- [ ] Accent colour is teal (`--bn-green` / `--ck-green`) unless the
      affordance is truly destructive (red) or informational (yellow).
- [ ] Per-card Save + dirty indicator pattern used for every editable
      item in a settings panel.

## 3. Reuse before new code

- [ ] Searched for existing utils / hooks / components that already do
      what the feature needs. `grep` the package barrel exports first.
- [ ] Known reusable surfaces to check:
  - `useModuleState`, `useModuleDraft`, `useDirty`, `useGridColumns`
  - `resolveTemplates`, `valueFormatterFromTemplate`, `excelFormatter`
  - `ExpressionEngine` (CSP-safe) for anything formula-like
  - `CompactColorField`, `StyleEditor`, `FormatterPicker`,
    `BorderStyleEditor`, `IconInput`, `PillToggleGroup`, `ItemCard`,
    `Band`, `MetaCell`
  - `FilterEditor`, `RowGroupingEditor`, `Row` from
    `column-customization/editors/` — extracted sub-editors
  - `useActiveColumns`, `useColumnFormatting`, `useFlashConfirm` from
    `formattingToolbarHooks.ts` in markets-grid
  - `filtersToolbarLogic.ts` — pure row-match / merge helpers
- [ ] If a similar primitive exists but needs a small extension, extend
      it rather than duplicating. If duplication is genuinely needed,
      document why in a code comment.

## 4. Anti-patterns to refuse

- [ ] NO `window.dispatchEvent('gc-*')` event bus — use `platform`.
- [ ] NO file-level mutable `Set` / `Map` / `Object` caches for
      per-grid state — scope to the platform handle.
- [ ] NO compat shims (`useGridCore`, `useGridStore`) — every consumer
      goes through `useGridPlatform()` / `useModuleState(id)`.
- [ ] NO `setInterval` polling for grid api — use `platform.api.onReady`.
- [ ] NO `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` — either fix
      the type or narrow with a typed helper.
- [ ] NO `as unknown as { ... }` shape casts when the real type exists
      on `GridApi` / module state. Use the real type.
- [ ] NO `!important` unless beating inline styles set by a third-party
      library (Monaco, Radix). Comment the reason.
- [ ] NO orphaned dead code — if you delete the callsite, delete the
      helper too.

## 5. Duplication + complexity ceilings

- [ ] Single file target: **under 800 LOC**. If you're about to exceed,
      split into sibling files first.
- [ ] Single function target: **under 80 LOC**. Long handlers usually
      signal a missing reducer / helper.
- [ ] If the same 10+ lines appear in two places, extract.
- [ ] Keep pure logic (reducers, parsers, predicates) in a separate
      module from React components. Makes it unit-testable without rendering.

## 6. Tests

- [ ] Unit test coverage when the change includes pure logic — reducers,
      parsers, predicates, transforms. Write the test in the same commit
      as the code. Target 80%+ coverage on new logic.
- [ ] E2E test when the change adds / removes a user-observable
      behaviour. Follow the policy in `e2e/README.md`:
  - new feature → new `test()` block or new spec file
  - updated feature → update the existing test in the same commit
  - removed feature → delete the test in the same commit
  - bug fix → add a failing repro test, then fix, then passing test
- [ ] Preserve all existing test-ids (`cs-*`, `cols-*`, `cg-*`,
      `v2-settings-*`, etc.). Tests grep on these; breaking them cascades.
- [ ] No `.skip` / `.fixme` / `.only` in committed tests.

## 7. Scope guards

- [ ] v1 panels are reference/legacy. New features ship in v2 only.
- [ ] Don't re-audit known-drifted UI unless explicitly asked. Match
      patterns; don't redesign.

---

## When in doubt

If any box above is unclear for the feature at hand, flag it in the
response **before** starting implementation — don't guess. One round of
"here's the plan, is this the shape you want?" is cheaper than a refactor
after the user sees the wrong thing.
