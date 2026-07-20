/**
 * Default SsrmGrid theme — the canonical StarUI design-system AG Grid theme
 * (live OKLCH tokens, light + dark via `data-ag-theme-mode` on `<html>`).
 * Hosts that pass `props.theme` (MarketsGrid) override this; standalone
 * mounts (labs, demos) get the same tokened chrome instead of a bespoke
 * dark-only palette (worklog B5 — no hardcoded hex, 100% theme-compatible).
 */
import { staruiGridTheme } from "@wellsfargo-starui/design-system/adapters/ag-grid";

export const theme = staruiGridTheme;
