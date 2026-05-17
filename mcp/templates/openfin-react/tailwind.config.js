/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from "@starui/design-system/tailwind";

export default {
  presets: [tailwindPreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,html}",
    // Scan every starui package's dist so JIT picks up classes that
    // ONLY appear inside those packages (RuleMetaStrip, module-panel
    // editors, SettingsPanel atoms, etc.). Without this, the Grid
    // Customizer dialog meta-strip stacks vertically instead of into
    // a 4-column row, and editor layouts collapse.
    "./node_modules/@starui/ui/dist/**/*.{js,mjs}",
    "./node_modules/@starui/markets-grid/dist/**/*.{js,mjs}",
    "./node_modules/@starui/grid-react/dist/**/*.{js,mjs}",
    "./node_modules/@starui/widgets-react/dist/**/*.{js,mjs}",
    "./node_modules/@starui/app-shell-react/dist/**/*.{js,mjs}",
    "./node_modules/@starui/config-editor-ui/dist/**/*.{js,mjs}",
    "./node_modules/@starui/core/dist/**/*.{js,mjs}",
    // @starui/config-browser and @starui/workspace-setup-react ship
    // their src/ tree (no dist emit — they're consumed as TS source).
    // Scan src/**/*.{ts,tsx} for those, not dist/**/*.{js,mjs}, or
    // every arbitrary class they use (grid-cols-[320px_1fr_360px],
    // bg-[var(--ds-surface-secondary)], etc.) gets purged and the
    // panels collapse from a 3-column grid into stacked rows with
    // unstyled inputs.
    "./node_modules/@starui/config-browser/src/**/*.{ts,tsx}",
    "./node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}",
  ],
};
