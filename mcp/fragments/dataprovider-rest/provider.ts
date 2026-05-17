/**
 * REST provider config for "{{id}}".
 *
 * Use the in-app DataProvider editor to bind a MarketsGrid to this
 * provider, or call `dataServices.registerProvider(...)` directly.
 */
export const {{id}}ProviderConfig = {
  id: "{{id}}",
  transport: "rest" as const,
  url: "{{url}}",
  method: "GET" as const,
  pollIntervalMs: 5000,
  headers: {} as Record<string, string>,
};
