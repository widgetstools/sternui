# v3 Critical Audit — Carried-Over v2 Antipatterns

Honest inventory of antipatterns that survived the v3 port. Compiled after
the profile-management regression exposed that the UI layer carries most
of v2's sins even though the platform layer (GridPlatform / ApiHub /
ResourceScope / PipelineRunner) is clean.

Every finding has a concrete reference so nothing here is hand-waving.

---

## Severity 1 — Silent correctness bugs

### 1.1 `useGridCore()` returns a fresh object on every render

**Files:** `packages/core/src/hooks/GridContext.ts` (the shim itself), every
ported panel that calls `useGridCore()`.

```ts
// GridContext.ts:24-32
export function useGridCore(): GridCoreLike {
  const platform = useGridPlatform();
  return {                                // ← new object literal every call
    gridId: platform.gridId,
    getGridApi: () => platform.api.api,
  };
}
```

Every v2-verbatim panel does:
```ts
const core = useGridCore();
useEffect(() => {
  const api = core.getGridApi();
  api.addEventListener('columnEverythingChanged', bump);
  return () => api.removeEventListener('columnEverythingChanged', bump);
}, [core]);                                // ← fires on EVERY render
```

Because `core` is a fresh reference each render, the effect runs every time
the parent re-renders — which is every grid state change (auto-save tick,
column resize, cell focus, etc.). Each run: `addEventListener`, previous
cleanup's `removeEventListener`. The listener count stays at 1 by luck,
but we're doing add+remove on every keystroke. Under heavy load this is
measurable, and more importantly, the pattern is semantically wrong.

**Affected panels:** `ColumnSettingsPanel.tsx`, `ConditionalStylingPanel.tsx`,
`ColumnGroupsPanel.tsx`, `CalculatedColumnsPanel.tsx`, `FormattingToolbar.tsx`.

**Same issue exists with the `store` return of `useGridStore()`** — but
that one dodges the bug because `platform.store` is a stable reference,
so the returned value is stable. `useGridCore` returns a NEW object
literal.

### 1.2 File-level mutable `dirtyRegistry` + `window.dispatchEvent` bus

**Files:**
- `ColumnSettingsPanel.tsx:153`
- `ColumnGroupsPanel.tsx:428`
- `CalculatedColumnsPanel.tsx:84`
- `ConditionalStylingPanel.tsx:360`

Each panel carries an identical module-level pattern:

```ts
const dirtyRegistry = new Set<string>();     // file-level state
function setDirty(itemId: string, value: boolean) {
  if (value) dirtyRegistry.add(itemId); else dirtyRegistry.delete(itemId);
  window.dispatchEvent(new CustomEvent('gc-dirty-change'));
}
```

Three things wrong:

1. **File-level state** — the exact pattern the v3 rewrite was supposed to
   eliminate. Two `<MarketsGrid>` instances on the same page share the same
   `dirtyRegistry`; editing a rule in grid A lights up the dirty LED on
   grid B. Identical to v2's `_gridResources = new Map<gridId, …>()` sin
   we called out in the original audit.
2. **Global `window` event bus** — `gc-dirty-change` is broadcast to every
   component on the page. No scoping, no payload, no grid id.
3. **Four independent copies** — identical code duplicated across four
   panels with no shared primitive.

The right shape is a per-platform dirty registry on `ResourceScope` (or
on the platform itself) that subscribers access through a hook.

### 1.3 Panels wire AG-Grid listeners directly, bypassing ApiHub

**Files:** every panel listed in 1.1, plus `column-groups/index.ts` (the
module itself).

```ts
// column-groups/index.ts:108-113
(api as unknown as { addEventListener: … })
  .addEventListener('columnGroupOpened', handler);
```

```ts
// ColumnSettingsPanel.tsx:93
api.addEventListener(evt, bump);
```

The whole point of `ApiHub.on(evt, fn)` + `platform.api.onReady(fn)` was to
centralize AG-Grid event wiring so disposers are guaranteed and the typed
`ApiEventName` union is enforced. v2-verbatim panels ignore it entirely
and cast `api` to `unknown` to reach the untyped `addEventListener`.
`ApiHub` is dead code in the panels.

The 20 `as unknown as {...}` casts in the modules counted earlier all
stem from this — the ApiHub's narrow type surface is bypassed via the
`useGridCore()` shim that hands back the raw `GridApi`.

### 1.4 `ProfileManager.boot()` doesn't guard against `disposed`

**File:** `packages/core/src/profiles/ProfileManager.ts:72-129`

```ts
async boot(): Promise<void> {
  try {
    // ... async adapter reads, state mutations, event emits ...
    this.platform.resetAll();
    this.platform.deserializeAll(snapshot.state);
    this.updateState({ activeId: resolvedId });
    ...
    if (!this.disableAutoSave) {
      this.autoSave = startAutoSave({ … });    // ← on a possibly-disposed manager
    }
  } catch …
}
```

Nothing inside `boot` checks `this.disposed`. If a StrictMode remount
creates M2 while M1's boot is still in flight (adapter reads are async),
both managers mutate `platform.resetAll()` + `deserializeAll()` on the
shared store. Even after my per-platform singleton fix, the WeakMap
entry was correctly replaced, but the old boot continues to run.
Right now the singleton means only one `boot` ever runs per platform,
but this is fragile: any code path that calls `new ProfileManager(...)
+ boot()` outside the hook hits it.

### 1.5 `setInterval` poll in FormattingToolbar

**File:** `packages/markets-grid/src/FormattingToolbar.tsx:318`

```ts
const poll = setInterval(() => {
  const api = core.getGridApi() as unknown as { addEventListener?: … } | null;
  if (!api || !mounted) return;
  ...
  clearInterval(poll);                           // ← eventually clears itself
  api.addEventListener('cellRangeSelectionChanged', update);
  ...
}, 100);
```

Exact `setInterval(300)` pattern the platform audit called out. The
ApiHub exists for precisely this — `platform.api.whenReady()` or
`platform.api.onReady(api => …)` returns a Promise + disposer. Keeping
the poll here means the same race v2 had (poll fires, api isn't live
yet, waits 100ms, retries) is still live in v3.

---

## Severity 2 — Design / architecture drift

### 2.1 Three coexisting color-picker implementations

1. `packages/core/src/ui/shadcn/color-picker.tsx` — shadcn-style `ColorPicker` + `ColorPickerPopover`
2. `packages/core/src/ui/ColorPicker/CompactColorField.tsx` + `ColorPickerPopover.tsx` — cockpit-style ("CompactColorField")
3. `packages/core/src/ui/format-editor/FormatColorPicker.tsx` — v1-era with its own `popoverStack`

Different APIs, different visual polish, different portal behaviors.
Different panels pick different ones. FormattingToolbar uses the shadcn
one; StyleEditor uses the cockpit one via `CompactColorField`;
BorderStyleEditor uses `FormatColorPicker` from format-editor.

### 2.2 Two coexisting Popover systems

1. `packages/core/src/ui/shadcn/popover.tsx` (Radix-based, `data-gc-settings` attribute)
2. `packages/core/src/ui/format-editor/FormatPopover.tsx` + `popoverStack.ts`
   (independent Radix instance + custom outside-click tracker)

`popoverStack.ts` re-implements outside-click logic across nested
popovers — something Radix already handles. The `registerPopoverRoot` /
`clickIsInsideAnyOpenPopover` API leaks into `FormatDropdown` and is
unused elsewhere.

### 2.3 Two coexisting border editors

1. `packages/core/src/ui/format-editor/BorderSidesEditor.tsx`
2. `packages/core/src/ui/StyleEditor/BorderStyleEditor.tsx`

Both render a border-side picker with width/style/color. Different UI,
different state shape. Unused `BorderSidesEditor` is still exported from
core and still referenced in the barrel.

### 2.4 Four token systems coexisting

1. `--ck-*` — cockpit (dark tokens in cockpit.ts, light in same file)
2. `--gc-*` — v1-era legacy. Now aliased to shadcn tokens in cockpit.ts. Tech debt that I added to fix the popover-transparent-bg bug.
3. shadcn `--background` / `--card` / `--border` / `--muted-foreground` — defined in `apps/demo/src/globals.css`, consumed by every shadcn primitive.
4. `--bn-*` — Binance palette (bn-green, bn-red, bn-yellow). Used in host chrome.

Components pick inconsistently:
- `FormattingToolbar` uses tailwind `bg-card text-foreground` (shadcn).
- Cockpit primitives use `var(--ck-card)` / `var(--ck-t0)`.
- `FormatColorPicker` uses `var(--gc-surface, #fff)`.
- `DraggableFloat` hover uses `color-mix(in srgb, var(--destructive) 14%, transparent)`.

There is no single source of truth for "what's the surface-1 color?".
Four token systems means four places to update for every theme change.

### 2.5 `styles.ts` (327 LOC) still exists but isn't injected

**File:** `packages/core/src/ui/styles.ts`

Still exported as `settingsCSS, STYLE_ID` from the core barrel. Nobody
injects it anymore (I dropped the injection when it conflicted with
`.gc-sheet` layout rules). It carries the original `--gc-*` token
definitions, v1-era `.gc-sheet` / `.gc-nav-item` / `.gc-field` / `.gc-input`
styles that are completely unused. Dead code still shipping in the bundle.

### 2.6 Every tick re-renders the entire host + descendants

**File:** `packages/markets-grid/src/useGridHost.ts:40-45`

```ts
const [tick, setTick] = useState(0);
useEffect(() => platform.store.subscribe(() => setTick((n) => n + 1)), [platform]);

const columnDefs = useMemo(
  () => platform.transformColumnDefs(opts.baseColumnDefs),
  [platform, opts.baseColumnDefs, tick],
);
```

`setTick` on every store change re-renders `MarketsGrid` → `Host` → every
descendant that isn't memoized. That means ProfileSelector, FiltersToolbar,
FormattingToolbar, SettingsSheet, and every open popover re-render on
every keystroke in any input anywhere. Not a "react is fast" excuse — this
was the explicit PipelineRunner cache design goal that we're bypassing at
the React layer.

The right shape: subscribe per-concern via `useSyncExternalStore` with a
module-id selector (like `useModuleState` already does), not a global tick.

### 2.7 `useAllColumns` re-walks the api on every tick × every column event

**File:** `ColumnSettingsPanel.tsx:82-145`

Subscribes to 5 AG-Grid events:
```ts
const events = ['columnEverythingChanged', 'displayedColumnsChanged',
  'columnVisible', 'columnPinned', 'columnResized'] as const;
```

`columnResized` fires on every pixel of drag. Each fire bumps tick. Each
bump re-runs `useMemo([core, tick])`. The memo walks `api.getColumns()`
and rebuilds the `ColumnInfo[]` array. During a resize drag this runs
~60 times/second. The list itself rarely changes content (just widths),
so the re-computation is wasted work.

---

## Severity 3 — Maintainability

### 3.1 20+ `as unknown as {...}` type escapes

See earlier grep. Each one is a lie — we have a typed api but we're pretending
we don't. They all disappear if panels consume `ApiHub` instead of `GridCore`.

### 3.2 Compat shims widely adopted by new code

The compat shims (`useGridCore`, `useModuleState(store, id)` 2-arg form,
`GridCore` + `GridStore` type aliases) were added specifically to enable
verbatim v2 panel ports. But now:

- The MarketsGrid host uses the 2-arg `useGridCore()` shim via `coreShim`
  to pass to `SettingsSheet` and `FormattingToolbar`. Those consume it
  because they're v2-verbatim.
- No new code uses the clean `useGridApi()` / `useGridEvent()` hooks
  that v3 shipped. They're dead weight.

The "compat" has become the main entry point.

### 3.3 No test coverage

- Only one test file: `packages/core/src/profiles/ProfileManager.test.ts`
  (the one I wrote today, reacting to a user-reported bug).
- v2 had module tests, adapter tests, resolveTemplates tests. I deleted
  all of them during the v3 port and never replaced them.

### 3.4 Panel code is ~2000 LOC each and mostly hand-rolled

The v2 panels we ported verbatim are in the 500-1600 LOC range each, with
most of the volume being inline event wiring, DOM class management,
useMemo + useEffect choreography. The StyleEditor primitive could collapse
most of this into declarative configs, but panels predate StyleEditor in
the v2 codebase so they don't use it.

---

## Severity 4 — Theming

### 4.1 Hardcoded hex fallbacks inside `var()` wrapped everywhere

Every `var(--border, #313944)` pattern. Not strictly wrong (the var wins
when defined), but proliferation of the hex-as-fallback means when the
dark theme needs to shift, we edit ~50 sites. Ideally the fallback is
never used because the token is always defined, so we could drop them.

### 4.2 Light mode hasn't been stress-tested

I verified light mode works for the settings sheet + formatting toolbar
popover after my `--gc-*` alias fix. I did NOT verify:

- BorderStyleEditor (v2-verbatim, uses cockpit + gc tokens)
- FormatColorPicker palette popover (uses `--gc-surface`)
- FormattingToolbar's font-size dropdown menu (shadcn Popover with bg-accent)
- AlertDialog in ProfileSelector delete-confirm
- Cell-selection highlight (AG-Grid's own theme — depends on themeQuartz
  dark vs light choice synced to `data-theme`)

---

## What the v3 rewrite was supposed to deliver vs what actually shipped

| v3 promise | Status |
|---|---|
| Framework-agnostic platform layer | ✅ GridPlatform / ApiHub / ResourceScope / PipelineRunner are clean |
| Single `activate(platform)` lifecycle | ✅ Modules use it (grid-state, calculated-columns, column-groups, conditional-styling) |
| No file-level `Map<gridId, X>` | ⚠ Modules are clean. **Panels have 4 `dirtyRegistry = new Set()`** instead. |
| Typed ApiHub replaces setInterval polling | ⚠ **Panels don't use it**. FormattingToolbar still polls with `setInterval(100)`. |
| One consolidated design system | ❌ **4 token systems**, 3 color pickers, 2 popovers, 2 border editors. |
| Lean & clean React bindings | ❌ Compat shims (`useGridCore`, 2-arg `useModuleState`) are the primary entry point. `useGridCore()` re-instantiates on every render. |
| Test coverage | ❌ 1 test file. |

Net: the **platform** is v3, the **UI** is still v2 with a compat layer.

---

## Path forward

Two options, honest trade-offs:

### Option A — Accept v2-verbatim UI, fix the leaks

Short scope. Pin the critical bugs so they can't recur:

1. Make `useGridCore()` return a stable reference (memoize via `useMemo` keyed on `platform`).
2. Hoist `dirtyRegistry` to `ResourceScope` so it's per-platform.
3. Replace the `setInterval` poll in FormattingToolbar with `platform.api.onReady()`.
4. Add `if (this.disposed) return` guards inside `ProfileManager.boot()` after each `await`.
5. Delete the dead `styles.ts` + the dead legacy `BorderSidesEditor` + the compat `settingsCSS` / `STYLE_ID` exports.
6. Add panel-level integration tests (at minimum: profile switch, rule add/remove, column-customization write-through) so this class of regression can't ship silent again.

~1-2 focused sessions. Panels stay verbatim. The platform promises stay true; the UI layer gets honest about being a compat surface.

### Option B — Rewrite the panels the v3-native way

Use the `StyleEditor` + `FormatterPicker` + Cockpit primitives + `ApiHub`
events to rebuild each panel declaratively. Each panel shrinks to ~300
LOC (schema-driven, like GridOptionsPanel originally was). Compat shims
get removed. Test coverage is built in as we rewrite. Single token system.

Much larger scope (multiple sessions per panel). But it's what v3 was
supposed to deliver. If we ship Option A first we can do Option B panel
by panel without regressions because the tests will catch drift.

---

## Recommendation

**Do Option A now.** It hardens what we have and gives us integration tests.
Then **do Option B incrementally** per panel with the tests guarding
against regression. Don't try to do both at once or ship without the tests.
