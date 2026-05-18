---
title: "Web workspace management — design"
subtitle: "Bringing OpenFin-parity workspace management to the browser via @widgetstools/react-dock-manager"
date: "2026-05-19"
status: "Decisions locked; API surface design pending"
---

# Goals

Three goals, taken in priority order:

1. **OpenFin-parity workspace experience in the browser.** Users
   running StarUI as a web app get the same dockable-panels,
   save-load-switch-named-workspaces, popout-to-floating-window
   experience that OpenFin already provides.
2. **One persistence model across both runtimes.** Workspace state
   persists through the StarUI Config Server (§4.7) as
   `AppConfigRow` rows, identical to how OpenFin's workspace
   platform integrates with our persistence.
3. **Design-system-coherent.** The dock UI uses our `--sf-*` tokens
   via `createTheme`, switches palette/mode in lockstep with the
   rest of the app, and looks like part of StarUI — not a
   visually-foreign library bolted on.

# Locked decisions

These are not open questions; they're settled and documented in
`PUBLIC_API_SPEC.md` §6.6:

| Decision | Choice |
|---|---|
| **Library — React** | `@widgetstools/react-dock-manager` + `@widgetstools/dock-manager-core` |
| **Library — Angular** | `@widgetstools/angular-dock-manager` (placeholder package; same core) |
| **Persistence path** | `AppConfigRow` with `componentType: "web-workspace"` (added to `COMPONENT_TYPES` in §4.2) |
| **Theming** | `createTheme(colours)` bound to design-system `--sf-*` tokens at app boot; re-bound on palette/mode change in the same `requestAnimationFrame` that drives `SF_AG_THEME` swaps |
| **Popout surface** | dock-manager's native `popoutPanel` / `floatPanel` for the **browser** case; `PopoutPortal` (N1–N9) stays for the **OpenFin** case |

The library is already in v1's MCP scaffolder's `web-react`
template — no evaluation or selection in scope.

# What the library gives us

`@widgetstools/dock-manager-core` exposes a serializable layout
tree (`DockManagerState`), a reducer (`dockReducer`), validation
(`validateState`), import/export helpers (`serialize`,
`deserialize`, `saveToLocalStorage`, `loadFromLocalStorage`,
`exportToFile`, `importFromFile`), a typed event system, themes
(`createTheme` + built-ins), and an imperative `DockviewApi`
(addPanel, movePanel, removePanel, floatPanel, popoutPanel,
findTabGroupById, etc.).

The serializable state is the load-bearing piece for our
persistence: anything that's in `DockManagerState` round-trips
through JSON cleanly, which means the `AppConfigRow.payload` can
store it directly.

# Persistence shape

```ts
// AppConfigRow for a saved web workspace
{
  configId: "<userId>:<appId>:<workspaceId>",
  appId: "fx-blotter",
  userId: "anand.nandanwar",
  componentType: "web-workspace",
  componentSubType: "",
  displayText: "Trading floor — morning shift",
  isTemplate: false,
  payload: {
    name: "Trading floor — morning shift",
    state: DockManagerState,   // from dock-manager-core
    createdAt: 1747680000000,
    description?: "Optional notes about the workspace",
  },
  __v: 3,                       // optimistic-lock version
  createdBy: "anand.nandanwar",
  updatedBy: "anand.nandanwar",
  creationTime: 1747680000000,
  updatedTime: 1747920000000,
}
```

Workspace **switching** is just a config-read + dock-manager
state replacement:

```text
1. configClient.getConfig({ configId: targetWorkspaceId })
2. validateState(payload.state)   // dock-manager-core guard
3. setDockState(payload.state)    // dock-manager-core dispatch
4. Persist (saveWorkspace) on next debounced change tick
```

# Runtime API (placeholder in §6.6)

```ts
interface RuntimePort {
  listWorkspaces?(): Promise<readonly WorkspaceSummary[]>;
  switchWorkspace?(workspaceId: string): Promise<void>;
  saveWorkspace?(opts: { name: string; workspaceId?: string }): Promise<string>;
  deleteWorkspace?(workspaceId: string): Promise<void>;
}

interface WorkspaceSummary {
  readonly workspaceId: string;
  readonly name: string;
  readonly updatedAt: number;
}
```

Both `BrowserRuntime` and `OpenFinRuntime` implement these. The
runtime adapts to its native concept of "workspace":
- **BrowserRuntime**: `DockManagerState` via `dock-manager-core`.
- **OpenFinRuntime**: workspace platform's native pages + windows
  layout via the OpenFin workspace API.

# Theming integration

```ts
// Boot
import { createTheme } from "@widgetstools/dock-manager-core";

function buildDockTheme(): DockTheme {
  const root = getComputedStyle(document.documentElement);
  return createTheme({
    background: root.getPropertyValue("--sf-bg").trim(),
    surface:    root.getPropertyValue("--sf-bg-3").trim(),
    text:       root.getPropertyValue("--sf-t-0").trim(),
    primary:    root.getPropertyValue("--sf-primary").trim(),
    border:     root.getPropertyValue("--sf-border").trim(),
    // …per dock-manager-core's DockThemeColors contract
  });
}

// On palette/mode change, inside the SF_AG_THEME-coordinated rAF:
const dockTheme = buildDockTheme();
dockApi.setTheme(dockTheme);
```

The `--sf-*` token resolution happens via `getComputedStyle` so
the dock theme inherits the design-system swap automatically,
preventing flash (N28).

# Open API design questions

The `RuntimePort` method signatures above are locked. The
**implementation surface** — specifically the React component
shape that consumers mount — is open:

## Q1. Component shape

Two candidates:

**Option A — low-level**: expose the `react-dock-manager` `<Dockview>`
component directly. Consumers wire `addPanel` etc. through
`DockviewApi` themselves.

**Option B — `<StarUIWorkspace>` wrapper**: higher-level component
that consumes `useHost()`, hides the `DockviewApi`, exposes a
`useWorkspace()` hook for panel add/move/remove.

Recommendation: **Option B** for `@starui/react-app`'s public
surface, with `react-dock-manager`'s `<Dockview>` accessible as an
escape hatch via `@starui/react-app/dockview`. Most apps consume
the wrapper; tools that need granular control reach for the lower
level.

## Q2. Workspace switcher UX

Where does the workspace picker live? Candidates:

- **Modal dropdown in app header** — consistent with OpenFin's
  workspace switcher.
- **Sidebar list** — better when the user has many workspaces
  (>10).
- **Command palette** — power-user surface; keyboard-driven.

Recommendation: **modal dropdown + command palette**. The
dropdown is the discoverable surface; the palette is the daily
driver for power users.

## Q3. Default workspace per app

When a fresh user opens an app for the first time, what
workspace do they see?

- **Empty / blank** — user starts from nothing; first save
  creates "Untitled".
- **Manifest-seeded** — `customSettings.starui.defaultWorkspaceUrl`
  points at a JSON file that the app loads on first boot. Same
  shape as a saved AppConfigRow.payload.
- **Template-system** — admin operator publishes a "default
  workspace" AppConfigRow with `isTemplate: true`; new users get
  a copy on first boot.

Recommendation: **manifest-seeded + template fallback**. Operators
ship a sensible default in the manifest for offline-first apps;
template AppConfigRow is the dev/internal-tool path.

## Q4. localStorage interaction

`react-dock-manager` ships `loadFromLocalStorage` and
`saveToLocalStorage`. Are these used?

- **No** — config server is authoritative. localStorage is dead
  weight.
- **Yes as cache** — load from localStorage on app boot for
  instant render, then fetch from config server in parallel; if
  the server's `updatedTime` is newer, swap in. Reduces blank-
  screen time.
- **Yes as offline fallback** — only when config server is
  unreachable.

Recommendation: **yes as cache**. Trader apps optimise for
sub-100ms initial render; the cache path is the simplest way to
hit that without adding service workers. The cache is per-tab,
not shared across browsers/machines (the config server is).

## Q5. Concurrency

Two tabs open in different machines, both editing the same
workspace, both save. What happens?

The standard StarUI answer: **optimistic locking via `__v`**. The
server returns 409 on conflict; the second-saver sees a "conflict
— reload?" dialog. This is the same surface as profile-set
version conflicts.

Locked: yes, use `__v`. Open: what does the conflict dialog look
like, and does it offer a merge option? Probably not for v2 —
just reload-vs-keep-yours.

## Q6. Cross-runtime portability

Can a workspace saved in the browser version of an app be opened
in the OpenFin version of the same app, and vice versa?

The dock-manager state and the OpenFin workspace state are
**structurally different**. They can't naively round-trip. Three
options:

- **No** — workspaces are runtime-scoped. The config row's
  `componentType` becomes `web-workspace` vs `openfin-workspace`,
  never mixed.
- **Best-effort translation** — convert at load time when crossing
  runtimes, losing whatever doesn't translate.
- **Common subset** — define a runtime-agnostic
  `StarUIWorkspaceState` schema that both runtimes serialise to
  and deserialise from.

Recommendation: **runtime-scoped for v2** (option 1). Common-subset
is a future enhancement when there's user demand.

# Implementation phases

1. **Phase 1 — `<StarUIWorkspace>` skeleton**. Mount
   `react-dock-manager`'s `<Dockview>` inside a wrapper that
   reads workspace state from a hook. Hardcoded single workspace
   for the phase; no save/load/switch.
2. **Phase 2 — Persistence**. Wire `useWorkspace()` to the config
   client. Save on debounced dock-manager state changes;
   load on switch.
3. **Phase 3 — Multi-workspace API**. Implement
   `RuntimePort.listWorkspaces` / `switchWorkspace` /
   `saveWorkspace` / `deleteWorkspace` against the config
   server. Wire the switcher dropdown.
4. **Phase 4 — Theming**. Bind `createTheme` to `--sf-*` tokens;
   swap on palette/mode change inside the design-system rAF.
5. **Phase 5 — Popout integration**. Wire `popoutPanel` /
   `floatPanel` to the dock-manager. Verify the OpenFin case
   still uses `PopoutPortal` (the `isOpenFin()` branch).
6. **Phase 6 — localStorage cache**. Add the boot-time
   `loadFromLocalStorage` for fast initial render with parallel
   server fetch.

Each phase is shippable in isolation. Phases 1–3 are the MVP;
4–6 are polish.

# Cross-references

- `PUBLIC_API_SPEC.md` §6.6 — locked decisions (library,
  persistence, theming, popout split).
- `PUBLIC_API_SPEC.md` §4.2 — `WEB_WORKSPACE` componentType added
  to `COMPONENT_TYPES`.
- `PUBLIC_API_SPEC.md` §15 #18 — when this lands, all
  workspace-related calls route through the `RuntimePort`
  methods; ad-hoc paths retire.
- `./cross-component-navigation-design.md` — the launchComponent
  API's browser implementation routes panel surfaces through
  this design's `DockviewApi`.

---

*Authored 2026-05-19. Decisions section is locked; design
questions Q1–Q6 are open and answered as implementation
progresses. When Phases 1–3 complete, this file rewrites with
the open-questions section retired.*
