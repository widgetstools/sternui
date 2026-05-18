---
title: "StarUI Platform — UX Nuances Catalogue"
subtitle: "Behavioural, visual, and interaction-level details that the public API doesn't make obvious"
date: "2026-05-18"
status: "Living document — every UX-affecting fix or tweak adds an entry here"
---

# Foreword

`PUBLIC_API_SPEC.md` describes the **surface** — the signatures, props,
and behaviours an implementation must honour at the API level. This
document captures the **interior** — the per-component nuances,
cross-window subtleties, race-condition workarounds, and visual
conventions that are not visible in any type signature but that users
absolutely depend on.

**Why this file exists.** Three years of trading-floor use has
embedded the kind of knowledge that does not survive a rewrite:

- A user pops out the Grid Customizer into its own OpenFin window.
  Dropdowns inside it land on the parent window instead of the popout.
  The user files a bug. Two days of investigation later, somebody
  re-discovers that `Radix.Portal` defaults to the lexically captured
  `document.body`, and a `PortalContainerProvider` has to be re-wired
  through every shadcn primitive. **A rewrite that runs
  `npx shadcn add popover` re-introduces this bug.**
- A user holds Shift and clicks a row to range-select. The selection
  works in the demo but breaks in the OpenFin shell because
  `event.preventDefault()` happens at a different stage in the dock
  manager's frame. **A rewrite without this catalogued silently
  regresses.**
- A user switches dark→light theme mid-edit on the formatter. The
  AG-Grid quartz theme update flashes the cells white for ~80ms.
  The original fix was a single `requestAnimationFrame` wrapper
  around the theme swap to coalesce paint cycles. **Not testable
  without a screenshot, not visible in the API, not documented
  anywhere — until now.**

The function of this document is to capture every such nuance
**before** the rewrite, so the rewrite preserves it.

**Second function: separate root-cause fixes from workarounds.**
Three years of iterative pressure mean some of these "fixes" are
single-line patches that capture multi-day investigations of a
symptom whose actual root cause was never re-architected. Layered
on top of each other across the codebase, they account for a
meaningful slice of the platform's bloat — each workaround adds
files, conditionals, and explanatory comments that a ground-up
solution would not need. The **Fix taxonomy** below classifies
each entry so a rewrite can preserve root-cause fixes verbatim
while challenging workarounds — and especially layered
workarounds — at their actual root. The Monaco key-routing chain
(N31.4 → N31.5 → N31.6) is the worked example: three workarounds
for one underlying issue (host-shell key-event interception); a
re-architected event model collapses them back to zero.

**Companion artifact.** `docs/visual-reference/` holds screenshots of
every screen and component-state, captured against `apps/demo-react`
and `apps/demo-angular`. The catalogue references those shots where
visual parity matters. See `docs/visual-reference/README.md` for the
capture workflow.

**This is not API spec.** Implementations are free to refactor the
*shape* of the code that implements these nuances; what they must
preserve is the **user-visible outcome**. Every entry below specifies
the symptom-if-missing so that reviewers can verify the rewrite
without having to reconstruct the original reasoning.

---

# Conventions

Each entry follows the same shape:

- **Surface** — the component, panel, screen, or interaction affected.
- **Symptom if missing** — what the user sees when the nuance is not
  honoured. This is the verifiable test.
- **Root cause** — the underlying mechanism. Explains *why* the fix is
  necessary, not just *what* it does.
- **Implementation note** — the actual fix, at the level of detail a
  reader needs to reproduce it. Concrete enough that a rewrite has a
  clear target.
- **Files (v1)** — the locations in the current codebase where the
  knowledge lives, for cross-reference during a rewrite.
- **Screenshots** — links to `visual-reference/` where applicable.

Entries are numbered with a stable prefix (`N1`, `N2`, …) so a
catalogue index never re-numbers existing items when new ones are
added between them.

---

# Fix taxonomy

Not every nuance in this catalogue carries the same weight for a
rewrite. Some entries describe how the system *should* work — a
rewrite should reproduce them faithfully. Others describe
**workarounds** for a deeper problem that the rewrite has the
opportunity to solve at the root. Three years of iterative fixes
mean some behaviours that look load-bearing are actually
workarounds piled on workarounds. A rewrite that copies them
faithfully inherits the fragility. A rewrite that re-investigates
the workaround tags has the chance to collapse layered fixes back
into a single root-cause solution.

Each fully-written entry below carries a **Classification** tag
from this set:

| Tag | Meaning | Rewrite guidance |
|---|---|---|
| **Root-cause fix** | The correct way to solve a real problem. The behaviour is intentional and stable. | Preserve verbatim. |
| **Architectural decision** | Not a fix at all — just how the system is correctly designed. | Preserve verbatim. |
| **Defensive guard** | Handles upstream behaviour (React StrictMode, OpenFin lifecycle, Monaco internals) that the framework cannot change. | Preserve unless the upstream behaviour changes. |
| **Workaround** | Papers over a symptom whose root cause is elsewhere. Often a single-line fix that captured a multi-day investigation. | Re-investigate root cause; replace if possible; preserve verbatim otherwise. |
| **Layered workaround** | A workaround sitting on top of another workaround. Especially fragile because removing the lower layer breaks the upper. | **Prioritize unrolling.** |

**Why this distinction matters.** The Monaco key-routing chain
(N31.4 → N31.5 → N31.6) is the clearest example in this catalogue:
three workarounds sit on top of one underlying issue (host-shell
key-event interception in popped windows and transform-using
containers). A re-architected popout host's event model could
collapse all three back into zero workarounds. A rewrite that
preserves them verbatim ships the same fragility plus the
maintenance burden of three documented hacks.

The N3 (data-theme on `<html>` not `<body>`) and N7 (popout body
scope tags) entries are similarly cascade-collision workarounds
that a token-consolidation refactor would obviate. The reset-last
sub-clause of N4 is a workaround for the parent app setting
`body { padding: 10px }` — a rewrite host that doesn't set body
padding doesn't need the `!important` reset chain.

When a rewrite re-encounters one of these surfaces, **start from
the symptom**, not from the workaround. The catalogue documents
both so the rewriter has the option.

---

# Index

"R" = Root-cause fix · "A" = Architectural decision ·
"D" = Defensive guard · "W" = Workaround · "L" = Layered workaround
(prioritize unrolling).

| # | Surface | Title | Class |
|---|---|---|---|
| **N1** | shadcn primitives in popouts | Portal-using shadcn primitives must target the popout window's document | R |
| **N2** | PopoutPortal | StrictMode-safe window registry — defer close, dedupe in-flight create | D |
| **N3** | PopoutPortal | Mirror `data-theme` onto popout `<html>`, NOT `<body>` | W |
| **N4** | PopoutPortal | Clone parent stylesheets into popout `<head>` + append reset last | R + W |
| **N5** | PopoutPortal | Auto-resize on Radix popover open via MutationObserver | W |
| **N6** | PopoutPortal | Close-detection grace period + `readyState === 'complete'` gate | D |
| **N7** | PopoutPortal | Seed popout `<body>` with `ds-sheet-v2` + `data-ds-settings` for token inheritance | W |
| **N8** | PopoutPortal | OpenFin uses `fin.Window.create` via opener-callback, not `window.open` | A |
| **N9** | PopoutPortal | Mount node created in `useEffect`, never `useMemo` | R |
| N10 | Grid Customizer | _TODO — popout title bar drag region, edit-commit on blur vs Enter, Escape cancels_ | ? |
| N11 | Formatter dialog | _TODO — Excel-format token autocomplete, live preview update cadence, color-picker portal target_ | ? |
| N12 | Profile Manager | _TODO — auto-scroll new profile into view, focus name field after Add, rename-in-place vs dialog_ | ? |
| N13 | AG-Grid theme | _TODO — themeQuartz CSS-var rebuild on theme switch, rAF-wrapped swap to prevent flash_ | ? |
| N14 | Workspace Setup wizard | _TODO — step-back preserves form state, Continue disabled until validated_ | ? |
| N15 | Cell context menu | _TODO — right-click on selected vs unselected cell, copy-with-headers vs copy-cells_ | ? |
| N16 | Settings sheet | _TODO — animation timing (entry 220ms, exit 180ms), close on outside-click vs Esc only_ | ? |
| N17 | Column reordering | _TODO — drag handle visibility, drop indicator styling, snap-back on out-of-bounds_ | ? |
| N18 | Drag-and-drop | _TODO — cursor change to grab/grabbing, drop-indicator z-index above sticky headers_ | ? |
| N19 | Inline edit | _TODO — commit on Enter / Tab / blur, cancel on Esc, click-out commits not cancels_ | ? |
| N20 | Toasts | _TODO — top-right under OS chrome offset, max-5 stacked, auto-dismiss 4s success / sticky error_ | ? |
| N21 | Focus management | _TODO — focus returns to triggering element on dialog close, focus-trap inside modal_ | ? |
| N22 | Tooltips | _TODO — only render on truncated text, 500ms open delay, 0ms close delay_ | ? |
| N23 | Multi-select lists | _TODO — Shift = range, Cmd/Ctrl = toggle, plain click = replace, Esc = clear_ | ? |
| N24 | Loading vs empty | _TODO — spinner + "Loading…" vs illustration + "No data" — never both_ | ? |
| N25 | Validation | _TODO — on-blur for sync, debounced 300ms for async, on-submit summary for forms_ | ? |
| N26 | Keyboard shortcuts | _TODO — Cmd/Ctrl-S save, Cmd/Ctrl-F find, Cmd/Ctrl-/ help, Esc closes top dialog_ | ? |
| N27 | Horizontal scroll preservation | _TODO — AG-Grid scroll position preserved across profile switch_ | ? |
| N28 | Theme switch atomicity | _TODO — no flash of unstyled grid; themed CSS-var swap inside rAF_ | ? |
| N29 | Conditional formatting cascade | _TODO — per-cell rule priority order, tie-break by definition order_ | ? |
| N30 | Resizable panels | _TODO — snap to default at 30px, persist size to profile, double-click handle = reset_ | ? |
| **N31** | Monaco expression editor in popouts | Six separate fixes Monaco needs when its host is a popped-out window | R + W + L |
| **N32** | Conditional-styling expression scope | Prototype-chain diff scope — same `[…]` syntax handles live + old/new without engine knowing the difference | R |
| **N33** | Diagnostic logging | Single `createLogger("starui:<pkg>")` contract — 302 bare-console-call legacy is workaround-class debt | W |
| **N34** | Identity-trust boundary | Server-side dev/prod mode is the only correct place to gate "trust client-supplied userId" — client-side gates leak | A |

Entries N1–N9, N31, N32, N33, and N34 are fully captured below.
Entries N10–N30 are stubs — they name a real, observable nuance that
the rewrite must preserve, but the full implementation note is not
yet authored.
**The stubs are deliberately not empty: their existence is itself
information** — a rewrite reviewer scanning this index sees that the
formatter dialog has a non-trivial Excel-format autocomplete that
cannot be re-implemented from the spec alone.

---

# Entries

## N1. Portal-using shadcn primitives must target the popout window's document

**Classification.** Root-cause fix. Radix's `Portal` exposes
`container` exactly for this case; the framework just wires
context-driven propagation. Preserve verbatim.

**Surface.** Every shadcn/ui primitive built on a Radix `Portal`:
`Popover`, `DropdownMenu`, `Tooltip`, `HoverCard`, `Select`,
`ContextMenu`, `Dialog`, `AlertDialog`, `Menubar`, `Sheet`, `Drawer`,
and the toast layer. The 12 wired primitives in
`packages/react/ui/src/components/` all consume
`useResolvedPortalContainer()`.

**Symptom if missing.** The user pops out the Grid Customizer or the
Formatter dialog into a separate browser or OpenFin window. Inside
the popout, clicking any Select shows the dropdown panel back on the
*parent* window. Tooltips render on the parent. Dialog overlays cover
the parent instead of the popout. Keyboard focus jumps across
windows. The popout is effectively unusable for any real editing.

**Root cause.** Radix `Portal` resolves its mount target as
`containerProp || (mounted && document.body)`. The `document`
reference is captured at module evaluation time — i.e. in the parent
window's V8 context. When React renders a subtree into a popout via
`ReactDOM.createPortal(<App/>, popoutWindow.document.body)`, the
subtree's React tree is correctly inside the popout, but every
nested Radix portal still computes `document.body` against the
parent's document. Result: portal content lands in the wrong
window. Z-index inside the parent's stacking context cannot reach
the popout, so portaled menus are simply invisible to the user
sitting in front of the popout.

**Implementation note.**

1. Define a React context (`PortalContainerContext`) in
   `@starui/ui` that holds the current portal target — `HTMLElement |
   null`. Default is `null`.
2. Provide a hook `useResolvedPortalContainer()` that returns
   `context ?? document.body`. The `?? document.body` fallback is
   essential: without it, the first render before `mounted` flips
   true has no container at all, and portal content fails to mount
   until a later commit (popovers visibly fail-then-appear on parent-
   window opens). See `portal-container.tsx`'s docstring for the
   exact rationale.
3. Every shadcn primitive's `Content` component reads the hook and
   forwards as the `container` prop to `Radix.Portal`:
   ```tsx
   const portalContainer = useResolvedPortalContainer();
   return (
     <PopoverPrimitive.Portal container={portalContainer}>
       …
     </PopoverPrimitive.Portal>
   );
   ```
4. The popout host (`PopoutPortal` in `@starui/grid-react`) wraps its
   children in `<PortalContainerProvider container={popoutWindow.document.body}>`
   before delegating to `ReactDOM.createPortal`. Native
   `createPortal` callers (grid-internal menus, etc.) read the same
   context.
5. Parent-window code paths see no behaviour change: the
   `useResolvedPortalContainer` hook falls back to the parent's
   `document.body` exactly as before.

**Why a context and not a prop.** Components deep inside a
customizer sub-panel (e.g. a `Select` inside a `Popover` inside a
tab inside the sheet) cannot reasonably be threaded a `container`
prop. Context lets every portal-using primitive pick up the right
target without any caller awareness.

**Files (v1).**
- `packages/react/ui/src/portal-container.tsx` — context + hook
- `packages/react/ui/src/components/popover.tsx` — and 11 sibling files
- `packages/react/widgets/grid-react/src/ui/PopoutPortal.tsx` — provider wiring
- `packages/react/widgets/grid-react/src/ui/PortalContainer.tsx` — local re-export

**Screenshots.**
- `visual-reference/popout-correct/dropdown-in-popout.png`
- `visual-reference/popout-broken/dropdown-on-parent.png`

---

## N2. StrictMode-safe window registry — defer close, dedupe in-flight create

**Classification.** Defensive guard. React 19 StrictMode's
mount → cleanup → remount cycle is upstream behaviour the
framework cannot change; the registry is the correct response to
it. Preserve unless React's StrictMode semantics change.

**Surface.** `PopoutPortal` mount/unmount cycle under React 19
StrictMode.

**Symptom if missing.** Running in dev (StrictMode on), the user
clicks "Pop out". The OpenFin window opens, immediately closes, then
fails to reopen with `"name-uuid already in use"`. The popout never
appears. In production builds (no StrictMode) the bug is invisible.

**Root cause.** StrictMode double-invokes `useEffect`:
mount → cleanup → remount. If the cleanup synchronously calls
`popout.close()`, the remount tries to reopen the same-named window
while OpenFin's window manager is still in the closing transition.
Two parallel `fin.Window.create` calls for the same name race; one
wins, the other rejects.

**Implementation note.**

1. Maintain three module-level maps keyed by window name:
   - `liveWindows: Map<string, Window>` — currently-open windows.
   - `pendingCloses: Map<string, Timeout>` — scheduled deferred
     closes.
   - `pendingCreates: Map<string, Promise<Window>>` — in-flight
     create operations.
2. On cleanup, do not call `popout.close()` synchronously. Instead
   call `scheduleDeferredClose(name)` which sets a `setTimeout` of
   `STRICTMODE_REMOUNT_GRACE_MS = 50ms`.
3. On mount, the first thing the effect does is
   `cancelPendingClose(name)`. If a StrictMode remount fires within
   50ms, the close timer is cleared before it triggers, and the
   live cached window is reused — zero re-open required.
4. If two parallel mounts somehow race (e.g. two siblings open the
   same-named popout), `pendingCreates.get(name)` returns the
   first's promise; the second `await`s it instead of starting a
   second `fin.Window.create`.
5. Clean (non-StrictMode) unmounts close the window ~50ms after the
   user's action — imperceptible.

**Files (v1).** `packages/react/widgets/grid-react/src/ui/PopoutPortal.tsx`
lines 20–53, plus `__resetPopoutPortalState` exported for tests
(lines 56–64).

---

## N3. Mirror `data-theme` onto popout `<html>`, NOT `<body>`

**Classification.** Workaround. The root cause is a cascade
collision between two stylesheets (`fi-dark.css` and `globals.css`)
that both define shadcn color tokens with different selectors and
different value formats. A rewrite that consolidates token sources
to a single stylesheet (with consistent value format — either
HSL-triplet or hex everywhere) obviates this entry. Preserve
verbatim if the dual-stylesheet setup is kept; revisit if tokens
are consolidated.

**Surface.** Every themed component (formatter, customizer,
settings sheet) rendered inside a popout.

**Symptom if missing.** Open a popout in dark mode. The popout's
background is correct. Open a Color Picker inside the popout — the
popover content renders with a **transparent** background. Text is
invisible against the popped content. Light mode is unaffected.

**Root cause.** The platform loads two stylesheets that both define
shadcn color tokens, with different selectors:

- `fi-dark.css` (design-system) uses `:root, [data-theme="dark"]`
  with HSL-triplet values like `--card: 214 26% 10%`.
- `globals.css` (app shell) uses just `:root` with hex values like
  `--card: var(--ds-surface-primary)`.

If `data-theme="dark"` is mirrored onto **`<html>`** (the same node
that matches `:root`), both rules match the same selector
specificity tier and load-order wins — globals.css is loaded last,
its hex value wins, descendants inherit correct values. Working.

If `data-theme="dark"` is mirrored onto **`<body>`** instead,
`[data-theme="dark"]` (in fi-dark.css) matches body directly, but
`:root` (in globals.css) does not match body. Now on body,
fi-dark.css wins with the HSL-triplet value. A descendant CSS rule
`background: hsl(var(--card))` resolves correctly, but
`background: var(--card)` (the common pattern in shadcn primitives)
resolves to the literal triplet `214 26% 10%` — invalid as a
property value — so the rule is dropped and the element is
transparent.

**Implementation note.** Mirror `data-theme` only onto
`popout.document.documentElement` (i.e. `<html>`). Do NOT also set
it on `<body>`. The cockpit-scoped selectors in
`design-system/cockpit.ts` use `[data-theme='light'] .ds-sheet-v2`
form (descendant selector), so body still matches as a descendant
of html.

**Files (v1).** `PopoutPortal.tsx` lines 396–426, plus the docblock
above the `useEffect` explaining the cascade interaction.

---

## N4. Clone parent stylesheets into popout `<head>` + append reset last

**Classification.** Mixed. Stylesheet cloning is a **root-cause
fix** — there is no other way to populate a fresh popout's `<head>`
with the parent's runtime-injected CSS. Appending the reset
`<style>` last with `!important` flags is a **workaround** for the
parent app's `body { padding: 10px }` leaking through the clone.
A rewrite host that doesn't set body padding obviates the
`!important` reset chain (cascade-order alone suffices). Preserve
the clone path verbatim; consider dropping the `!important` flags
once the host's body padding is gone.

**Surface.** Every styled element rendered inside a popout window.

**Symptom if missing.** Popout opens but renders unstyled — no
shadcn tokens, no design-system tokens, no Tailwind utilities.
Looks like a 1990s form. Alternatively: styling appears correct,
but the popout's body has a 10px padding all around, producing a
visible shadow + scrollbar.

**Root cause.** A fresh `window.open` (or `fin.Window.create`)
yields an `about:blank` document with no stylesheets. React mounts
into the empty document and renders elements that reference CSS
variables (`--ds-*`, `--primary`, Tailwind classes' compiled rules)
that are not defined anywhere in the popout's `document.head`.

For the padding issue: the main app's `index.css` sets
`body { padding: 10px }`. When we clone parent stylesheets into the
popout's `<head>` to fix the missing-styles issue, that rule comes
along for the ride.

**Implementation note.**

1. After the popout's `about:blank` initial load completes (gated
   on `readyState === 'complete'` — see N6), iterate
   `document.head.querySelectorAll('style, link[rel="stylesheet"]')`
   and `appendChild(el.cloneNode(true))` each into
   `popout.document.head`.
2. Each clone is individually try/catch'd so a single CORS-blocked
   stylesheet doesn't abort the rest.
3. **After** cloning, append a final inline `<style>` reset that
   defeats inherited body padding and locks the popout root to
   100% × 100vh. Use `!important` belt-and-braces against any
   cloned rule that uses it too:
   ```css
   html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; overflow: hidden !important; }
   body { font-family: inherit; background: var(--ds-surface-ground); color: var(--ds-text-primary); }
   [data-popout-root] { width: 100% !important; height: 100% !important; min-width: 0; min-height: 0; overflow: hidden !important; }
   ```
4. The reset is appended **last** so cascade order alone resolves
   any conflict with the cloned `body { padding: 10px }`. The
   `!important` is safety against late-loading dynamic stylesheets
   (chunk-split bundles arriving via dynamic `import()` after our
   reset).

**Files (v1).** `PopoutPortal.tsx` lines 618–648 — `prepareDocument`
helper.

---

## N5. Auto-resize on Radix popover open via MutationObserver

**Classification.** Workaround. The root cause is a UI decision to
default the popped toolbar to a height that's smaller than the
menus the toolbar can open. A rewrite that sizes toolbar popouts
to the largest menu they can host, or that re-anchors menus to
attach below the popout window when they'd overflow, obviates the
observer-driven resize. Preserve verbatim unless the popout sizing
strategy is rethought.

**Surface.** Toolbar-height popouts that host Radix popovers /
menus / tooltips internally — e.g. the MarketsGrid
`FormattingToolbar` popped out at 900×120 px.

**Symptom if missing.** User pops out a toolbar. Clicks the
"Templates" menu. The menu's panel is taller than the 120px popout
window so the bottom half of the menu is clipped by the OS chrome.
User has to manually resize the window to read the menu.

**Implementation note.**

1. Accept an optional `expandedHeight` prop on `PopoutPortal`.
2. After the popout opens, attach a `MutationObserver` to
   `popout.document.body` watching
   `{ childList: true, subtree: true }`.
3. On each mutation, count
   `doc.querySelectorAll('[data-radix-popper-content-wrapper]').length`.
   This wrapper attribute is emitted by every Radix popper —
   Popover, AlertDialog, DropdownMenu, Tooltip, Select all share
   it.
4. When the count transitions 0 → >0, call
   `popout.resizeTo(width, expandedHeight)`. When it returns to 0,
   `popout.resizeTo(width, height)`.
5. `resizeTo` is honored by both browsers (for same-origin named
   windows they opened) and OpenFin.

**Trade-off.** Native `createPortal` callers that don't use Radix
(e.g. an ad-hoc HelpOverlay) won't trigger the resize. Acceptable —
those are rare and the toolbar popout is the only place
`expandedHeight` is currently used.

**Files (v1).** `PopoutPortal.tsx` lines 437–474.

---

## N6. Close-detection grace period + `readyState === 'complete'` gate

**Classification.** Defensive guard. OpenFin's `about:blank`
synthetic `beforeunload` and transient `popout.closed === true`
during initial navigation are upstream lifecycle quirks. The gates
are the correct response. Preserve unless OpenFin's lifecycle
changes.

**Surface.** `PopoutPortal` close-detection on OpenFin.

**Symptom if missing.** Popout opens for ~200ms then mysteriously
closes itself. Parent flips its "popped" state back to false and
re-mounts the sheet inline. User clicks "Pop out" again — same
thing. Looks like an infinite open-close-open loop.

**Root cause.** Two distinct races:

1. The `about:blank` initial-navigation lifecycle in OpenFin fires
   a synthetic `beforeunload` on the first load tick. The portal's
   `beforeunload` handler reads this as "user closed the popout"
   and calls `onClose`.
2. `popout.closed` can transiently report `true` during the
   window's initial navigation in some OpenFin runtime versions.
   A close-poll with no grace period reads this as a real close.

**Implementation note.**

1. Gate the `beforeunload` listener on
   `popout.document.readyState === 'complete'`. If not yet, attach
   on `popout.addEventListener('load', attachUnload, { once: true })`.
2. Delay the first close-poll tick by `graceMs = 1000`. Implement
   via `setTimeout` wrapping a `setInterval(... 500ms)`.
3. Clean up both timers in the effect's return value.

**Files (v1).** `PopoutPortal.tsx` lines 334–373.

---

## N7. Seed popout `<body>` with `ds-sheet-v2` + `data-ds-settings` for token inheritance

**Classification.** Workaround. The root cause is the
design-system scoping cockpit-specific tokens under
`.ds-sheet-v2 :where(...)` / `[data-ds-settings] :where(...)`
selectors instead of cascading from `:root`. A rewrite that
cascades cockpit tokens from `:root` (with explicit scoping only
for the legitimately-scoped exceptions) obviates the body-seeding
hack. Preserve verbatim if the scoped-token strategy is kept;
revisit if the design-system migrates to `:root` cascade.

**Surface.** Portaled content (color pickers, format dropdowns)
rendered inside a popped Settings Sheet.

**Symptom if missing.** User pops out the Settings Sheet, navigates
to the Indicator section, opens a color picker. The picker's panel
renders as a white rectangle (light-theme shadcn defaults) instead
of the cockpit dark surface. Tokens are not inherited because the
portal target (`popout.document.body`) is not inside any cockpit
scope.

**Root cause.** The design-system scopes cockpit-specific tokens
under selectors like `.ds-sheet-v2 :where(...)` and
`[data-ds-settings] :where(...)`. Portaled content lands on
`popout.document.body` directly, so neither scope applies. The
content falls back to shadcn's light-theme defaults.

**Implementation note.** In `prepareDocument`, after the body
exists, seed it with both scoping hooks:
```ts
doc.body.classList.add('ds-sheet-v2');
doc.body.setAttribute('data-ds-settings', '');
```
These are purely scoping hooks — neither defines layout at body
level — so adding them is harmless for direct-body consumers and
fixes every downstream portal automatically.

**Files (v1).** `PopoutPortal.tsx` lines 600–615.

---

## N8. OpenFin uses `fin.Window.create` via opener-callback, not `window.open`

**Classification.** Architectural decision. Not a fix at all — it
is the correct way to integrate with the OpenFin workspace
platform. `window.open` lacks dock affinity, workspace-save
inclusion, IAB topic propagation, and always-on-top support.
Preserve verbatim.

**Surface.** Popout-window creation under OpenFin runtime.

**Symptom if missing.** `window.open` in OpenFin returns a window
that lacks workspace platform integration — no dock affinity, no
workspace-save inclusion, no IAB topic propagation, no
always-on-top support. User pops out a customizer; the popped
window does not save with the workspace.

**Implementation note.**

1. `PopoutPortal` accepts an optional `openWindow` callback prop
   typed as
   `(opts: { name; width; height; alwaysOnTop; frame }) => Window | Promise<Window | null> | null`.
2. The OpenFin runtime plugin (`@starui/openfin`) provides an
   `openFinWindowOpener()` factory that returns a callback
   wrapping `fin.Window.create(...)` and resolving via
   `win.getWebWindow()`.
3. Browser runtime falls back to `window.open('', name, features)`.
   `alwaysOnTop` and `frame: false` are silently discarded — the web
   platform has no equivalent.
4. **Critical:** the opener must be invoked at *call* time (each
   popout), not at module import time, so that `window.fin` is
   populated by the time the lookup runs.

**Files (v1).**
- `PopoutPortal.tsx` `openWindow` prop wiring
- `packages/shared/runtime/runtime-openfin/src/popout.ts` — opener factory
- `packages/react/widgets/markets-grid/src/SettingsSheet.tsx` — call site

---

## N9. Mount node created in `useEffect`, never `useMemo`

**Classification.** Root-cause fix. `useMemo` is the wrong tool —
side effects (`appendChild`) in the render phase are an outright
bug. `useEffect` with cleanup is the correct React pattern.
(StrictMode merely surfaces the bug; the bug exists without it.)
Preserve verbatim.

**Surface.** `PopoutPortal` initial mount under React 19 StrictMode.

**Symptom if missing.** Under OpenFin in development, the popout
opens with **no visible content** — but the React subtree is mounted
correctly. Inspecting the popout's DOM reveals two children of
`<body>`: an empty `<div data-popout-root>` of size 100% × 100vh
overlaying the actual content div below it.

**Root cause.** `useMemo` runs during the render phase, where side
effects (`appendChild`) are illegal. React 19 StrictMode
double-invokes `useMemo` in dev. The first invocation appends a
mount div and is then discarded; the second appends a second div
and is kept by React state. The first div remains physically in
the DOM (it was appended via direct API, not React-managed) and
overlays the second.

**Implementation note.** The mount node is created in a
side-effecting `useEffect` with a `useState` setter and a cleanup
that calls `node.remove()`. StrictMode's mount-unmount-mount cycle
now yields a single mount node in the final committed state, and
every mutation of `popout` triggers a clean teardown + recreate.

```ts
const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
useEffect(() => {
  if (!popout) return;
  const node = popout.document.createElement('div');
  node.setAttribute('data-popout-root', '');
  node.style.cssText = 'width:100%;height:100vh;display:flex;flex-direction:column;';
  popout.document.body.appendChild(node);
  setMountNode(node);
  return () => { node.remove(); setMountNode(null); };
}, [popout]);
```

**Files (v1).** `PopoutPortal.tsx` lines 476–529.

---

## N31. Monaco expression editor in popouts

**Classification.** Mixed — see per-sub-fix tags below. Three of
the six fixes are **root-cause** (N31.1, N31.2, N31.3) and should
be preserved verbatim. The three key-routing fixes (N31.4, N31.5,
N31.6) are a **layered workaround chain** that papers over a
single underlying issue — the host shell intercepts keys before
Monaco's hidden textarea sees them. A re-architected popout host
event model could collapse all three back into zero workarounds.
**Prioritize unrolling N31.4 → N31.5 → N31.6 in a rewrite** — they
are the clearest example in this catalogue of "fixes added on top
of each other".

**Surface.** The Monaco-backed expression editor used by Conditional
Styling, Calculated Columns, and any future expression-DSL surface,
when its host (Settings Sheet, Customizer, Formatter) is popped out
into a separate browser or OpenFin window.

**Symptom if missing.** Any one or several of:
- Suggest-widget appears on the parent window while the editor is on
  the popout — same class of bug as N1 but Monaco is not React-aware
  so `PortalContainerProvider` does not help.
- Suggest-widget appears on the popout but with completely wrong
  colors (light-theme defaults inside a dark-theme popout).
- Pressing Tab indents instead of accepting a suggestion. Arrow keys
  move the caret without navigating the open suggestion list.
- Backspace does nothing inside the popped editor.
- Escape inside an open suggestion does not dismiss it — only a
  click outside the editor does.
- Typing is intermittent: keystrokes drop ~10–20% of the time, more
  often after a focus switch between popout and parent.

**Root cause.** Monaco is a DOM-native library, not a React-aware
one. It captures `window` / `document` references at module-load
time and uses them at runtime for theme registration, overflow
widget mounting, keyboard event routing, `getComputedStyle`-based
visibility checks, and worker creation. None of that follows when
the editor's mount node is in a different document than the one
the Monaco module first ran against.

In addition, Monaco's input pipeline (hidden-textarea or the newer
EditContext API in Monaco ≥ 0.50) and its command-key routing are
both sensitive to the chain of `focusin`/`focusout` events between
the editor's container, the popout window, and the parent window.
A popped-out host shell that wraps the editor in containers using
`transform`, `position: fixed`, or `overflow: hidden` (settings
sheets do all three) intercepts key events before Monaco's hidden
textarea sees them.

**Implementation note.** Six separate fixes, all required, all
present in v1:

### N31.1 — Per-document `EditorDomContext`

**Class: Root-cause fix.** Deriving the document from the
container's `ownerDocument` is the correct way to host any
DOM-native library in a multi-window app. Preserve verbatim.

Derive the editor's `{ document, window }` pair from
`hostRef.current.ownerDocument`, never from the lexical `window` /
`document`. Pass this `document` reference everywhere Monaco needs a
DOM target: theme registration, overflow host creation,
`getComputedStyle` calls, placeholder injection.

```ts
export function getElementDomContext(element: HTMLElement | null) {
  if (!element) return null;
  const doc = element.ownerDocument;
  return { document: doc, window: doc.defaultView ?? window };
}
```

### N31.2 — Per-document overflow widget host with `WeakMap` caching

**Class: Root-cause fix.** Monaco's `overflowWidgetsDomNode` option
exists precisely for this case. The `WeakMap` keyed by document is
the correct caching strategy for per-window hosts. Preserve verbatim.

Monaco's suggest-widget, parameter-hints widget, and hover popovers
escape the editor's `overflow: hidden` parent by mounting into the
document's `<body>`. By default they target the document where
Monaco was first initialized — the parent window. The fix:

1. Build a per-document overflow host element, classed
   `monaco-editor monaco-editor-overflow-widgets-host` (the
   `monaco-editor` className is **mandatory** — Monaco's widget CSS
   is scoped under it; without it the suggest-widget renders
   unstyled).
2. Cache it in a `WeakMap<Document, HTMLDivElement>` keyed by
   document, so the popout gets its own host and the parent keeps
   its own. The `WeakMap` lets browser GC reclaim the popout's host
   when its document is destroyed.
3. Pass `overflowWidgetsDomNode: getMonacoOverflowHost(doc)` and
   `fixedOverflowWidgets: true` in the editor options.
4. Track theme on the host element itself
   (`host.classList.add('vs-dark' | 'vs')`) so the popover's
   inherited theme tokens match the editor's.

### N31.3 — Document-targeted theme + styles

**Class: Root-cause fix.** Reading theme attributes and injecting
styles into the editor's owning document is correct. Preserve
verbatim.

- `theme: getExpressionTheme(doc)` reads `data-theme` from the
  editor's document, not the parent.
- Inject a per-document `<style id="ds-expression-editor-monaco-style">`
  block that binds Monaco widget elements to design-system tokens:
  ```css
  .monaco-editor .suggest-widget,
  .monaco-editor .parameter-hints-widget,
  .monaco-editor .monaco-hover {
    background: var(--ds-surface-primary) !important;
    border: 1px solid var(--ds-border-primary) !important;
    color: var(--ds-text-primary) !important;
    box-shadow: var(--ds-elevation-overlay) !important;
  }
  ```
  Idempotent via `doc.getElementById(styleId)` check — safe to call
  every editor mount.
- Same pattern for the placeholder text style
  (`ensurePlaceholderStyle(doc)`).

The stylesheet-clone path in N4 picks up Monaco's runtime-emitted
`<style>` tags from the parent (Monaco's CSS is injected into
`document.head` on module load). The per-document `<style>` blocks
above are the ds-token bindings that aren't in Monaco's bundle.

### N31.4 — Popout-aware key bridges via `editor.addCommand`

**Class: Workaround.** Root cause is host-shell key-event
swallowing in popped windows and transform-using containers
before keys reach Monaco's hidden textarea. The bridges are a
backup channel that uses Monaco's command system instead of the
input pipeline. **Investigate the actual key-routing path in a
rewrite before preserving these bridges** — a popout host that
correctly forwards `keydown` to the editor obviates all 13
re-bindings.

Re-bind every interactive chord through `editor.addCommand` so the
key reaches Monaco's command system even when the popped host shell
swallows it before the hidden textarea sees it:

- `Tab` → `acceptSelectedSuggestion` if suggest is open, else `tab`
- `Shift+Tab` → `outdent`
- `Ctrl+Space` → `editor.action.triggerSuggest`
- `↓` / `↑` / `Home` / `End` → list-navigation when suggest is open,
  else cursor movement
- `Shift+arrow` → selection variants (same conditional)
- `Backspace` / `Delete` → model-level delete via
  `deleteFromEditor(monaco, editor, 'backward' | 'forward')`

Visibility of the suggest list is checked with
`hasVisibleSuggestion(doc)` which uses `doc.defaultView.getComputedStyle`
— **not** the lexical `window.getComputedStyle`, which would query
the parent's document.

### N31.5 — Escape-to-close-suggest gated on `hostWin.opener`

**Class: Layered workaround.** Sits on top of N31.4 — required
*because* the key-bridge approach doesn't naturally cover Escape
(rebinding it unconditionally would conflict with shell-level
Escape handlers). The popout-detection gate is itself a
workaround within a workaround. **If N31.4 is unrolled, N31.5
unrolls with it.** Until then, preserve verbatim.

`Escape` cannot be re-bound unconditionally because in the main
window, Monaco's stock Escape handling correctly dismisses the
suggest widget AND the parent shell uses Escape to close dialogs.
In the popout, Monaco's stock Escape doesn't reach the suggest-
widget close handler (same key-routing pathology as N31.4), so the
suggest list stays open forever.

The fix is to gate the Escape rebind on popout detection:
```ts
const hostWin = editor.getDomNode()?.ownerDocument?.defaultView ?? window;
const auxiliaryPopout = hostWin.opener != null && hostWin.opener !== hostWin;
if (auxiliaryPopout) {
  editor.addCommand(monaco.KeyCode.Escape, () => {
    if (suggestOpen()) trig('hideSuggestWidget');
  });
}
```

`window.opener` is the standard way to detect a `window.open`-created
popup. `hostWin.opener !== hostWin` defends against a same-window
self-reference. The check happens at editor-create time; if the
user pops back in, the editor is fully re-created (the React tree
remounts in the parent), so the binding goes away naturally.

### N31.6 — Force the legacy hidden-textarea input path

**Class: Time-bombed workaround.** Same root cause as N31.4 —
host-shell key-event swallowing — manifesting on a different
Monaco code path (EditContext vs textarea). Monaco will eventually
deprecate the legacy input path; when this option stops being
honored, the keystroke-drop bug must be solved at the actual root
cause, not patched. The source comment in `editorOptions.ts`
references this entry by number to ensure a future Monaco upgrade
triggers a re-investigation rather than a silent regression.
**If N31.4 is unrolled, N31.6 unrolls with it.**

Monaco ≥ 0.50 defaults to the new EditContext API for input. In our
host shells (settings sheet, popped-out windows, transform-using
containers) that path drops keystrokes ~10–20% of the time. The
workaround is to opt out per-editor:

```ts
editContext: false
```

This forces Monaco back to the legacy `.inputarea` (hidden textarea)
input path, which routes through the standard
`keydown`/`keypress`/`input` events that the key bridges in N31.4
hook into. The trade-off is loss of IME composition niceties that
EditContext brings — acceptable for the expression DSL which is
ASCII-only.

### Composition

All six fixes layer on the existing PopoutPortal infrastructure
from N1–N9: the popout is created, stylesheets are cloned, the
React subtree mounts inside the popout's document, the shadcn
primitives get the right portal target, and Monaco picks up the
right document via `ownerDocument`. Without **any one** of N31.1
through N31.6, the symptom returns. They are not orthogonal — they
are the cumulative result of six separate bug-hunts.

**Files (v1).**
- `packages/react/widgets/grid-react/src/ui/ExpressionEditor/editorDom.ts` — N31.1, N31.2, N31.3 plumbing
- `packages/react/widgets/grid-react/src/ui/ExpressionEditor/editorOptions.ts` — N31.2 (`overflowWidgetsDomNode`, `fixedOverflowWidgets`), N31.6 (`editContext: false`)
- `packages/react/widgets/grid-react/src/ui/ExpressionEditor/expressionEditorKeyBridges.ts` — N31.4 + N31.5
- `packages/react/widgets/grid-react/src/ui/ExpressionEditor/ExpressionEditorInner.tsx` — orchestration: `getElementDomContext(hostRef.current)` and threading the document through
- `packages/react/widgets/grid-react/src/ui/ExpressionEditor/monacoEnvironment.ts` — Monaco worker stub (DSL has no TS/CSS/HTML worker needs; a no-op worker satisfies Monaco's plumbing)
- `packages/react/widgets/grid-react/src/ui/ExpressionEditor/expressionEditorDeletion.ts` — model-level Backspace/Delete impl referenced by N31.4

**Screenshots.**
- `visual-reference/react/dark/expression-editor/popped-out-with-suggest.png`
- `visual-reference/react/dark/expression-editor/popped-out-with-help-overlay.png`
- `visual-reference/popout-broken/monaco-suggest-on-parent.png`
- `visual-reference/popout-broken/monaco-suggest-unstyled.png`

**Rewrite checklist for the Monaco expression editor.**

A rewrite passes Monaco-popout parity when each of these symptoms
fails to reproduce in the rewritten popout:

- [ ] Suggest-widget renders inside the popout window, themed
      against design-system tokens (`var(--ds-surface-primary)` /
      `var(--ds-text-primary)`).
- [ ] Tab accepts the highlighted suggestion when the list is open.
- [ ] ↑/↓ arrows navigate the suggestion list when open, else move
      the caret.
- [ ] Backspace and Delete remove characters from the model.
- [ ] Escape dismisses the suggestion list (popout only).
- [ ] No keystrokes are dropped during sustained typing or
      after focus switch between popout and parent.
- [ ] Help overlay (Ctrl-/) opens inside the popout, not the
      parent.

---

## N32. Conditional-styling expression scope — prototype-chain diff trick

**Classification.** Root-cause fix. Genuinely the right design —
not a workaround. Preserve verbatim.

**Surface.** The evaluation scope passed to the expression engine
inside conditional-styling rule evaluation. Specifically the object
returned by `buildColumnsContextFromDiffs(data, rowDiffs)` and the
`{ x, value, data, columns }` shape passed to
`engine.parseAndEvaluate(rule.expression, …)`.

**Symptom if missing.** Three flavours of regression, all subtle:

- A rule `[trade.price.last] > 100` evaluates `undefined` even when
  `data.trade.price.last === 105`, because the scope's
  `columns.trade.price.last` lookup misses and the engine has no
  fallback path.
- A rule `[trade.price.old] > [trade.price.new]` evaluates against
  the live value for both sides (always equal, always false),
  because the engine dot-walks the suffix as if it were a literal
  data path. Cells never flash on tick.
- A rule referencing a field that happens to be literally named
  `"x.y"` on the row (some upstream feeds emit dot-containing keys)
  reads the wrong value — either undefined from a missing nested
  walk, or the wrong nested value from a coincidental traversal.

**Root cause.** The expression engine resolves `[a.b.c]` references
by reading properties off the supplied scope. There are three
classes of reference that must all resolve correctly:

1. **Live nested access** — `[trade.price.last]` reads the current
   value at `data.trade.price.last`.
2. **Old/new sibling access** — `[trade.price.last.old]` and
   `[trade.price.last.new]` read prior/current snapshots from the
   diff cache.
3. **Literal flat-key access** — `["weird.key"]` on a row shaped
   `{ "weird.key": 1, normal: {…} }` reads the literal property.

The naive approach — pass `data` as the scope and have the engine
do dot-walks — handles (1) but breaks (2) and (3). A more elaborate
approach — give the engine a custom resolver that knows about
diffs and literals — solves correctness but pushes complexity into
the engine and couples it to the conditional-styling runtime.

**Implementation note.** The elegant solution v1 lands on is a
**prototype-chain scope** built per rule evaluation:

```ts
function buildColumnsContextFromDiffs(
  data: Record<string, unknown>,
  rowDiffs: Map<string, { oldValue: unknown; newValue: unknown }> | undefined,
): Record<string, unknown> {
  const out = Object.create(data) as Record<string, unknown>;
  if (!rowDiffs || rowDiffs.size === 0) return out;
  for (const [colId, diff] of rowDiffs) {
    out[`${colId}.old`] = diff.oldValue;   // OWN property — literal string key
    out[`${colId}.new`] = diff.newValue;   // OWN property — literal string key
  }
  return out;
}
```

Why this is load-bearing:

1. **`Object.create(data)`** makes `data` the prototype of the
   returned object. Any property read that misses on `out` falls
   through to `data` via the prototype chain. So
   `out.trade.price.last` works without ceremony.
2. **Own-property writes for `${colId}.old` / `${colId}.new`** use
   the **literal string** `"trade.price.last.old"` as the property
   name. The dot is part of the key, not a separator. When the
   engine reads the bracket reference `[trade.price.last.old]` as a
   single literal property name lookup, it hits the own property
   first and gets the diff value. **No engine-level knowledge of
   suffix semantics required.**
3. The same lookup pattern handles literal flat keys — if upstream
   sends `{ "weird.key": 1 }`, that property exists literally on
   `data` and is reachable via the prototype chain with the same
   single-property-read approach.

The engine's reference resolution is a one-liner conceptually:

```ts
function resolveRef(scope: unknown, refPath: string): unknown {
  // Step 1: literal property lookup (catches own-property writes
  // from buildColumnsContextFromDiffs AND literal flat keys on data).
  if (scope && typeof scope === 'object') {
    const literal = (scope as Record<string, unknown>)[refPath];
    if (literal !== undefined) return literal;
  }
  // Step 2: dot-walk fallback for nested live access.
  return getPathAccessor(refPath)(scope);
}
```

The two-step resolve mirrors what `getValueByPath` does at the data
level (§2.5), one layer up — and that symmetry is intentional.

**Why this is a root-cause fix and not a workaround.** It is the
correct interface between three independent concerns: the expression
engine wants to do one property read per reference; the diff cache
wants to expose old/new without re-introducing dot-path semantics in
the engine; the data layer wants to keep its native shape. The
prototype-chain scope is the contract that lets all three keep
their invariants. A rewrite that "simplifies" this by, e.g.,
flattening the diff cache into `data` directly would mutate the
live row in place; or by giving the engine a custom resolver would
couple engine to runtime. Both are worse.

**Performance.** `Object.create(data)` is one allocation per row
per rule evaluation. The own-property writes are O(changed-keys),
not O(total-keys). The trigger pre-filter
(§4 of conditional-styling design) ensures untouched rows skip
evaluation entirely so this allocation only happens on rows that
actually need re-painting.

**Files (v1).**
- `packages/react/widgets/grid-react/src/modules/conditional-styling/index.ts`
  — `buildColumnsContextFromDiffs` at the bottom; usage at the
  `engine.parseAndEvaluate` call sites inside the modelUpdated
  handler.
- `packages/shared/foundation/shared-types/src/dataProvider.ts`
  — `getValueByPath` with the literal-flat-key priority.
- `docs/plans/nested-fields-design.md` — the full design that the
  expression engine §10.3 of PUBLIC_API_SPEC.md is based on.

**Cross-references.**
- `PUBLIC_API_SPEC.md` §2.5 — `nestedField()` and the shared
  accessor cache.
- `PUBLIC_API_SPEC.md` §10.3 — bracket-reference syntax + `prev()`.
- `PUBLIC_API_SPEC.md` §15 #11 — non-negotiable that bare
  dot-fields are a contract violation.

---

## N33. Diagnostic logging — `createLogger("starui:<pkg>")` is the only sanctioned path

**Classification.** Workaround-class debt. The contract
(`createLogger` with `starui:<pkg>` prefix, three severity levels)
is correct and stable; v1's actual usage is the workaround layer.
**Re-investigate at rewrite time** — adopt the logger across every
package, retire the 302 bare `console.*` sites mechanically. The
rewrite settles this; v1 stays as-is.

**Surface.** Every package that emits diagnostic output —
effectively the whole codebase.

**Symptom if missing.** Three symptoms, all observable today in v1:

- **No common prefix.** A trader filing a bug attaches a devtools
  log that mixes `[PopoutPortal]`, `[useFdc3Channel]`,
  `[markets-grid]`, `[v2/markets-grid]`, `[v2/grid]`, `[v2/hub]`,
  `[Dock3 theme]`, `[refresh]`, `[0]` (yes, literally `[0]`),
  `[hardReloadDock]`, and a dozen others. Filtering to one package
  means filtering each prefix variant separately.
- **Inconsistent severity.** Some recoverable conditions log at
  `console.error`, some user-visible errors log at `console.warn`,
  some "this happened" events log at `console.log` with no
  level distinction. Devtools severity filters become useless.
- **No silencing path.** `console.info` chatter cannot be globally
  muted in production. Operators ship with verbose logging or
  per-call comment-outs. Neither is sustainable.

**Root cause.** v1 was grown incrementally; each module's author
chose a prefix that made sense to them at the time, and bare
`console.*` is the path of least resistance when a contract isn't
codified. 302 call sites accumulated before the contract existed.

**Implementation note.** The contract has three parts, all
documented in `PUBLIC_API_SPEC.md` §1.3:

1. **`createLogger(prefix: string): Logger`** — one logger per
   package, obtained once at module scope (not per call site). The
   v2 implementation in `@starui-v2/app/log` is the reference; a
   rewrite implements the same interface in `@starui/shared` or
   equivalent foundation leaf so every package can import it
   without cross-bucket dependency hazards.

2. **Prefix format `starui:<pkg-short>`** — per the table in §1.3.
   Devtools filter on `starui:` shows everything; `starui:grid`
   narrows to one package. The colon is intentional (matches the
   convention used by `localStorage` keys and other namespaced
   string identifiers in the platform).

3. **Three severity levels — `info` / `warn` / `error`.** No
   `debug` or `trace` in the public interface; deep tracing uses a
   per-feature opt-in flag on `globalThis` (e.g.
   `globalThis.__CS_TIMED_TRACE__ = true`) plus a local helper that
   guards on the flag.

**Enforcement.** The `@starui/eslint-plugin` package's
`no-bare-console` rule bans direct `console.*` calls outside test
files, CLI scripts, and the logger module itself. The rule plus
§15 #12 close the consistency gap end-to-end:

- Spec language makes drift a contract violation reviewers can
  flag (§15 #12).
- Lint rule catches drift at PR time (`@starui/no-bare-console`).
- Adoption is the rewrite's mechanical step — once a package
  enables the rule, every offending call is forced through the
  logger or carved out by an explicit `allowFiles` entry.

**Migration.** Not in scope for v1. The 302 sites stay as they are.
A codemod that converts patterns like
`console.warn('[PopoutPortal] x:', err)` to
`log.warn('x', err)` (after seeding `const log = createLogger("starui:grid-react");`
at the top of the file) is mechanical and lives in the rewrite plan.

**Files (v2 reference).**
- `packages/app/src/log.ts` (v2 path:
  `/Users/develop/staruiv2/packages/app/src/log.ts`)
  — the reference implementation. SSR-safe `typeof console` guard,
  try/catch around every emit, optional silencing.

**Cross-references.**
- `PUBLIC_API_SPEC.md` §1.3 — the contract, prefix table,
  severity guidance, non-negotiable.
- `PUBLIC_API_SPEC.md` §15 #12 — non-negotiable that bare
  `console.*` is a contract violation.
- `packages/tooling/eslint-plugin/src/rules/no-bare-console.ts` —
  the lint rule.
- `docs/plans/lint-config-plan.md` — adoption rollout.

---

## N34. Identity-trust boundary — server-side dev/prod gate is the only correct place

**Classification.** Architectural decision. Not a fix — it is the
correct way to gate "trust client-supplied userId" in a system
that supports both convenient development and shippable
production. Preserve verbatim.

**Surface.** The boundary between `<StarUIApp>` bootstrap (which
reads `userId` from manifest / config-file / explicit prop) and
the StarUI Config Server (which decides whether to trust that
value). The boundary's *location* is the load-bearing decision.

**Symptom if missing.** A production deployment that accidentally
ships with "trust client-supplied userId" active is an
**unconditional privilege-escalation hole**. Anyone with manifest-
edit access to a deployed app — or anyone who can open devtools
and modify the in-memory config — can call any ConfigService
endpoint as any user, read any user's profile, modify any user's
saved grids and dock layouts, exfiltrate audit data, etc. No
client-side mitigation closes this; the moment a client decides
"trust this userId without a token" runs in production, the
deployment is compromised.

The footgun is unavoidable in design: the *whole point* of the
manifest/config-file `userId` is to skip authentication during
development. That convenience MUST exist somewhere. If it lives
on the client (a `process.env.NODE_ENV === "production"` check in
the browser, or a "is this build production" flag in the React
tree), it's defeated by:

- Misconfigured prod builds shipping `NODE_ENV=development` —
  caught only if you happen to look.
- DevTools modification of the in-memory flag — trivial.
- A second deployment using the same JavaScript bundle that
  inadvertently keeps the dev path active.

None of those failure modes are exotic. All of them ship.

**Root cause.** The dev-vs-prod distinction is a *deployment*
property, not a *runtime* property. It belongs on the **server**,
which is deployed once per environment and whose mode is set by
the operator (not the application).

**Implementation note.** The StarUI Config Server runs in
**exactly one** of two modes, fixed at server startup:

| Mode | Auth behaviour | Client-supplied userId | Use case |
|---|---|---|---|
| `dev`  | Accepts requests without `Authorization` header | Used as authoritative | Local development against `npx @starui/config-server` |
| `prod` | Requires valid JWT; derives `userId` from `sub` claim | **Ignored** | Every non-development environment |

Hard constraints:

1. The mode is a **server-startup flag** (`STARUI_CONFIG_MODE=dev` /
   `=prod`, or `--mode=dev` / `--mode=prod` CLI arg). It is **not** a
   configurable property per-request, per-tenant, or per-user.
2. The prod binary refuses to start in `dev` mode without an
   explicit `--i-know-this-is-dev` opt-in flag. Operators
   accidentally inverting the mode flag get a startup error, not a
   silent privilege-escalation hole.
3. The dev binary may be the same artifact as the prod binary or a
   separate one — implementation choice. Either way, the mode flag
   is checked once at boot and cached in module-scope state. No
   request handler may re-read it.
4. **Client-side code is dev/prod-agnostic.** The browser bundle
   always sends `Authorization: Bearer <token>` when a token is
   present, and always sends the `userId` it resolved from the
   bootstrap chain. The server decides which to trust.

The `<StarUIApp>` bootstrap chain in `PUBLIC_API_SPEC.md` §1.4 is
the *client-side* mechanism for supplying a userId when no IdP
handshake has happened. The chain itself is dev/prod-agnostic. The
production safety lives in the server's `prod` mode ignoring the
chain's output and trusting only the JWT.

**Why this is Architectural and not a Workaround.** A workaround
papers over a problem whose root cause is elsewhere; a root-cause
fix solves a real problem at the right layer. A client-side
"trust gate" *would* be a workaround — it tries to solve a
deployment problem at the wrong layer, and breaks in predictable
ways. The server-side mode flag is the right layer because mode
**is** a deployment property. There is no simpler design that
preserves the dev convenience without the privilege-escalation
risk.

**Files (v2 reference).**
- The server lives in the (in-progress) repurpose of
  `/Users/develop/wfh/configservice-old` — see Commit 3 of the
  current spec sequence for the §4 rewrite.
- Client-side bootstrap chain in
  `/Users/develop/staruiv2/packages/app/src/StarUIApp.tsx` (v2
  reference impl).

**Cross-references.**
- `PUBLIC_API_SPEC.md` §1.4 — the four-stage bootstrap chain.
- `PUBLIC_API_SPEC.md` §15 #13 — non-negotiable: no hardcoded
  user id; hard dev/prod identity-trust boundary; prod binary
  startup guard.
- `PUBLIC_API_SPEC.md` §4 (Commit 3) — the StarUI Config Server's
  dev/prod mode flag.

---

# To document next

Entries N10–N30 are stubs (N31, N32, N33, and N34 were added as
full entries as those concerns surfaced — Monaco-in-popout, the
prototype-chain diff scope, the logging contract, and the
identity-trust boundary respectively). Adding each remaining stub
requires:

1. Reading the v1 source for the relevant surface.
2. Writing the entry following the conventions above.
3. Capturing the "correct" and "broken" screenshots into
   `visual-reference/`.
4. Cross-referencing the entry number into `PUBLIC_API_SPEC.md` §17
   if the nuance crosses an API boundary.

The priority order for capturing the remaining stubs is roughly:

1. **N13 AG-Grid theme switch atomicity** + **N28 theme switch
   flash** — these are visually loud; trader complaints would be
   immediate.
2. **N11 Formatter dialog** + **N10 Grid Customizer** — the user
   explicitly called these out as popout cases with non-obvious
   tweaks.
3. **N12 Profile Manager** + **N15 Cell context menu** + **N19
   Inline edit** — daily-use interactions; muscle memory failures
   would be loud.
4. **N20 Toasts** + **N21 Focus management** + **N22 Tooltips** —
   accessibility / polish concerns; quiet but important.
5. Everything else, opportunistically as the rewrite touches each
   surface.

---

*Authored 2026-05-18. Living document — every UX-affecting fix,
tweak, or workaround discovered during the rewrite must add an
entry here in the same PR.*
