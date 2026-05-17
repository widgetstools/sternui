# Implemented Features

Kept in lockstep with code: every feature add / change / remove lands a
short entry here in the same change (or an immediate `docs:` follow-up).
Newest entries go at the top.

For the narrative product overview, see
[`marketsgrid-overview.md`](./marketsgrid-overview.md).
For the architectural layer model and import rules, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 2026-05-17

### perf(core): profile-switch wall-clock cut ~5× on localStorage hosts

`ProfileManager.load()` no longer calls `refresh()` at the end — load
doesn't mutate any profile row on disk, so the `listProfiles` round-trip
was pure overhead and its `await` was forcing React to flush every render
queued by `resetAll` / `deserializeAll` / `updateState({ isDirty: false })` /
`emit('profile:loaded')` under the `load()` timer. Other ProfileManager
methods that DO mutate the list (`create`, `remove`, `rename`, `clone`,
`import`, `save`) still refresh as before.

Also skips the `await this.writeSourceId(id)` boundary when no
`activeIdSource` is configured — the `async` wrapper would early-return
synchronously, but the microtask it queued was being used by React to
flush pending renders (~25ms per switch in the non-OpenFin path).

Measured on `basic-starui-app`: `ProfileManager.load()` ~500ms → **~65ms**;
click→resolved wall-clock ~550ms → **~250ms** (roughly `demo-react` parity).

Touched: [`packages/shared/core/src/profiles/ProfileManager.ts`](../packages/shared/core/src/profiles/ProfileManager.ts).
Commit: `119c71b`.

### feat(grid-react, markets-grid): streamSafeDate floating filter

New `streamSafeMultiDateColumnFilter` filter kind ships alongside the
existing text and number variants. The column-level
`StreamSafeDateFloatingFilter` smart-parses the date shapes users
actually type:

- ISO — `2025-01-15`, `2025-01`, `2025`
- US slash — `MM/DD/YYYY`; EU slash — `DD/MM/YYYY` (auto-detected when a
  part > 12, or forced by `floatingFilterComponentParams.dateLocale: 'eu'`)
- EU dot — `15.01.2025`
- Month-name — `Jan 15 2025`, `15 January 2025`, ordinal suffixes OK
- Quarter — `Q1 2025`, `2025 Q1`
- Unix epoch — 10-digit seconds, 13-digit milliseconds
- Relative — `today`, `yesterday`, `tomorrow`

Operator + range + `and`/`or` compound grammar mirrors `streamSafeNumber`
(`>2025-01-01 and <2025-06-30`, `2025-01-01 to 2025-12-31`,
`Jan 2025, Mar 2025`, etc.). Partial inputs (year / month / quarter)
auto-expand to `inRange`. AG-Grid's date filter lacks `>=` / `<=` so those
are synthesized via `inRange` with far-past / far-future sentinels.
Exposed in the formatter's filter picker as "Date" alongside Text / Number.

Touched:
- [`packages/react/widgets/grid-react/src/modules/column-customization/{state,transforms,editors/FilterEditor}.{ts,tsx}`](../packages/react/widgets/grid-react/src/modules/column-customization/)
- [`packages/react/widgets/markets-grid/src/streamSafeDateFloatingFilter.ts`](../packages/react/widgets/markets-grid/src/streamSafeDateFloatingFilter.ts) (new)
- [`packages/react/widgets/markets-grid/src/MarketsGridSurface.tsx`](../packages/react/widgets/markets-grid/src/MarketsGridSurface.tsx)
- [`packages/react/widgets/markets-grid/src/formatter/modules/ModuleEditorFilter.tsx`](../packages/react/widgets/markets-grid/src/formatter/modules/ModuleEditorFilter.tsx)

Commit: `30ddc9e`.

### feat(apps): `basic-starui-app` demo for MarketsGrid features

New focused demo at
[`apps/demo-apps/basic-starui-app/`](../apps/demo-apps/basic-starui-app/)
exercising MarketsGrid against a synthetic 180-row bond inventory:

- Local-storage bundle adapter (no ConfigService dependency)
- Three seeded layouts (`trader-console`, `risk-and-pnl`, `relative-value`)
- StatusStrip wired to `platform.events.on('profile:loaded' | 'profile:saved')`
  — no background polling, the chrome reflects layout changes only when
  something real happens
- ConfigInspector sheet that reads the bundle once on open + has a manual
  Refresh button (no interval poll while open either)
- Help sheet, theme toggle, menubar, keyboard shortcuts

Designed as a minimal showcase that stays out of MarketsGrid's way — no
auto-refreshing chrome, no work that competes with the grid for the main
thread.

Workspace plumbing:

- Root [`package.json`](../package.json) adds `apps/demo-apps/*` to the
  npm workspaces glob.
- [`scripts/propagate.mjs`](../scripts/propagate.mjs) now walks one level
  of nesting under `apps/` so grouped reference apps participate in
  `npm run propagate`.

Run with: `npm run dev:basic-starui-app`.
Commit: `34ba137`.
