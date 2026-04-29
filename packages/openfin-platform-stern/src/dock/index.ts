/**
 * @marketsui/openfin-platform-stern/dock
 *
 * The OpenFin Dock provider for Stern. Previously duplicated as
 * `apps/stern-reference-{react,angular}/.../openfinDock.ts` (577 LOC,
 * byte-identical). It only depends on `@openfin/workspace`,
 * `@openfin/workspace-platform`, and the rest of this shell package, so
 * it belongs here. Apps consume it as a namespace import:
 *
 *   import * as dock from '@marketsui/openfin-platform-stern/dock';
 */

export * from './openfinDock.js';
