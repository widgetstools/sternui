/// <reference types="vite/client" />

// ─── Custom environment variables ───────────────────────────────────
//
// Add a typed entry here when introducing a new VITE_* variable.
// Vite only exposes vars that start with `VITE_` to client code.
//
// REST mode for `@starui/config-service-server` is no longer driven
// by a Vite env var — it lives on the OpenFin manifest's
// `customSettings.{useRest, configServiceRestUrl}` pair instead, read
// via `getConfigServiceRestUrlFromManifest()` from
// `@starui/openfin-platform/config`. See the matching JSDoc on
// `CustomSettings.useRest`.

export {};
