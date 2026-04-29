/**
 * @marketsui/runtime-browser — `RuntimePort` implementation for plain-browser hosts.
 *
 * See ARCHITECTURE.md "Seam #1 — RuntimePort" and the `BrowserRuntime`
 * docstring for behavior details.
 */

export { BrowserRuntime, type BrowserRuntimeOptions } from './BrowserRuntime.js';
export { resolveBrowserIdentity, type IdentityOverrides } from './identity.js';
