/**
 * AG-Grid theming bridge.
 *
 * We use AG-Grid v35's Theming API (`themeQuartz.withParams(...)`) to
 * wire design-system colors into the grid without loading ag-grid's
 * legacy CSS. Every color here resolves to a `--bn-*` design-system
 * CSS variable (or a computed rgba fallback), so flipping
 * [data-theme="light"|"dark"] re-skins the grid automatically.
 */
import { themeQuartz, colorSchemeDark, colorSchemeLight } from "ag-grid-community";
import type { Theme } from "ag-grid-community";

/** Dark theme params — consume --bn-* via var() so theme flips cascade. */
const agGridThemeDark: Theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "var(--ds-surface-primary)",
  foregroundColor: "var(--ds-text-primary)",
  headerBackgroundColor: "var(--ds-surface-secondary)",
  headerTextColor: "var(--ds-text-secondary)",
  headerColumnResizeHandleColor: "var(--ds-border-secondary)",
  rowHoverColor: "var(--ds-surface-tertiary)",
  selectedRowBackgroundColor: "var(--ds-overlay-info-soft)",
  oddRowBackgroundColor: "var(--ds-surface-primary)",
  borderColor: "var(--ds-border-primary)",
  wrapperBorder: "solid 1px var(--ds-border-primary)",
  rowBorder: "solid 1px var(--ds-border-primary)",
  headerRowBorder: "solid 1px var(--ds-border-primary)",
  columnBorder: { style: "solid", width: 1, color: "var(--ds-border-primary)" },
  accentColor: "var(--ds-accent-info)",
  inputBackgroundColor: "var(--ds-surface-secondary)",
  inputBorder: "solid 1px var(--ds-border-primary)",
  inputTextColor: "var(--ds-text-primary)",
  inputFocusBorder: "solid 1px var(--ds-accent-info)",
  fontFamily: "var(--ds-font-sans)",
  fontSize: 12,
  cellTextColor: "var(--ds-text-primary)",
});

const agGridThemeLight: Theme = themeQuartz.withPart(colorSchemeLight).withParams({
  backgroundColor: "var(--ds-surface-primary)",
  foregroundColor: "var(--ds-text-primary)",
  headerBackgroundColor: "var(--ds-surface-secondary)",
  headerTextColor: "var(--ds-text-secondary)",
  headerColumnResizeHandleColor: "var(--ds-border-secondary)",
  rowHoverColor: "var(--ds-surface-tertiary)",
  selectedRowBackgroundColor: "var(--ds-overlay-info-soft)",
  oddRowBackgroundColor: "var(--ds-surface-primary)",
  borderColor: "var(--ds-border-primary)",
  wrapperBorder: "solid 1px var(--ds-border-primary)",
  rowBorder: "solid 1px var(--ds-border-primary)",
  headerRowBorder: "solid 1px var(--ds-border-primary)",
  columnBorder: { style: "solid", width: 1, color: "var(--ds-border-primary)" },
  accentColor: "var(--ds-accent-info)",
  inputBackgroundColor: "var(--ds-surface-secondary)",
  inputBorder: "solid 1px var(--ds-border-primary)",
  inputTextColor: "var(--ds-text-primary)",
  inputFocusBorder: "solid 1px var(--ds-accent-info)",
  fontFamily: "var(--ds-font-sans)",
  fontSize: 12,
  cellTextColor: "var(--ds-text-primary)",
});

export function agGridThemeFor(theme: "dark" | "light"): Theme {
  return theme === "dark" ? agGridThemeDark : agGridThemeLight;
}
