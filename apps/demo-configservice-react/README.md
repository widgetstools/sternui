# `@marketsui/demo-configservice-react`

Integration demo for the **MarketsGrid × ConfigService** wiring shipped
in `docs/plans/MARKETS_GRID_API.md` §Storage.

Forked from `apps/demo-react`. Same three views (single grid / two-grid
dashboard / market depth), same columns, same data, same live-tick
showcase. **What's different:** profile persistence routes through
`createConfigServiceStorage(...)` instead of a direct `DexieAdapter`.

## Run

```bash
# From monorepo root
npm run dev:demo-configservice-react
# Vite at http://localhost:5191
```

Or from inside the app dir:

```bash
cd apps/demo-configservice-react
npm run dev
```

Port **5191** (5190 is owned by `demo-react`, the plain-`DexieAdapter`
sibling). Both can run side-by-side for visual comparison.

## What the demo proves

### 1. MarketsGrid consumes a `StorageAdapterFactory`

`App.tsx`:

```ts
const storage = useMemo<StorageAdapterFactory | undefined>(() => {
  if (!configManager) return undefined;
  return createConfigServiceStorage({
    configManager,
    appId: 'demo-configservice',
    userId,     // flips when the user-switcher is clicked
  });
}, [configManager, userId]);

<MarketsGrid gridId="demo-blotter-v2" storage={storage} ... />
```

MarketsGrid resolves `effectiveInstanceId = gridId` (this app is
standalone — no framework-supplied instanceId) and calls the factory.
Each grid gets its own `StorageAdapter`, but they all share the
`(appId, userId)` scope baked into the factory.

### 2. Profile data is scoped by `userId`

Two demo users in the header: **Alice** and **Bob**. Click to swap.

- Each user has their own set of profiles.
- Each user's Showcase profile is seeded independently on first view.
- Switching from Alice → Bob replaces every `<MarketsGrid>`'s profile
  list in place. Alice's bolded columns, calculated columns, colour
  rules — all gone. Bob's pristine Showcase is what he sees.
- Switch back to Alice → her work is exactly as she left it.

Under the hood: the factory's closure changes (`userId: 'alice'` →
`userId: 'bob'`). Next `listProfiles` call returns Bob's rows from
ConfigService, filtered by `userId = 'bob'` + `componentSubType =
instanceId` + `componentType = 'markets-grid-profile'`.

### 3. Profiles persist across reloads

Reload the page — whatever profile was active per-user comes back.
Dexie under the hood (this demo runs `createConfigManager({})` with no
`restUrl`, so all writes land in IndexedDB). A production app would
pass `{ restUrl, apiKey }` and the **same client code** would round-trip
via the corporate ConfigService backend, no MarketsGrid changes needed.

### 4. Admin actions slot (Tools menu)

Click the grid's **Settings** button, then the **Wrench icon** in the
settings sheet header. Dropdown shows a single entry:

> **Config Browser**
> Inspect raw ConfigService rows (stub — real browser wires in separately)

Clicking fires an alert explaining the integration point. The real
`@marketsui/config-browser` ships `createConfigBrowserAction(...)`
once committed — this demo stubs it to prove the slot works end-to-end.

### 5. Cross-grid profile isolation under ConfigService

Two-grid dashboard view (`?view=dashboard`). Two grids, two different
`gridId`s: `dashboard-rates-v2` + `dashboard-equities-v2`. Both pass
the same `storage` factory. The factory produces a distinct adapter
per `gridId` — each grid has its own profile rows in ConfigService,
but they share the `(appId, userId)` scope. Bold a column on Rates;
Equities stays untouched. Switch user; both grids replace state in
lockstep.

## Key code locations

| File | What it demonstrates |
|---|---|
| `src/App.tsx` — `useEffect` around `createConfigManager` | ConfigService bootstrap in Dexie-only dev mode |
| `src/App.tsx` — `useMemo storage = createConfigServiceStorage({...})` | The factory-per-user construction |
| `src/App.tsx` — `DEMO_USERS` array + user-switcher UI | Per-user scoping mechanism |
| `src/App.tsx` — `ensureShowcaseSeedFor(userId, storage)` | Writing directly through the factory's StorageAdapter to seed |
| `src/App.tsx` — `adminActions` array | The Tools-menu slot |
| `src/Dashboard.tsx` — `storage` prop passthrough | Cross-grid factory reuse |

## Comparison to `apps/demo-react`

| Concern | `demo-react` (port 5190) | `demo-configservice-react` (port 5191) |
|---|---|---|
| Profile storage | `new DexieAdapter()` (direct) | `createConfigServiceStorage({...})` (factory) |
| MarketsGrid prop | `storageAdapter={...}` | `storage={...}` |
| Scope | `gridId` only | `(appId, userId, instanceId)` |
| User switching | n/a | Alice / Bob tabs in the header |
| Admin actions | not shown | Tools button in settings header |
| Production path | `DexieAdapter` is dev-only | Same code hits REST ConfigService with `{ restUrl }` |

Both run simultaneously and persist to different IndexedDB databases
(`demo-react` → Grid Customizer profiles DB; this demo →
`marketsui-config` DB via ConfigManager).

## Things you can verify

- [ ] Open the app. Click grid Settings → Wrench. Tools menu shows Config Browser entry.
- [ ] Active user defaults to Alice. Showcase profile loads automatically.
- [ ] Bold the `price` column in the formatting toolbar. Save profile.
- [ ] Switch user to Bob. Alice's bold is gone. Bob sees his own fresh Showcase.
- [ ] Switch back to Alice. Bold is back.
- [ ] Reload the page. Active user persists. Alice's bold still there.
- [ ] Switch to dashboard view (`?view=dashboard`). Both grids load
      per-user profile state independently.
- [ ] Open DevTools → Application → IndexedDB → `marketsui-config` →
      `appConfig` table. See rows with `componentType:
      "markets-grid-profile"`, `configId: "demo-blotter-v2::showcase"`,
      separate rows for alice vs bob.
