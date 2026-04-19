# v4 — UI Rebuild Plan (visual locked, code rewritten)

Goal: replace v3's UI layer (panels, toolbars, chrome, hooks) with a clean
rewrite. Preserve v2 look + feel pixel-for-pixel. Preserve every behavior
in `docs/IMPLEMENTED_FEATURES.md`. No compat shims. No carried-over
patterns unless genuinely the right choice.

---

## Scope

**In scope — rewrite:**
- All hooks in `packages/core/src/hooks/*` except `useGridPlatform` / `useGridApi` / `useGridEvent` (which are clean and keep)
- All module panels (5): GridOptions, ColumnSettings, Calculated, ColumnGroups, ConditionalStyling
- Shared editors: StyleEditor, FormatterPicker, BorderEditor, ColorPicker
- Toolbars: FormattingToolbar, FiltersToolbar
- Host chrome: MarketsGrid, SettingsSheet, ProfileSelector, HelpPanel, DraggableFloat
- Cockpit primitives (consolidate — drop `--gc-*`, `styles.ts`, duplicate pickers)
- CSS token system (pick one: `--ck-*`; drop `--gc-*` aliases)

**Out of scope — keep as-is:**
- Platform runtime: `GridPlatform`, `ApiHub`, `ResourceScope`, `PipelineRunner`, `EventBus`, `Store`, `topoSort` — these are v3-clean and tested in use
- Persistence: `DexieAdapter`, `MemoryAdapter`, `ProfileManager` class (already fixed + tested)
- Expression engine: `ExpressionEngine`, `Evaluator`, `Parser`, `tokenize`
- Module runtime code: `transforms.ts`, `state.ts`, `index.ts` for every module. Panels are what gets rewritten; module lifecycle already uses `activate(platform)` cleanly.
- `format-editor/*` — we'll pick ONE consolidated color-picker + popover surface but keep the SSF / excel-format parsers (they're pure logic, not UI).
- ExpressionEditor (Monaco) — heavy, already works
- `colDef/*` — pure writers, already clean

**Preserved external contracts:**
- `gc-customizer-v2` IndexedDB database name (back-compat with existing profile snapshots)
- Module ids, schemaVersions, `serialize` / `deserialize` / `migrate` signatures
- Every `data-testid` documented in `IMPLEMENTED_FEATURES.md` §1.7b + the e2e specs
- `MarketsGridProps` public prop shape

---

## Architecture

### New hook surface (no compat shims)

```
useGridPlatform()                 → GridPlatform                    stable
useGridApi()                      → GridApi | null                  stable
useGridEvent(evt, fn)             → () => void                     stable
useModuleState<T>(moduleId)       → [T, (prev) => T) => void]      stable; drop 2-arg form
useModuleDraft<TState, TItem>({…})→ { draft, setDraft, dirty, save, discard, missing }
useDirty(scope)                   → { set(id, dirty), isDirty(id), subscribe(fn) }
useGridColumns()                  → ColumnInfo[]                   stable; subscribes
                                                                    internally via useGridEvent
useProfileManager(opts)           → UseProfileManagerResult         unchanged — already clean
```

No `useGridCore`. No `useGridStore` (`platform.store` is the escape hatch).
No `as unknown as {…}`. No `window.dispatchEvent('gc-dirty-change')`.

`useDirty` replaces the 4 file-level `dirtyRegistry = new Set()` + window-
event pairs. Per-platform registry lives on `ResourceScope`, keyed by
scope name, subscribable via `useSyncExternalStore`.

### Pipeline re-render scope

`useGridHost` today bumps a single `tick` state on every store change and
every descendant re-renders. Replace with:

- `columnDefs` subscription scoped to the modules that emit `transformColumnDefs` (column-templates, column-customization, calculated-columns, column-groups, conditional-styling).
- `gridOptions` subscription scoped to the modules that emit `transformGridOptions` (general-settings, conditional-styling).
- Panels / toolbars / chrome read their own module via `useModuleState<T>(moduleId)` — `useSyncExternalStore` already short-circuits when the store returns the same reference.

Result: typing in the ProfileSelector rename input no longer re-renders
the FormattingToolbar.

### CSS + token system

- Keep `cockpit.ts`. Drop the `--gc-*` alias block I added in the bug-fix pass.
- Delete `ui/styles.ts` + its `settingsCSS` / `STYLE_ID` exports.
- Update `format-editor/*` to consume `--ck-*` directly instead of `--gc-*`.
- Single scrollbar theming rule on `.gc-sheet, .gc-sheet-v2` (already there).
- Light mode is one `[data-theme='light']` override block in cockpit.ts.
- Remove all `var(--X, #hexfallback)` raw-hex fallbacks in new code once tokens are guaranteed to resolve (every rendered surface is a child of `.gc-sheet` or `.gc-sheet-v2`).

### Component consolidation

| What | Keep / rewrite |
|---|---|
| Popover | **One** — `shadcn/popover` (Radix, portaled, cockpit-tokenized). Delete `format-editor/FormatPopover` + `popoverStack.ts`. |
| Color picker | **One** — `CompactColorField` + its portal (cockpit-tokenized). Delete `shadcn/color-picker` + `format-editor/FormatColorPicker`. |
| Border editor | **One** — the `StyleEditor/BorderStyleEditor`. Delete `format-editor/BorderSidesEditor`. |
| Dropdown | **One** — shadcn `Select` for enums, cockpit `PillToggleGroup` for tri-states. Drop `FormatDropdown`. |

---

## Ambiguities flagged (answer before I code)

These points in the spec don't have a single unambiguous reading. I'm not
guessing — please confirm before I build them.

### A1. Rule priority ordering
Spec §1.7: "a rule can carry a valueFormatter... the highest-priority
matching rule wins". Elsewhere the code reads "lower number runs first".

**Question:** in the UI, does a priority of **1 sort higher** (lower number
= higher priority, common in CSS / AG-Grid) or **higher number = higher
priority** (common in spreadsheets)?

If I see `rules[0].priority = 1` and `rules[1].priority = 5`, which rule's
formatter wins on a cell that matches both?

### A2. Cell datatype auto-detection heuristic
Spec §1.12: "sample the first 20 rows of each column to infer
`cellDataType`". What's the resolution rule?

- Majority wins? (e.g. 19 numbers + 1 string → number)
- All-or-nothing? (single non-conforming row disqualifies)
- First non-null?
- Host-provided `cellDataType` always wins — confirmed. But the inference
  rule when host doesn't set one isn't specified.

### A3. ISO date coercion edge cases
Spec §1.12: "Date objects + ISO-8601 strings (starts with yyyy-mm-dd) get
parsed to Date before being handed to SSF".

**Questions:**
- Does `"2026-04-17"` (no time) coerce to `Date`? (What timezone?)
- Does `"2026-04-17T09:30"` (no seconds / Z)? 
- `"04/17/2026"` — treated as raw string → passed to SSF as-is?
- Excel format strings expecting a Date get strings through — graceful
  degradation (identity) or error chip in the UI?

### A4. Currency "smart replace" exact behavior
Spec §1.12: currency buttons "smart-replace the currency symbol in the
current custom format while leaving the rest of the pattern intact."

**Questions:**
- What's the token-match algorithm? Replace ANY of `[$€£¥₹]` + `"CHF"`? Or
  only when anchored at position 0?
- Format `"$#,##0.00;($#,##0.00)"` — clicking € gives `"€#,##0.00;(€#,##0.00)"` (all sites) or `"€#,##0.00;($#,##0.00)"` (first only)?
- Format has no currency symbol (e.g. `"#,##0.00"`) — prepend, or do nothing, or show a toast?

### A5. Flash config + indicator — merged or separate?
Spec §1.7 lists:
- "Flash config band — target, duration, fade, continuous-pulse toggle"
- "Rule indicator badges — icon, color, position, target"

These are two distinct UI bands. But the current `state.ts` has only
`flash?: FlashConfig` and `indicator?: RuleIndicator` as optional
fields. The v2 panel renders them under one "Flash & Indicator" band.

**Question:** one band or two? If two, what are the band numbers (07 FLASH
+ 08 INDICATOR, or 08 flash+indicator merged)?

### A6. DraggableFloat persistence scope
Spec §1.12b: "local state" for the last-dragged position.

**Questions:**
- Per-session (lost on reload) OR per-profile (stored in module state) OR persistent (localStorage)?
- If per-profile — what module holds it? `toolbar-visibility` seems the natural home.

### A7. Indicator icon catalog — exact list
Spec §1.7: "20+ Lucide glyphs". The existing code enumerates a specific
set in `indicatorIcons.ts`. 

**Question:** treat the current `indicatorIcons.ts` list as the locked
canonical catalog, or is this open?

### A8. Header-follows-cell alignment fallback
Spec §1.12 + §1.14: "aligning cells via 'Cell' target applies the same
alignment to the column header by default". Spec describes a fallback
chain `headerStyleOverrides → cellStyleOverrides`.

**Question:** if the user EXPLICITLY clears the header alignment (selects
DEFAULT in the Header target dropdown), does that mean "inherit from cell"
or "no alignment, AG-Grid default"? Current code: inherits from cell.
Intended?

### A9. Template resolution order
Spec §1.7b: "APPLICATION ORDER — LATER TEMPLATES LAYER OVER EARLIER".

**Question confirmed:** later wins in the chain? (i.e., for `[tplA, tplB]`,
`tplB`'s overrides win over `tplA`'s on conflict). Plus the assignment
itself wins over every template. Confirmed — but the v2 code also has a
`typeDefault` that kicks in when `templateIds === undefined`. How does
that interact with an explicit empty `templateIds: []` — opt-out?

### A10. Save semantics — per-card vs explicit Save button?
Spec §1.7b: "explicit SAVE pill (draft / dirty pattern). A commit that
clears every override deletes the assignment entry outright".

Spec §1.11: "RESET pill ... the panel has its own ObjectTitleRow header
with a teal SAVE pill".

So every editable surface has per-item SAVE.

**Question:** Does the top-toolbar Save button commit ALL dirty items
across every panel, or does it only flush the auto-save debounce? If ALL,
what happens to dirty drafts in panels the user hasn't opened yet (hidden
drafts in `dirtyRegistry`)?

### A11. Which filter `cellDataType` values map to which FormatterPicker preset group?
Spec §1.12: "FormatterPicker filters its preset list by column type (number / date / string / boolean)".

**Question:** AG-Grid cellDataType values are `text` / `number` / `numeric`
/ `date` / `dateString` / `dateTimeString` / `boolean` / `object` — which
map to which FormatterPicker dataType? My current code has an ad-hoc map;
is there a canonical one?

---

## Phases

Each phase lands as a series of commits; tests added alongside. I won't
move to the next phase until you've sanity-checked the current one in the
running demo.

### Phase 0 — Plan sign-off (this document)
Decide:
- Approve scope above (in/out of scope lists).
- Answer ambiguities A1–A11.
- Pick branch strategy (suggest: continue on `v3-clean`; commits are
  reversible, so if this goes sideways you revert to today's HEAD).

### Phase 1 — Platform + hook hardening
- New hooks: `useModuleDraft`, `useDirty`, `useGridColumns`.
- Remove `useGridCore`, `useModuleState` 2-arg overload, `GridCore` / `GridStore` back-compat type aliases.
- Re-scope `useGridHost` to subscribe per-concern (columnDefs vs gridOptions), drop the global `tick`.
- Disposed-guards in `ProfileManager.boot()` after every `await`.
- Delete `ui/styles.ts` + the `settingsCSS` / `STYLE_ID` exports.
- Drop `--gc-*` alias block (migrate any consumer in-scope to `--ck-*`).
- Unit tests for every new hook.

### Phase 2 — Primitive consolidation
- Audit which components consume which primitive variant.
- Pick canonical versions (see Consolidation table above).
- Delete the losers. Migrate call sites to the winners.
- Integration test that every popover + dropdown + color picker opens and dismisses cleanly.
- **Visual-regression baseline captured here** — screenshot every v2 surface before we start rewriting panels, so we have pixel references.

### Phase 3 — Panel rewrites (1 panel per sub-phase)

Each panel sub-phase:
1. Write the panel on the new primitives / hooks.
2. Write RTL integration test covering every feature the spec enumerates for that panel.
3. Compare against the Phase 2 baseline screenshot(s).
4. Land with a commit.
5. Delete the old v2-verbatim panel file.

Order (smallest → largest):
- **3a. GridOptionsPanel** (60 controls, schema-driven)
- **3b. CalculatedColumnsPanel** (3 bands, master-detail)
- **3c. ColumnGroupsPanel** (tree editor)
- **3d. ConditionalStylingPanel** (rule editor)
- **3e. ColumnSettingsPanel** (8 bands, biggest)

### Phase 4 — Toolbars + host chrome
- **4a. FiltersToolbar** + saved-filters module panel
- **4b. FormattingToolbar** (2-row responsive, on new primitives)
- **4c. DraggableFloat** (already clean; minor refactor if needed)
- **4d. MarketsGrid host** (`useGridHost` rewrite, toolbar layout rewrite)
- **4e. SettingsSheet** + `HelpPanel` + `ProfileSelector`

### Phase 5 — Tests + docs
- E2E journey tests (Playwright or the preview_* tooling) covering:
  - Create / load / delete / switch / export / import profiles
  - Every panel's happy path
  - Grid state save + reload
  - Profile-isolation regression
- Refresh `V3_ARCHITECTURE.md` → `V4_ARCHITECTURE.md`.
- Delete `V3_AUDIT.md` once everything in it is actually fixed.

---

## Anti-goals (things to NOT do)

- No "improvements" to v2 visuals. Every color, every pixel, every animation is locked.
- No new features beyond what's in `IMPLEMENTED_FEATURES.md`.
- No alternative architecture for persistence (Dexie stays).
- No JS framework swaps, no Tailwind swaps, no Radix swaps.
- No attempt to collapse the module-id schemaVersion universe.

---

## Request

Please respond with:
1. **Approve / modify** the scope + phases.
2. **Answer A1–A11** so I can implement without guessing.
3. **Confirm branch strategy** (keep on `v3-clean`? new `v4` branch?).

Once I have these I'll start Phase 1. Won't write a line of panel code
until Phase 1 + Phase 2 are landed and verified — the whole point is to
build on a clean foundation, and the phases exist to enforce that
ordering.
