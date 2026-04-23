# Plan: Angular port of MarketsUI — shell, MarketsGrid, widgets

> **Status:** draft · **Owner:** angular-port-lead · **Est:** 6-8 weeks · **Blocked by:** DATA_PLANE.md Phase 1 (data-plane stable), SHELL_AND_REGISTRY.md Phase 2 (registry schema + wrapper contract stable). Can start against frozen API spec 1 week after DATA_PLANE Phase 0 lands. · **Unblocks:** Angular teams building real apps on MarketsUI.

## 1. Scope

Port the React capabilities to Angular 21 with feature parity. Three new packages + flesh out existing `@marketsui/angular`.

| Package | Status | LOC estimate | Effort |
|---|---|---|---|
| `@marketsui/angular` | exists, ~1.5k skeletal | will grow to ~4k | fill in (1 wk) |
| `@marketsui/markets-grid-angular` | **NEW** | ~8-10k (parity with React ~10k) | 4 wk |
| `@marketsui/widgets-angular` | **NEW** | ~3k (parity with React ~3k) | 2 wk |
| `@marketsui/dock-editor-angular` | exists | minor updates | 0.5 wk |
| `@marketsui/registry-editor-angular` | exists | minor updates | 0.5 wk |

**Total: 8 weeks** assuming one full-time Angular engineer, overlapping with React HOC refactor in Phase 3.

## 2. Framework-agnostic invariants (before porting a line of code)

These must hold or the port is pointless.

1. **Zero duplication of business logic.** The module system, ProfileManager, ExpressionEngine, formatter, transform pipeline all live in `@marketsui/core` and stay React-free. Angular wraps them. If a PR adds logic to `markets-grid-angular` that isn't a thin Angular view over `core`, it's wrong.
2. **ConfigService REST contract identical.** Wire format is framework-agnostic JSON; Angular hits the same endpoints React does.
3. **Registry JSON identical.** A registry entry created by the React editor is launchable by the Angular dock, and vice versa.
4. **DataPlane protocol identical.** `DataPlaneClient` is pure TS; Angular just wraps it in a service.
5. **OpenFinHostContext shape identical.** Angular's `OpenFinHostService` implements the same interface React's context provides.
6. **Feature parity is mandatory, UX parity is aspirational.** Angular gets idiomatic Angular UX (Angular Material + custom) where it differs from shadcn; the feature set matches.

## 3. New package: `@marketsui/markets-grid-angular`

The centrepiece.

### Layout

```
packages/markets-grid-angular/
├── package.json                    ng-packagr build
├── ng-package.json
├── src/
│   ├── public-api.ts               barrel
│   ├── lib/
│   │   ├── markets-grid.component.ts           <mui-markets-grid> (standalone)
│   │   ├── markets-grid.module.ts              (compat for NgModule consumers)
│   │   ├── formatting-toolbar/
│   │   │   ├── formatting-toolbar.component.ts
│   │   │   ├── formatting-toolbar.component.html
│   │   │   └── formatting-toolbar.component.scss
│   │   ├── filters-toolbar/…
│   │   ├── settings-sheet/…
│   │   ├── profile-selector/…
│   │   ├── help-panel/…
│   │   ├── services/
│   │   │   ├── grid-platform.service.ts        wraps @marketsui/core GridPlatform
│   │   │   ├── profile-manager.service.ts      wraps core ProfileManager
│   │   │   ├── expression-engine.service.ts    wraps core ExpressionEngine
│   │   │   └── formatter.service.ts            wraps core SSF formatter
│   │   ├── directives/
│   │   │   ├── poppable.directive.ts           Angular port of core's Poppable
│   │   │   └── auto-save.directive.ts
│   │   └── tokens.ts                           DI tokens
│   └── test/                       Jest or Karma — pick Jest for parity w/ Vitest
└── tsconfig.lib.json
```

### Standalone components, signals, new control flow

Angular 21 defaults. No NgModules for new components; `@if` / `@for` / `@switch` control flow; signals for reactive state.

```typescript
// markets-grid.component.ts

import { Component, computed, input, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { GridPlatformService } from './services/grid-platform.service';
import { DATA_PLANE } from '@marketsui/angular';

@Component({
  selector: 'mui-markets-grid',
  standalone: true,
  imports: [AgGridAngular, FormattingToolbarComponent, FiltersToolbarComponent, SettingsSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mui-grid-host" [class.dark]="theme() === 'dark'">
      @if (showFormattingToolbar()) {
        <mui-formatting-toolbar [gridId]="gridId()" />
      }
      @if (showFiltersToolbar()) {
        <mui-filters-toolbar [gridId]="gridId()" />
      }
      <ag-grid-angular
        class="ag-theme-quartz"
        [rowData]="rows()"
        [columnDefs]="colDefs()"
        [gridOptions]="gridOptions()"
        (gridReady)="onGridReady($event)"
      />
      @if (settingsOpen()) { <mui-settings-sheet (close)="settingsOpen.set(false)" /> }
    </div>
  `,
  styleUrl: './markets-grid.component.scss',
})
export class MarketsGridComponent {
  // ── Inputs (signal-based) ──────────────────────────────────
  readonly gridId = input.required<string>();
  readonly dataProviderId = input<string | null>(null);
  readonly profileId = input<string | null>(null);

  // ── Injected services ──────────────────────────────────────
  private readonly platform = inject(GridPlatformService);
  private readonly dataPlane = inject(DATA_PLANE);

  // ── Reactive state ─────────────────────────────────────────
  readonly theme = computed(() => this.platform.theme());
  readonly rows = computed(() => this.dataProviderId()
    ? (this.dataPlane.value<Row[]>(this.dataProviderId()!, `${this.gridId()}.rows`) ?? signal([]))()
    : []);
  readonly colDefs = computed(() => this.platform.colDefs(this.gridId(), this.profileId()));
  readonly gridOptions = computed(() => this.platform.gridOptions(this.gridId()));
  readonly showFormattingToolbar = signal(true);
  readonly showFiltersToolbar = signal(true);
  readonly settingsOpen = signal(false);

  onGridReady(evt: GridReadyEvent) { this.platform.register(this.gridId(), evt.api); }
}
```

### The big translation tasks

| React concept | Angular translation |
|---|---|
| `useGridPlatform()` hook | `inject(GridPlatformService)` + signal accessors |
| shadcn `<Popover>` | Angular CDK Overlay + directive wrapper |
| `<Poppable>` (our own popout to OpenFin window) | `*muiPoppable` structural directive |
| `useSyncExternalStore` | signals + effect tying to external subscribe |
| React context | DI tokens |
| `useEffect` cleanup | `takeUntilDestroyed(destroyRef)` or `afterNextRender` |
| fmt toolbar state reducer | signal-store (`withState` + `withMethods` from ngrx/signals) |

**State management choice:** use `@ngrx/signals` for any store that already exists as a Zustand store in React core. Pure signals for single-component state. No RxJS `BehaviorSubject` patterns for new code — Angular 21 idiom is signals.

### AG-Grid integration

`ag-grid-angular@35.1.0` (matches the React `ag-grid-react@35.1.0` in the monorepo). Enterprise modules wired in a separate `providers: [provideAgGridEnterprise()]` factory so tree-shaking works.

## 4. New package: `@marketsui/widgets-angular`

Parity with `@marketsui/widgets-react` (blotter, chart, heatmap).

### Layout

```
packages/widgets-angular/
├── src/lib/
│   ├── blotter/
│   │   ├── blotter.component.ts         <mui-blotter>
│   │   ├── blotter-toolbar.component.ts
│   │   └── layout-selector.component.ts
│   ├── chart/
│   │   └── chart.component.ts           <mui-chart>
│   ├── heatmap/
│   │   └── heatmap.component.ts         <mui-heatmap>
│   ├── provider-editor/
│   │   ├── data-provider-editor.component.ts
│   │   └── stomp/
│   │       └── stomp-configuration-form.component.ts
│   └── services/
│       └── theme.service.ts             bridges @marketsui/design-system tokens
└── public-api.ts
```

### Notes

- Blotter reuses `<mui-markets-grid>` internally — it's a specialized preset, not a separate grid implementation.
- Chart: port using existing chart lib (likely same as React) — or use `<ag-charts-angular>` if the React side already uses AG Charts.
- Heatmap: custom SVG + signals. No Angular-specific library needed.
- `DataProviderEditor` needs parity with React's version; reuses `data-provider-editor.component.ts` fields map to the same `ProviderConfig` types from `@marketsui/shared-types`.

## 5. Wrapper layer — `@marketsui/angular` fleshed out

Matches React's `@marketsui/react` (defined in SHELL_AND_REGISTRY.md §7). The shell implements `OpenFinHostContext` via DI:

```typescript
// @marketsui/angular/src/openfin-host.service.ts  — covered in SHELL_AND_REGISTRY §7

@Injectable({ providedIn: 'root' })
export class OpenFinHostService implements OpenFinHostContext { /* … */ }
```

New in this plan: the Angular-specific bootstrap helper.

```typescript
// packages/angular/src/bootstrap.ts

export function provideMarketsUi(opts: ProvideMarketsUiOpts = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    OpenFinHostService,
    { provide: APP_INITIALIZER, multi: true,
      useFactory: (h: OpenFinHostService) => () => h.initialize(),
      deps: [OpenFinHostService] },
    { provide: DATA_PLANE, useFactory: () => connect(opts.workerUrl ?? defaultWorkerUrl()) },
    { provide: CONFIG_SERVICE, useFactory: (h: OpenFinHostService) => new ConfigServiceClient(h.configServiceUrl), deps: [OpenFinHostService] },
    { provide: IAB_SERVICE, useClass: OpenFinIabService },
    { provide: LINKING_SERVICE, useClass: Fdc3LinkingService },
    provideHttpClient(),
    ...(opts.providers ?? []),
  ]);
}
```

App code becomes one line:

```typescript
// apps/demo-angular/src/app/app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [provideMarketsUi()],
};
```

## 6. Dock editor / Registry editor Angular — minor updates

These packages exist as skeletons. Updates needed from SHELL_AND_REGISTRY.md §5:

- New form sections (source / lifecycle / security / data plane)
- Live-instance banner
- Deletion gate with soft-delete + audit

Effort: ~3 days each. Shared form logic via `@marketsui/widget-sdk` zod schema = validation is framework-agnostic.

## 7. Testing strategy

**Unit tests:** Jest (matches Vitest mental model; faster than Karma). Jest config shipped via `jest.preset.cjs` shared across all Angular packages. Target:

- `markets-grid-angular`: 80%+ coverage
- `widgets-angular`: 70%+
- `angular` (shell): 60%+

**E2E:** Playwright against `apps/demo-angular`. **Port a subset of the React e2e suite** to Angular — not all 214, but the ~50 that cover settings / profiles / formatter / filters / two-grid isolation. These are the structurally-important ones; template-type failures (see E2E_STATUS §1) aren't worth porting until the React side is fixed.

**Cross-framework parity test:** one scenario runs identical user flows in demo-react + demo-angular, asserts both hit the same ConfigService state, both render the same data from the same DataPlane. Harness lives in `e2e/parity/`.

## 8. Per-week plan

**Week 1 — shell + DI + scaffold demo-angular**
- Fill in `@marketsui/angular/src/openfin-host.service.ts`
- `provideMarketsUi()` factory
- DI tokens (DATA_PLANE, CONFIG_SERVICE, IAB_SERVICE, LINKING_SERVICE)
- `apps/demo-angular/src/app/app.config.ts` uses `provideMarketsUi()`
- Hello-world mount with launch env read from `fin.me.getOptions()`
- **Gate:** demo-angular boots, shows `appId` / `instanceId`, theme toggle works

**Week 2 — services from core**
- `GridPlatformService` wrapping core's `GridPlatform`
- `ProfileManagerService` wrapping core's `ProfileManager`
- `ExpressionEngineService` wrapping core's engine (already pure TS)
- `FormatterService` wrapping SSF adapter
- Unit tests for each
- **Gate:** services load, ExpressionEngine evaluates `1+1` through an Angular component

**Week 3 — MarketsGrid shell**
- `<mui-markets-grid>` + AG-Grid integration
- Theme + colDef + rowData wiring
- `mui-formatting-toolbar` + `mui-filters-toolbar` skeletons (no interactions yet)
- **Gate:** demo-angular renders an AG-Grid with sample data through MarketsGrid

**Week 4 — FormattingToolbar + SettingsSheet**
- Port FormattingToolbar modules (01 palette / 02 typography / 03 alignment / 04 layout / 05 library)
- Port SettingsSheet shell + dropdown nav
- Port panel bodies: general-settings + column-customization first (most-used)
- **Gate:** user can apply bold + background color via the Angular FormattingToolbar; value persists

**Week 5 — remaining modules + DataPlane integration**
- Port remaining SettingsSheet panels (calculated-columns, column-groups, conditional-styling, saved-filters, toolbar-visibility, grid-state)
- Wire `dataProviderId` input → `DataPlaneService.value()` → grid rowData
- ProfileManager: save/load/switch
- **Gate:** subscribing to a STOMP topic in demo-angular shows the same rows as demo-react on the same topic

**Week 6 — Poppable + polish**
- Port `Poppable` to Angular (`*muiPoppable` structural directive)
- Two-grid dashboard scenario in demo-angular
- Cross-framework parity test harness (e2e/parity/)
- Fix bugs surfaced by scenarios
- **Gate:** parity test passes for profile lifecycle + formatting basics

**Week 7 — widgets-angular**
- `<mui-blotter>` (uses `<mui-markets-grid>` internally)
- `<mui-chart>` + `<mui-heatmap>`
- DataProviderEditor component + STOMP form
- **Gate:** blotter widget launches from dock in demo-angular, subscribes to DataPlane, renders

**Week 8 — registry + dock + final polish**
- Update registry-editor-angular with new form sections (from SHELL_AND_REGISTRY §5)
- Update dock-editor-angular routing / live-instance banner
- Port ~50 e2e specs to Angular variants
- Sign-off on parity test scenarios

## 9. Blockers + mitigations

| Blocker | Mitigation |
|---|---|
| Data plane not stable at start | Freeze `DataPlaneClient` API at end of DATA_PLANE Week 1. Angular port starts Week 2 against that frozen interface. Data plane impl can continue to evolve below the API. |
| React HOC refactor incomplete | Not a hard blocker. Angular port doesn't need the HOC; it needs the same *shape* of MarketsGrid. If React changes surfaces mid-port, re-sync at week 4 boundary. |
| AG-Grid Angular version mismatch | Verified: `ag-grid-angular@35.1.0` exists and matches `ag-grid-react@35.1.0`. Pin in DEPS_STANDARD.md update. |
| Zone.js vs zoneless | Ship with zones for simplicity. Zoneless migration is a follow-up once standalone-component-only is proven. |
| Jest + Angular 21 incompatibility | Angular's `@angular/build:jest` builder in 18+ works. Smoke test in Week 1. If broken, fall back to `jest-preset-angular@14`. |
| Bundled `lucide-react` tgz has no Angular equivalent | Use `@fortawesome/angular-fontawesome` per `~/.claude/plans/twinkly-floating-trinket.md`. Icons differ visually; map in `@marketsui/icons-svg`. |

## 10. Non-goals

- **No cross-framework component host.** A React component does not render inside an Angular app or vice versa. Each framework's shell hosts its own widgets. (Both speak the same DataPlane and registry — that's where parity lives.)
- **No Ivy-era feature backfilling.** We're Angular 21; targeting standalone / signals / new control flow. No `@NgModule` on new components, no structural-directive shims, no RxJS-only stores for new code.
- **No Angular-specific extension to MarketsGrid.** If Angular needs a feature React doesn't have, add it to core (framework-agnostic) first, then wrap.
- **No Angular Material everywhere.** Use Angular CDK primitives + custom styling that matches the design-system tokens. Avoid Material Design visual language; it conflicts with the terminal aesthetic.

## 11. Dependencies added to DEPS_STANDARD.md

To lock in during Week 0:

| Package | Version | Reason |
|---|---|---|
| `@angular/core` | `21.1.0` | already standard |
| `@angular/cdk` | `21.1.0` | overlays, drag-drop |
| `ag-grid-angular` | `35.1.0` exact | parity with ag-grid-react |
| `@ngrx/signals` | `19.x` | signal-store for formatter / profile state |
| `@fortawesome/angular-fontawesome` | latest stable | icon parity per twinkly-floating-trinket plan |
| `jest` + `@angular/build:jest` | matching Angular 21 | unit tests |

All additions land in a single `DEPS_STANDARD.md` update PR before Week 1 starts.
