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

# Index

| # | Surface | Title |
|---|---|---|
| **N1** | shadcn primitives in popouts | Portal-using shadcn primitives must target the popout window's document |
| **N2** | PopoutPortal | StrictMode-safe window registry — defer close, dedupe in-flight create |
| **N3** | PopoutPortal | Mirror `data-theme` onto popout `<html>`, NOT `<body>` |
| **N4** | PopoutPortal | Clone parent stylesheets into popout `<head>` + append reset last |
| **N5** | PopoutPortal | Auto-resize on Radix popover open via MutationObserver |
| **N6** | PopoutPortal | Close-detection grace period + `readyState === 'complete'` gate |
| **N7** | PopoutPortal | Seed popout `<body>` with `ds-sheet-v2` + `data-ds-settings` for token inheritance |
| **N8** | PopoutPortal | OpenFin uses `fin.Window.create` via opener-callback, not `window.open` |
| **N9** | PopoutPortal | Mount node created in `useEffect`, never `useMemo` |
| N10 | Grid Customizer | _TODO — popout title bar drag region, edit-commit on blur vs Enter, Escape cancels_ |
| N11 | Formatter dialog | _TODO — Excel-format token autocomplete, live preview update cadence, color-picker portal target_ |
| N12 | Profile Manager | _TODO — auto-scroll new profile into view, focus name field after Add, rename-in-place vs dialog_ |
| N13 | AG-Grid theme | _TODO — themeQuartz CSS-var rebuild on theme switch, rAF-wrapped swap to prevent flash_ |
| N14 | Workspace Setup wizard | _TODO — step-back preserves form state, Continue disabled until validated_ |
| N15 | Cell context menu | _TODO — right-click on selected vs unselected cell, copy-with-headers vs copy-cells_ |
| N16 | Settings sheet | _TODO — animation timing (entry 220ms, exit 180ms), close on outside-click vs Esc only_ |
| N17 | Column reordering | _TODO — drag handle visibility, drop indicator styling, snap-back on out-of-bounds_ |
| N18 | Drag-and-drop | _TODO — cursor change to grab/grabbing, drop-indicator z-index above sticky headers_ |
| N19 | Inline edit | _TODO — commit on Enter / Tab / blur, cancel on Esc, click-out commits not cancels_ |
| N20 | Toasts | _TODO — top-right under OS chrome offset, max-5 stacked, auto-dismiss 4s success / sticky error_ |
| N21 | Focus management | _TODO — focus returns to triggering element on dialog close, focus-trap inside modal_ |
| N22 | Tooltips | _TODO — only render on truncated text, 500ms open delay, 0ms close delay_ |
| N23 | Multi-select lists | _TODO — Shift = range, Cmd/Ctrl = toggle, plain click = replace, Esc = clear_ |
| N24 | Loading vs empty | _TODO — spinner + "Loading…" vs illustration + "No data" — never both_ |
| N25 | Validation | _TODO — on-blur for sync, debounced 300ms for async, on-submit summary for forms_ |
| N26 | Keyboard shortcuts | _TODO — Cmd/Ctrl-S save, Cmd/Ctrl-F find, Cmd/Ctrl-/ help, Esc closes top dialog_ |
| N27 | Horizontal scroll preservation | _TODO — AG-Grid scroll position preserved across profile switch_ |
| N28 | Theme switch atomicity | _TODO — no flash of unstyled grid; themed CSS-var swap inside rAF_ |
| N29 | Conditional formatting cascade | _TODO — per-cell rule priority order, tie-break by definition order_ |
| N30 | Resizable panels | _TODO — snap to default at 30px, persist size to profile, double-click handle = reset_ |
| **N31** | Monaco expression editor in popouts | Six separate fixes Monaco needs when its host is a popped-out window |

Entries N1–N9 and N31 are fully captured below. Entries N10–N30 are
stubs — they name a real, observable nuance that the rewrite must
preserve, but the full implementation note is not yet authored.
**The stubs are deliberately not empty: their existence is itself
information** — a rewrite reviewer scanning this index sees that the
formatter dialog has a non-trivial Excel-format autocomplete that
cannot be re-implemented from the spec alone.

---

# Entries

## N1. Portal-using shadcn primitives must target the popout window's document

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

# To document next

Entries N10–N30 are stubs (N31 was added as a new full entry —
Monaco-in-popout — because it surfaced as a distinct concern late).
Adding each remaining stub requires:

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
