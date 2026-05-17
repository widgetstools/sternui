import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptArgument[];
  render: (args: Record<string, string>) => PromptMessage[];
}

export function definePrompt(def: PromptDefinition): PromptDefinition {
  return def;
}

export async function discoverPrompts(): Promise<PromptDefinition[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(here, "..", "prompts");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: PromptDefinition[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (!statSync(full).isFile()) continue;
    if (!entry.endsWith(".js")) continue;
    const mod = (await import(pathToFileURL(full).href)) as {
      default?: PromptDefinition;
    };
    if (mod.default && mod.default.name && typeof mod.default.render === "function") {
      out.push(mod.default);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Helper used by every prompt file: build a single user-role message
 * with text content. Most prompts only need one message.
 */
export function userMessage(text: string): PromptMessage {
  return { role: "user", content: { type: "text", text } };
}

/**
 * Substitute {{name}} placeholders against args. Unknown placeholders
 * stay as-is (visible signal to the user that something is missing).
 */
export function fill(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(args, k) ? args[k] : m,
  );
}
