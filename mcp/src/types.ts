export type AppKind = "web" | "openfin" | "unknown";

export interface ToolResult {
  ok: boolean;
  files: {
    written: string[];
    patched: string[];
    skipped: string[];
  };
  warnings: string[];
  errors: string[];
  nextSteps: string[];
}

export function emptyResult(): ToolResult {
  return {
    ok: true,
    files: { written: [], patched: [], skipped: [] },
    warnings: [],
    errors: [],
    nextSteps: [],
  };
}
