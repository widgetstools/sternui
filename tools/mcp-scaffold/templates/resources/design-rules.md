# StarUI design rules (scaffold enforcement)

1. Import `@starui/design-system/css` and `@starui/grid/styles.css` in globals.css
2. Boot with `applyTheme(getTheme())` before React render
3. Use Tailwind preset from `@starui/design-system/tailwind`
4. No hardcoded hex/rgb/hsl — use `var(--ds-*)` tokens
5. No native `<input>`, `<textarea>`, `<select>` — use `@starui/ui`
6. AG Grid theme from `@starui/design-system/adapters/ag-grid` only
7. Dark + light: every surface works under `[data-theme="dark"]` and `[data-theme="light"]`
