/**
 * STOMP provider config for "{{id}}".
 *
 * The bundled tools/stomp-view-server publishes synthetic fixed-income
 * snapshots over ws://localhost:{{stompPort}}. Run it via `npm run dev:stomp`.
 *
 * To bind a MarketsGrid to this provider, either:
 *   1. Use the in-app DataProvider editor and enter these connection
 *      details, OR
 *   2. Call `dataServices.registerProvider(...)` programmatically.
 */
export const {{id}}ProviderConfig = {
  id: "{{id}}",
  transport: "stomp" as const,
  url: "{{stompUrl}}",
  destination: "{{destination}}",
  reconnectDelay: 5000,
  heartbeatIncoming: 10_000,
  heartbeatOutgoing: 10_000,
};
