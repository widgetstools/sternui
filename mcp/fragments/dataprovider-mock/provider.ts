/**
 * Mock provider config for "{{id}}".
 *
 * Generates synthetic rows in-process. Useful for prototyping a view
 * before a real backend is wired up.
 */
export const {{id}}ProviderConfig = {
  id: "{{id}}",
  transport: "mock" as const,
  rowCount: 200,
  updateIntervalMs: 1000,
  dataType: "{{dataType}}" as "positions" | "trades" | "orders",
};
