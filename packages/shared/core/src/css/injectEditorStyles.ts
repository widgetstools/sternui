/**
 * Dock-editor design tokens — 100% derived from @starui/design-system.
 *
 * Every `--de-*` variable in this block resolves to a design-system token
 * (`--ds-*` unified token system). The
 * `--de-*` names are kept purely as internal aliases so the component
 * code can reference familiar semantic names (accent/danger/etc.) while
 * the resolved values come from the one source of truth.
 *
 * Consumers must have the design-system theme CSS loaded at the app
 * root, e.g.:
 *   @import '@starui/design-system/themes/fi-dark.css';
 *   @import '@starui/design-system/themes/fi-light.css';
 * and set `<html data-theme="dark">` (or `light`). See
 * `packages/design-system/README.md`.
 */

// Tokens scoped to `:root, [data-dock-editor]` (not just `[data-dock-editor]`)
// so that modal portals — PrimeNG dialogs, Radix popovers, etc. — which
// render outside the component subtree still resolve every `--de-*` var.
const EDITOR_CSS = `
:root, [data-dock-editor] {
  /* ── Typography aliases → @starui/design-system ── */
  --de-font: var(--ds-font-sans);
  --de-mono: var(--ds-font-mono);

  /* ── Surface aliases → --ds-surface-* ── */
  --de-bg-deep:    var(--ds-surface-ground);
  --de-bg:         var(--ds-surface-primary);
  --de-bg-raised:  var(--ds-surface-primary);
  --de-bg-surface: var(--ds-surface-secondary);
  --de-bg-hover:   var(--ds-surface-tertiary);
  --de-bg-active:  var(--ds-surface-tertiary);

  /* ── Border aliases → --ds-border-* ── */
  --de-border:         var(--ds-border-primary);
  --de-border-subtle:  var(--ds-border-primary);
  --de-border-strong:  var(--ds-border-secondary);

  /* ── Text aliases → --ds-text-* ── */
  --de-text:           var(--ds-text-primary);
  --de-text-secondary: var(--ds-text-secondary);
  --de-text-tertiary:  var(--ds-text-muted);
  --de-text-ghost:     var(--ds-text-faint);

  /* ── Semantic colors → design-system accents ──
   * --de-accent is the PRIMARY BRAND accent — maps to --ds-accent-info
   * (the design-system info/brand color). NOT --ds-accent-warning (which is
   * reserved for WARNING semantics). */
  --de-accent:         var(--ds-accent-info);
  --de-accent-dim:     var(--ds-overlay-info-soft);
  --de-accent-subtle:  var(--ds-overlay-info-soft);

  --de-danger:         var(--ds-accent-negative);
  --de-danger-dim:     var(--ds-overlay-negative-soft);
  --de-success:        var(--ds-accent-positive);

  /* ── Radii — kept as literal px (not a token category in design-system) ── */
  --de-radius-sm: 6px;
  --de-radius-md: 10px;
  --de-radius-lg: 14px;
  --de-radius-xl: 18px;

  /* ── Shadows — composition tokens kept local to this package ── */
  --de-shadow-sm:   0 1px 2px rgba(0,0,0,0.3);
  --de-shadow-md:   0 4px 12px rgba(0,0,0,0.4);
  --de-shadow-lg:   0 8px 32px rgba(0,0,0,0.5);
  --de-shadow-glow: 0 0 20px var(--ds-overlay-info-soft);

  font-family: var(--de-font);
  color: var(--de-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/*
 * Light-theme shadow overrides. All color-bearing tokens above already
 * re-resolve when the root [data-theme] attribute flips, because they
 * delegate to --ds-* which are themed by the design-system CSS.
 */
/* Match the root-level [data-theme="light"] selector so light-theme
   shadow overrides apply to portal content as well. */
[data-theme="light"], [data-dock-editor][data-theme="light"] {
  --de-shadow-sm:   0 1px 2px rgba(0,0,0,0.06);
  --de-shadow-md:   0 4px 12px rgba(0,0,0,0.08);
  --de-shadow-lg:   0 8px 32px rgba(0,0,0,0.12);
  --de-shadow-glow: 0 0 20px var(--ds-overlay-info-soft);
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

/* ── Themed scrollbars ───────────────────────────────────────────────
 * Used by .bn-scrollbar (any element that scrolls inside the editor
 * shells). Track + thumb derive from --ds-surface-secondary / --ds-border-primary so they
 * flip cleanly when [data-theme] changes on the document root.
 *
 * Pure-CSS approach so the same rule works in every browser the
 * platform supports — Chromium uses ::-webkit-scrollbar, others fall
 * back to scrollbar-color (Firefox, recent WebKit).
 */
.bn-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--ds-border-secondary, var(--ds-border-primary)) transparent;
}
.bn-scrollbar::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.bn-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.bn-scrollbar::-webkit-scrollbar-thumb {
  background: var(--ds-border-secondary, var(--ds-border-primary));
  border: 2px solid var(--ds-surface-ground);
  border-radius: 6px;
}
.bn-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--ds-text-faint, var(--ds-text-muted));
}
.bn-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}
`;

let injected = false;

/**
 * Inject the dock-editor token alias block into the document head.
 *
 * All tokens resolve to `@starui/design-system` primitives, so the
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
