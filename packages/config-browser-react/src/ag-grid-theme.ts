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
export const agGridThemeDark: Theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "var(--bn-bg1)",
  foregroundColor: "var(--bn-t0)",
  headerBackgroundColor: "var(--bn-bg2)",
  headerTextColor: "var(--bn-t1)",
  headerColumnResizeHandleColor: "var(--bn-border2)",
  rowHoverColor: "var(--bn-bg3)",
  selectedRowBackgroundColor: "var(--bn-info-soft)",
  oddRowBackgroundColor: "var(--bn-bg1)",
  borderColor: "var(--bn-border)",
  wrapperBorder: "solid 1px var(--bn-border)",
  rowBorder: "solid 1px var(--bn-border)",
  headerRowBorder: "solid 1px var(--bn-border)",
  columnBorder: { style: "solid", width: 1, color: "var(--bn-border)" },
  accentColor: "var(--bn-blue)",
  inputBackgroundColor: "var(--bn-bg2)",
  inputBorder: "solid 1px var(--bn-border)",
  inputTextColor: "var(--bn-t0)",
  inputFocusBorder: "solid 1px var(--bn-blue)",
  fontFamily: "var(--fi-sans)",
  fontSize: 12,
  cellTextColor: "var(--bn-t0)",
});

export const agGridThemeLight: Theme = themeQuartz.withPart(colorSchemeLight).withParams({
  backgroundColor: "var(--bn-bg1)",
  foregroundColor: "var(--bn-t0)",
  headerBackgroundColor: "var(--bn-bg2)",
  headerTextColor: "var(--bn-t1)",
  headerColumnResizeHandleColor: "var(--bn-border2)",
  rowHoverColor: "var(--bn-bg3)",
  selectedRowBackgroundColor: "var(--bn-info-soft)",
  oddRowBackgroundColor: "var(--bn-bg1)",
  borderColor: "var(--bn-border)",
  wrapperBorder: "solid 1px var(--bn-border)",
  rowBorder: "solid 1px var(--bn-border)",
  headerRowBorder: "solid 1px var(--bn-border)",
  columnBorder: { style: "solid", width: 1, color: "var(--bn-border)" },
  accentColor: "var(--bn-blue)",
  inputBackgroundColor: "var(--bn-bg2)",
  inputBorder: "solid 1px var(--bn-border)",
  inputTextColor: "var(--bn-t0)",
  inputFocusBorder: "solid 1px var(--bn-blue)",
  fontFamily: "var(--fi-sans)",
  fontSize: 12,
  cellTextColor: "var(--bn-t0)",
});

export function agGridThemeFor(theme: "dark" | "light"): Theme {
  return theme === "dark" ? agGridThemeDark : agGridThemeLight;
}
