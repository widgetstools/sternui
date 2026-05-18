---
title: "Cross-component navigation — design slot"
subtitle: "Unified `launchComponent(spec)` API to subsume openSurface / ACTION_LAUNCH_COMPONENT / ad-hoc launches"
date: "2026-05-19"
status: "STUB — API space reserved in PUBLIC_API_SPEC.md §6.5; design pending"
---

# Why this slot exists

Today the platform has **three independent ways** to open a
registered component on a new surface:

1. `RuntimePort.openSurface(spec: SurfaceSpec)` — generic but
   surface-typed (popout / modal / inpage), not registry-aware.
2. `ACTION_LAUNCH_COMPONENT` IAB action under OpenFin — wired
   through dock buttons and registered platform actions, but only
   reachable from OpenFin custom-action contexts.
3. Per-component window creation — `<Hosted*>` wrappers, Settings
   sheet popouts, the Formatter dialog, etc. each call window-
   creation paths individually.

This works today by accident. Each path was added to solve a
specific case; together they form a maze where adding a new
component-launch case requires picking the right path from the
three, knowing which APIs work in which runtime context, and
hand-wiring the persistence + identity propagation.

The unified API `launchComponent(spec)` collapses the three into
one. The runtime decides the surface; the caller supplies the
registry id + payload.

**Status**: API space reserved in `PUBLIC_API_SPEC.md` §6.5 with a
`?`-optional method signature. Implementation deferred until this
design is finalised.

# Goals

1. **One call site shape** for "launch component X with payload P".
   No conditional on `isOpenFin()`, no separate path for popouts vs
   in-place mounts.
2. **Registry-driven surface choice.** Each component declares (in
   the `componentType: "component-registry"` row) which surfaces it
   supports and which is the default. The runtime picks the best
   one for the current context.
3. **Caller-overridable.** A `preferredSurface` field on the launch
   spec lets the caller force a surface for the rare cases where
   the registry default isn't right.
4. **Type-safe payload per component** (stretch goal). The registry
   row carries a payload schema; the launch call validates at
   runtime; ideally TypeScript verifies at compile time.

# Non-goals

- Inter-process communication beyond launch + close. The launched
  component talks to its parent via existing channels (IAB topics
  under OpenFin, BroadcastChannel in browser, postMessage for
  popouts).
- Authentication redirection on launch. Identity flows through the
  bootstrap chain (§1.4); the launched component inherits it.
- Multi-instance lifecycle management. Each `launchComponent`
  returns a `ComponentLaunchHandle`; the caller closes it when
  done. The runtime does not deduplicate launches.

# Stub interface (from §6.5)

```ts
interface RuntimePort {
  launchComponent?(spec: ComponentLaunchSpec): Promise<ComponentLaunchHandle>;
}

interface ComponentLaunchSpec {
  readonly componentId: string;
  readonly intent?: "edit" | "view" | "popout" | "modal" | "inpage";
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly preferredSurface?: "view" | "window" | "panel" | "popup";
}

interface ComponentLaunchHandle {
  readonly surfaceId: string;
  close(): Promise<void>;
}
```

The shapes above are **placeholders** — the design phase may revise
them. Consumers should not yet program against these types beyond
the optional-method guard pattern.

# Open questions

These have to be answered before implementation begins:

1. **Registry shape.** Is "the registry" a single
   `componentType: "component-registry"` row per app holding an
   array of component definitions, or one row per definition?
   Single-row is simpler; one-per is more granular for permissions
   (only owners can edit "their" components). Decision affects the
   AppConfigRow schema language in §4.2.

2. **Surface choice algorithm.** When `intent` is omitted, how does
   the runtime pick between View / Window / Panel / Popup?
   Candidate algorithm:
   - Registry row declares `supportedSurfaces: string[]` and
     `defaultSurface: string`.
   - `intent` filters `supportedSurfaces` (e.g. `"edit"` → prefer
     Window or Panel over View).
   - `preferredSurface` short-circuits the choice.
   - Runtime-specific fallback when the chosen surface isn't
     possible (browser has no `view`; uses `panel` via
     react-dock-manager).
   This needs to be sharper than "candidate algorithm" before
   implementation.

3. **Payload validation.** Strongly typed per component, or
   `unknown` with runtime-side validation? A registry-row JSON
   schema validated server-side at registration time would be the
   strongest contract; runtime-only zod-style validation is the
   pragmatic compromise.

4. **Cross-window navigation.** Can a `launchComponent` call from
   a popped-out OpenFin Window target the main provider window?
   If so, what happens to focus? What if the main window doesn't
   yet have a surface for the component (e.g. asking for a Panel
   when the main window's dock-manager hasn't loaded yet)?

5. **Browser implementation.** Does `BrowserRuntime` route
   `launchComponent` through `@widgetstools/react-dock-manager`
   (§6.6)? Likely yes. Specifics:
   - `intent: "panel"` → `DockviewApi.addPanel(...)`
   - `intent: "popout"` → `DockviewApi.popoutPanel(...)` or
     `floatPanel(...)`
   - `intent: "inpage"` → mount inline (no dock-manager)
   - `intent: "modal"` → shadcn `<Dialog>` (no dock-manager)

6. **Identity propagation.** Does the launched component inherit
   the caller's `IdentitySnapshot.instanceId`, or get a fresh one
   from the runtime? Fresh would be simpler; inherited supports
   "this view is owned by this parent" semantics that some tools
   need.

7. **Lifecycle ordering.** When the caller `close()`s the handle,
   is the close synchronous (window vanishes immediately) or
   does the launched component get a `beforeClose` hook for
   confirm-discard prompts? OpenFin's `beforeunload` already
   exists; browser popups have the same hook; panels need a
   matching API in `react-dock-manager`.

# Why not just design it now

The design is non-trivial and orthogonal to the work currently in
flight (ConfigService rewrite, design-system foundation, repository
reorganization). Locking the API space now prevents new ad-hoc
launch paths from accumulating while those higher-priority items
ship. The full design lands as a follow-up.

# Cross-references

- `PUBLIC_API_SPEC.md` §6.5 — the optional method signature.
- `PUBLIC_API_SPEC.md` §9.3 — `ACTION_LAUNCH_COMPONENT` IAB action
  that today's OpenFin shells use; will route through
  `launchComponent` once the API ships.
- `PUBLIC_API_SPEC.md` §15 #18 — future-binding constraint that
  retires ad-hoc launches when this lands.
- `./web-workspace-management-design.md` — the panel surface the
  browser implementation will target.

---

*Authored 2026-05-19. STUB. When the design is finalised, this
file rewrites to lock in the decisions and remove the open-questions
section.*
