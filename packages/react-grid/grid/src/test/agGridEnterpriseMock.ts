/**
 * The `ag-grid-enterprise` stub the MarketsGrid widget tests mount against.
 *
 * ## Why a mock at all
 *
 * `@starui/ssrm-grid`'s `agGrid/modules.ts` registers the whole enterprise
 * bundle at module scope, and `CustomSSRMGrid.tsx` imports it — so any test that
 * renders `MarketsGrid` drags the real 2.5 MB bundle plus
 * `ag-charts-enterprise` into jsdom. The mock exists to CUT THAT GRAPH, not
 * merely to satisfy the names, which is the thing the obvious fix gets wrong:
 * `vi.mock(..., async (importOriginal) => ({ ...await importOriginal() }))` —
 * the spelling vitest's own error message suggests — imports the real module and
 * the graph then reaches `@perspective-dev/client`'s wasm, which Vite refuses to
 * serve (`Denied ID ... perspective-js.wasm?url`). Measured, not assumed.
 *
 * ## Why a Proxy rather than a list
 *
 * Four test files each carried their own two-property stub
 * (`AllEnterpriseModule`, `ModuleRegistry`) while `modules.ts` imports
 * TWENTY-ONE names from this package. Adding `ServerSideRowModelModule` to that
 * list broke all four at COLLECTION time — 4 failed test FILES with 0 failed
 * tests, which is why the count moved with whichever files happened to import
 * it and why the failure was carried as a baseline across four sessions instead
 * of being fixed.
 *
 * A hand-maintained list would break again the next time `modules.ts` grows.
 * This answers ANY named export with an inert module object, so it cannot drift
 * — the registry is a no-op and nothing here is ever executed by the grid under
 * test, which only needs the imports to resolve.
 */
import { vi } from 'vitest';

/**
 * One inert module. `with()` returns itself because `modules.ts` composes
 * `IntegratedChartsModule.with(AgChartsEnterpriseModule)`, and a stub that
 * answered `undefined` there would fail at the call rather than at the import.
 */
const moduleStub: Record<string, unknown> = {};
moduleStub.with = () => moduleStub;
moduleStub.version = '36.0.0';

/**
 * Names that need real behaviour rather than an inert object.
 *
 * `registerModules` must be a no-op — note it is imported from
 * `ag-grid-community` in `modules.ts`, so this entry only covers the files that
 * take `ModuleRegistry` from the enterprise entry — and `setLicenseKey` must
 * swallow the key so a configured licence does not reach a real LicenseManager.
 */
const NAMED: Record<string, unknown> = {
  ModuleRegistry: { registerModules: () => {} },
  LicenseManager: { setLicenseKey: () => {}, prototype: {} },
  AllEnterpriseModule: {},
};

/**
 * Vitest reads the returned namespace's keys, so the Proxy answers `ownKeys`
 * with the names it has been asked for so far. A module namespace must also
 * report `__esModule` and must NOT look thenable, or the import is awaited as a
 * promise and resolves to undefined.
 */
export function agGridEnterpriseMock(): unknown {
  const seen = new Set<string>(Object.keys(NAMED));
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === '__esModule') return true;
        // A namespace that looks thenable is awaited and collapses to undefined.
        if (property === 'then') return undefined;
        if (typeof property !== 'string') return undefined;
        seen.add(property);
        return NAMED[property] ?? moduleStub;
      },
      has: () => true,
      ownKeys: () => [...seen],
      getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true, value: moduleStub }),
    },
  );
}

/** Keeps `vi` a used import when a consumer only needs the factory. */
export const __agGridEnterpriseMockUsesVitest = vi;
