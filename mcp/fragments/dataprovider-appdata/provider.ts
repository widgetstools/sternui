/**
 * AppData provider config for "{{id}}".
 *
 * AppData providers read snapshots from the in-process AppData store
 * (populated by another provider, an import, or a saved snapshot).
 * Template variables like `{{dataSource}}.asOfDate` are resolved at
 * grid-attach time by the SharedWorker.
 */
export const {{id}}ProviderConfig = {
  id: "{{id}}",
  transport: "appdata" as const,
  dataSource: "{{dataSource}}",
  templateVariables: [
    // Add `{{ name: "asOfDate", path: "{{dataSource}}.asOfDate" }`-style
    // entries here as you wire grids that need them.
  ] as Array<{ name: string; path: string }>,
};
