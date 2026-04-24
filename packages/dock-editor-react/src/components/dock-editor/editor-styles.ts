/**
 * Dock-editor design tokens — 100% derived from @marketsui/design-system.
 *
 * Every `--de-*` variable in this block resolves to a design-system token
 * (`--bn-*` for colors/surfaces/text, `--fi-*` for typography). The
 * `--de-*` names are kept purely as internal aliases so the component
 * code can reference familiar semantic names (accent/danger/etc.) while
 * the resolved values come from the one source of truth.
 *
 * Consumers must have the design-system theme CSS loaded at the app
 * root, e.g.:
 *   @import '@marketsui/design-system/themes/fi-dark.css';
 *   @import '@marketsui/design-system/themes/fi-light.css';
 * and set `<html data-theme="dark">` (or `light`). See
 * `packages/design-system/README.md`.
 */

// Tokens scoped to `:root, [data-dock-editor]` (not just `[data-dock-editor]`)
// so that modal portals — PrimeNG dialogs, Radix popovers, etc. — which
// render outside the component subtree still resolve every `--de-*` var.
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
