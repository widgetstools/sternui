/**
 * Dock-editor design tokens — 100% derived from @marketsui/design-system.
 *
 * Every `--de-*` variable in this block resolves to a design-system token
 * (`--bn-*` for colors/surfaces/text, `--fi-*` for typography). The
 * `--de-*` names are kept purely as internal aliases so the component
 * code can reference familiar semantic names while the resolved values
 * come from the one source of truth.
 *
 * Consumers must have the design-system theme CSS loaded at the app
 * root, e.g.:
 *   @import '@marketsui/design-system/themes/fi-dark.css';
 *   @import '@marketsui/design-system/themes/fi-light.css';
 * and set `<html data-theme="dark">` (or `light`). See
 * `packages/design-system/README.md`.
 */

// Tokens scoped to `:root, [data-dock-editor]` (not just `[data-dock-editor]`)
// so that modal portals — PrimeNG dialogs etc. — which render outside
// the component subtree still resolve every `--de-*` var.
const EDITOR_CSS = `
:root, [data-dock-editor] {
  /* ── Typography aliases → @marketsui/design-system (--fi-*) ── */
  --de-font: var(--fi-sans);
  --de-mono: var(--fi-mono);

  /* ── Surface aliases → --bn-bg/--bn-bg1/--bn-bg2/--bn-bg3 ── */
  --de-bg-deep:    var(--bn-bg);
  --de-bg:         var(--bn-bg1);
  --de-bg-raised:  var(--bn-bg1);
  --de-bg-surface: var(--bn-bg2);
  --de-bg-hover:   var(--bn-bg3);
  --de-bg-active:  var(--bn-bg3);

  /* ── Border aliases → --bn-border/--bn-border2 ── */
  --de-border:         var(--bn-border);
  --de-border-subtle:  var(--bn-border);
  --de-border-strong:  var(--bn-border2);

  /* ── Text aliases → --bn-t0..t3 ── */
  --de-text:           var(--bn-t0);
  --de-text-secondary: var(--bn-t1);
  --de-text-tertiary:  var(--bn-t2);
  --de-text-ghost:     var(--bn-t3);

  /* ── Semantic colors → design-system accents ──
   * --de-accent is the PRIMARY BRAND accent — maps to --bn-blue
   * (the design-system info/brand color). NOT --bn-amber (which is
   * reserved for WARNING semantics). */
  --de-accent:         var(--bn-blue);
  --de-accent-dim:     var(--bn-info-soft);
  --de-accent-subtle:  var(--bn-info-soft);

  --de-danger:         var(--bn-red);
  --de-danger-dim:     var(--bn-negative-soft);
  --de-success:        var(--bn-green);

  /* ── Radii — kept as literal px (not a token category in design-system) ── */
  --de-radius-sm: 6px;
  --de-radius-md: 10px;
  --de-radius-lg: 14px;
  --de-radius-xl: 18px;

  /* ── Shadows — composition tokens kept local to this package ── */
  --de-shadow-sm:   0 1px 2px rgba(0,0,0,0.3);
  --de-shadow-md:   0 4px 12px rgba(0,0,0,0.4);
  --de-shadow-lg:   0 8px 32px rgba(0,0,0,0.5);
  --de-shadow-glow: 0 0 20px var(--bn-info-soft);

  font-family: var(--de-font);
  color: var(--de-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/*
 * Light-theme shadow overrides. All color-bearing tokens above already
 * re-resolve when the root [data-theme] attribute flips, because they
 * delegate to --bn-*/--fi-* which are themed by the design-system CSS.
 */
/* Match the root-level [data-theme="light"] selector so light-theme
   shadow overrides apply to portal content as well. */
[data-theme="light"], [data-dock-editor][data-theme="light"] {
  --de-shadow-sm:   0 1px 2px rgba(0,0,0,0.06);
  --de-shadow-md:   0 4px 12px rgba(0,0,0,0.08);
  --de-shadow-lg:   0 8px 32px rgba(0,0,0,0.12);
  --de-shadow-glow: 0 0 20px var(--bn-info-soft);
}

@keyframes de-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes de-scale-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes de-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes de-pulse-subtle {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

@keyframes de-shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

@keyframes de-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── PrimeNG dialog/input/button chrome overrides ─────────────────
 * PrimeNG components inside dialogs render via portals at document.body
 * and their dark-mode variants (via the preset's darkModeSelector) don't
 * always fire reliably. These overrides force the chrome to use
 * design-system tokens so the dialog matches the app's [data-theme]
 * state. Uses !important to win over PrimeNG's preset specificity. */

/* Dialog container + backdrop */
.p-dialog,
.p-dialog-content,
.p-dialog-header,
.p-dialog-footer {
  background: var(--bn-bg1) !important;
  color: var(--bn-t0) !important;
}
.p-dialog {
  border: 1px solid var(--bn-border) !important;
  box-shadow: var(--de-shadow-lg) !important;
}
.p-dialog-header {
  border-bottom: 1px solid var(--bn-border) !important;
}
.p-dialog-footer {
  border-top: 1px solid var(--bn-border) !important;
}
.p-dialog-title {
  color: var(--bn-t0) !important;
}
.p-dialog-mask {
  background: rgba(0, 0, 0, 0.55) !important;
}
.p-dialog-header-icon,
.p-dialog-close-button,
.p-dialog-header-close {
  color: var(--bn-t1) !important;
}
.p-dialog-header-icon:hover,
.p-dialog-close-button:hover,
.p-dialog-header-close:hover {
  background: var(--bn-bg3) !important;
  color: var(--bn-t0) !important;
}

/* Text inputs */
.p-inputtext {
  background: var(--bn-bg2) !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-inputtext:focus,
.p-inputtext:enabled:focus {
  border-color: var(--bn-blue) !important;
  box-shadow: 0 0 0 2px var(--bn-info-soft) !important;
}
.p-inputtext::placeholder { color: var(--bn-t2) !important; }

/* Buttons */
.p-button {
  font-family: var(--fi-sans) !important;
}
.p-button.p-button-text {
  background: transparent !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-button.p-button-text:enabled:hover {
  background: var(--bn-bg3) !important;
}
.p-button:not(.p-button-text):not(.p-button-secondary):not(.p-button-danger) {
  background: var(--bn-blue) !important;
  color: var(--bn-cta-text, #fff) !important;
  border: 1px solid var(--bn-blue) !important;
}
.p-button.p-button-secondary {
  background: var(--bn-bg2) !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-button.p-button-danger {
  background: var(--bn-red) !important;
  color: #fff !important;
  border: 1px solid var(--bn-red) !important;
}

/* Checkbox */
.p-checkbox .p-checkbox-box {
  background: var(--bn-bg2) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-checkbox.p-checkbox-checked .p-checkbox-box {
  background: var(--bn-blue) !important;
  border-color: var(--bn-blue) !important;
}
.p-checkbox .p-checkbox-icon { color: var(--bn-cta-text, #fff) !important; }

/* Select / dropdown */
.p-select,
.p-dropdown {
  background: var(--bn-bg2) !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-select-panel,
.p-dropdown-panel {
  background: var(--bn-bg1) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-select-list-item,
.p-dropdown-item {
  color: var(--bn-t0) !important;
}
.p-select-list-item:hover,
.p-dropdown-item:hover {
  background: var(--bn-bg3) !important;
}
.p-select-list-item.p-select-list-item-selected,
.p-dropdown-item.p-highlight {
  background: var(--bn-info-soft) !important;
  color: var(--bn-blue) !important;
}

/* Tooltips */
.p-tooltip .p-tooltip-text {
  background: var(--bn-bg3) !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
`;

let injected = false;

/**
 * Inject the dock-editor token alias block into the document head.
 *
 * All tokens resolve to `@marketsui/design-system` primitives, so the
 * design-system theme CSS (`fi-dark.css`, `fi-light.css`) MUST already
 * be loaded in the consuming app's root stylesheet, and `data-theme`
 * MUST be set on `<html>` (see the design-system README for the
 * prescribed pattern).
 */
export function injectEditorStyles(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dock-editor-styles", "");
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
  injected = true;
}
