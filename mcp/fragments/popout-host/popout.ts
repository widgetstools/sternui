import type { RuntimePort } from "@starui/runtime-port";

export interface Open{{Name}}PopoutOptions {
  // Add any payload fields here, e.g. providerId, gridId
  [key: string]: unknown;
}

/**
 * Opens the {{Name}} popout via `runtime.openSurface`. Same call site
 * works in browser (window.open) and OpenFin (fin.Window.create).
 */
export async function open{{Name}}Popout(
  runtime: RuntimePort,
  options: Open{{Name}}PopoutOptions = {},
): Promise<void> {
  await runtime.openSurface({
    kind: "popout",
    url: "{{route}}",
    windowName: "{{Name}}Popout",
    width: {{width}},
    height: {{height}},
    customData: options,
  });
}
