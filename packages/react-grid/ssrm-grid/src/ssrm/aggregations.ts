/**
 * Pure aggregation helpers — no AG Grid modules, no React, no side effects.
 *
 * Exposed as the `@wellsfargo-starui/ssrm-grid/aggregations` subpath so
 * consumers that need only these functions do not import the package barrel.
 * The barrel re-exports `SsrmGrid`, which does `import "../agGrid/modules"`
 * — a module-scope `ModuleRegistry.registerModules([...])` side effect. Pulling
 * a grid component and AG Grid Enterprise registration into scope to call
 * `foldTrafficLight` is both wasteful and, in tests, actively breaking: any
 * suite mocking `ag-grid-enterprise` has to satisfy every module the registry
 * touches, however unrelated to what it is testing.
 *
 * Keep this module free of imports that reach the component layer.
 */

export { foldTrafficLight, isTrafficLightAgg } from './trafficLightAgg.js';

export {
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from './shareOfTotal.js';
