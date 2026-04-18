/**
 * v2 Settings Sheet — Cockpit Terminal design system (restored).
 *
 * The Binance-inspired pass moved inputs onto filled tiles which erased
 * the sense of "these are controls". This revert brings back the
 * Cockpit language — tracked-caps labels, IBM Plex typography, mono
 * numerics, sharp 2px corners, bordered inputs against a deep base,
 * numbered band headers with a hairline rule — while keeping the
 * contrast / legibility improvements (slightly taller type, higher
 * contrast border tier, more breathing room inside toolbars).
 *
 * Scoped to `.gc-sheet-v2`. Light-mode repaint via `[data-theme=light]`.
 * Accent stays on the user's phosphor teal.
 */

export const V2_SHEET_STYLE_ID = 'gc-settings-v2-styles';

export const v2SheetCSS = `
/* ── Tokens ──────────────────────────────────────────────────── */
.gc-sheet-v2 {
  /* Surfaces — cockpit grey tiers */
  --ck-bg:           #111417;
  --ck-surface:      #1a1d21;
  --ck-card:         #22262b;
  --ck-card-hi:      #2a2e34;
  --ck-border:       #2d3339;
  --ck-border-hi:    #3a4149;

  /* Text tiers — kept slightly brighter from the Binance pass */
  --ck-t0:           #eaecef;
  --ck-t1:           #b7bdc6;
  --ck-t2:           #848e9c;
  --ck-t3:           #5e6673;

  /* Phosphor accent — user's primary */
  --ck-green:        #6ee7b7;
  --ck-green-dim:    #2d6a5a;
  --ck-green-bg:     rgba(110,231,183,0.10);
  --ck-green-hover:  #5dd3a4;

  /* Semantic */
  --ck-amber:        #ffb020;
  --ck-amber-bg:     rgba(255,176,32,0.08);
  --ck-red:          #f87171;
  --ck-red-bg:       rgba(248,113,113,0.08);

  /* Compositional */
  --ck-backdrop:     rgba(5,7,9,0.62);
  --ck-popout-shadow: 0 40px 80px rgba(0,0,0,0.6);
  --ck-popout-rim:    0 0 0 1px rgba(110,231,183,0.04);
  --ck-led-green-glow: 0 0 5px rgba(110,231,183,0.6);
  --ck-led-amber-glow: 0 0 5px rgba(255,176,32,0.55);
  --ck-header-lift:   0 8px 12px -10px rgba(0, 0, 0, 0.45);

  /* Typography */
  --ck-font-sans:    "IBM Plex Sans", "Inter", -apple-system, sans-serif;
  --ck-font-mono:    "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;

  /* Bridge legacy --bn-* tokens */
  --bn-bg:          var(--ck-bg);
  --bn-bg1:         var(--ck-surface);
  --bn-bg2:         var(--ck-card);
  --bn-bg3:         var(--ck-card-hi);
  --bn-t0:          var(--ck-t0);
  --bn-t1:          var(--ck-t1);
  --bn-t2:          var(--ck-t2);
  --bn-t3:          var(--ck-t3);
  --bn-border:      var(--ck-border);
  --bn-border-soft: var(--ck-border);
  --bn-green:       var(--ck-green);
  --bn-red:         var(--ck-red);
  --bn-yellow:      var(--ck-amber);
  --bn-amber:       var(--ck-amber);

  /* Baseline */
  font-family: var(--ck-font-sans);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ck-t0);
  background: var(--ck-bg);
  letter-spacing: 0.005em;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

.gc-sheet-v2 *,
.gc-sheet-v2 *::before,
.gc-sheet-v2 *::after { box-sizing: border-box; }

.gc-sheet-v2 code,
.gc-sheet-v2 kbd {
  font-family: var(--ck-font-mono);
  font-size: inherit;
}

/* Light-mode repaint. */
[data-theme='light'] .gc-sheet-v2,
[data-theme='light'] .gc-popout-backdrop,
.gc-sheet-v2[data-theme='light'] {
  --ck-bg:           #ffffff;
  --ck-surface:      #f5f6f8;
  --ck-card:         #edeff2;
  --ck-card-hi:      #e3e6ea;
  --ck-border:       #dbdfe4;
  --ck-border-hi:    #c0c6cd;

  --ck-t0:           #1a1d21;
  --ck-t1:           #4a5360;
  --ck-t2:           #6b7480;
  --ck-t3:           #9ba3ad;

  --ck-green:        #0d9488;
  --ck-green-dim:    #99e0d3;
  --ck-green-bg:     rgba(13,148,136,0.08);
  --ck-amber:        #b45309;
  --ck-amber-bg:     rgba(180,83,9,0.08);
  --ck-red:          #dc2626;
  --ck-red-bg:       rgba(220,38,38,0.06);

  --ck-backdrop:     rgba(15,23,42,0.35);
  --ck-popout-shadow: 0 24px 48px rgba(15,23,42,0.18);
  --ck-popout-rim:    0 0 0 1px rgba(13,148,136,0.06);
  --ck-led-green-glow: 0 0 5px rgba(13,148,136,0.45);
  --ck-led-amber-glow: 0 0 5px rgba(180,83,9,0.4);
  --ck-header-lift:    0 8px 12px -10px rgba(15, 23, 42, 0.15);
}

/* ── Backdrop + popout chrome ────────────────────────────────── */
.gc-popout-backdrop {
  position: fixed;
  inset: 0;
  background: var(--ck-backdrop);
  backdrop-filter: blur(2px);
  z-index: 10000;
  animation: gc-popout-fade 140ms ease-out;
}

.gc-popout {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 960px;
  height: 640px;
  max-width: 96vw;
  max-height: 94vh;
  background: var(--ck-bg);
  border: 1px solid var(--ck-border-hi);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  color: var(--ck-t0);
  z-index: 10001;
  box-shadow: var(--ck-popout-shadow), var(--ck-popout-rim), inset 0 1px 0 rgba(255,255,255,0.02);
  overflow: hidden;
  animation: gc-popout-rise 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gc-popout.is-maximized { width: 94vw; height: 90vh; }

@keyframes gc-popout-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes gc-popout-rise {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* ── Title bar (terminal chrome) ─────────────────────────────── */
.gc-popout-title {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  border-bottom: 1px solid var(--ck-border);
  background: var(--ck-surface);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}
.gc-popout-title-text {
  font-family: var(--ck-font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ck-t0);
}
.gc-popout-title-sub {
  font-family: var(--ck-font-mono);
  font-size: 11px;
  color: var(--ck-t3);
  letter-spacing: 0.04em;
}
.gc-popout-title-status {
  font-family: var(--ck-font-mono);
  font-size: 11px;
  color: var(--ck-t2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.gc-popout-title-status strong {
  color: var(--ck-t0);
  font-weight: 500;
}
.gc-popout-title-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--ck-t1);
  cursor: pointer;
  border-radius: 2px;
  padding: 0;
  transition: background 120ms, color 120ms;
}
.gc-popout-title-btn:hover {
  background: var(--ck-card);
  color: var(--ck-t0);
}

/* ── Body (2-col grid: items list, editor) ──────────────────── */
.gc-popout-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
  border-bottom: 1px solid var(--ck-border);
}
.gc-popout-body[data-layout='editor-only'] {
  grid-template-columns: 1fr;
}

/* ── Module dropdown (header) ───────────────────────────────── */
.gc-popout-module-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 26px;
  padding: 0 10px;
  background: var(--ck-card);
  border: 1px solid var(--ck-border-hi);
  border-radius: 2px;
  color: var(--ck-t0);
  font-family: var(--ck-font-sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
}
.gc-popout-module-btn:hover,
.gc-popout-module-btn[aria-expanded='true'] {
  background: var(--ck-card-hi);
  border-color: var(--ck-t3);
}
.gc-popout-module-btn-code {
  font-family: var(--ck-font-mono);
  font-size: 10px;
  color: var(--ck-green);
  letter-spacing: 0.06em;
}
.gc-popout-module-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: var(--ck-t0);
  font-family: var(--ck-font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
  transition: background 100ms;
}
.gc-popout-module-menu-item:hover {
  background: var(--ck-card-hi);
}
.gc-popout-module-menu-item[aria-selected='true'] {
  background: var(--ck-card-hi);
  border-left-color: var(--ck-green);
}
.gc-popout-module-menu-item-code {
  font-family: var(--ck-font-mono);
  font-size: 10px;
  color: var(--ck-t3);
  letter-spacing: 0.06em;
  min-width: 18px;
}
.gc-popout-module-menu-item[aria-selected='true'] .gc-popout-module-menu-item-code {
  color: var(--ck-green);
}

/* Items list rail */
.gc-popout-list {
  border-right: 1px solid var(--ck-border);
  background: var(--ck-bg);
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.gc-popout-list-header {
  padding: 14px 16px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  position: sticky;
  top: 0;
  background: var(--ck-bg);
  border-bottom: 1px solid var(--ck-border);
  z-index: 1;
}
.gc-popout-list-items {
  list-style: none;
  padding: 4px 0;
  margin: 0;
  flex: 1;
}
.gc-popout-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 16px 9px 14px;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: var(--ck-t0);
  font-family: var(--ck-font-sans);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 100ms;
}
.gc-popout-list-item[aria-selected='true'] {
  background: var(--ck-surface);
  border-left-color: var(--ck-green);
}
.gc-popout-list-item:hover:not([aria-selected='true']) {
  background: var(--ck-surface);
}
.gc-popout-list-item[data-muted='true'] { color: var(--ck-t2); }

/* Editor pane */
.gc-popout-editor {
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ck-bg);
}
.gc-editor-header {
  flex-shrink: 0;
  background: var(--ck-bg);
  border-bottom: 1px solid var(--ck-border);
  box-shadow:
    0 1px 0 var(--ck-border),
    var(--ck-header-lift);
  position: relative;
  z-index: 2;
}
.gc-editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 16px;
}

/* Footer */
.gc-popout-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 40px;
  padding: 0 16px;
  background: var(--ck-surface);
  font-family: var(--ck-font-mono);
  font-size: 11px;
  color: var(--ck-t2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.gc-popout-footer-shortcuts { color: var(--ck-t3); }

/* ── Atoms ────────────────────────────────────────────────── */

/* Tracked-caps label. */
.gc-caps {
  font-family: var(--ck-font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ck-t2);
  white-space: nowrap;
}

/* Mono numeric / identifier voice. */
.gc-mono {
  font-family: var(--ck-font-mono);
  font-size: 12px;
  color: var(--ck-t0);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* LED indicator — 2×12 vertical phosphor bar. */
.gc-led {
  width: 2px;
  height: 12px;
  display: inline-block;
  flex-shrink: 0;
  background: var(--ck-border-hi);
}
.gc-led[data-on='true'] {
  background: var(--ck-green);
  box-shadow: var(--ck-led-green-glow);
}
.gc-led[data-on='true'][data-amber='true'] {
  background: var(--ck-amber);
  box-shadow: var(--ck-led-amber-glow);
}

/* Numbered band header — "01 EXPRESSION ──────────────" */
.gc-band { padding: 16px 24px 4px; }
.gc-band-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  user-select: none;
}
.gc-band-index {
  font-family: var(--ck-font-mono);
  font-size: 11px;
  color: var(--ck-t3);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}
.gc-band-title {
  font-family: var(--ck-font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ck-t1);
}
.gc-band-rule {
  flex: 1;
  height: 1px;
  background: var(--ck-border);
}

/* Toolbar grouping. */
.gc-tgroup {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 4px;
  background: var(--ck-bg);
  border: 1px solid var(--ck-border);
  border-radius: 2px;
}
.gc-tgroup-wide {
  background: var(--ck-card);
  padding: 8px 10px;
  gap: 10px;
  flex-wrap: wrap;
}
.gc-tbtn {
  min-width: 32px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--ck-t1);
  cursor: pointer;
  padding: 0 6px;
  border-radius: 2px;
  font-family: var(--ck-font-sans);
  font-size: 12px;
  transition: background 120ms, color 120ms;
}
.gc-tbtn:hover:not(:disabled) {
  color: var(--ck-t0);
  background: var(--ck-card-hi);
}
.gc-tbtn[aria-pressed='true'] {
  background: var(--ck-green-bg);
  color: var(--ck-green);
}
.gc-tbtn:disabled { opacity: 0.45; cursor: not-allowed; }
.gc-tbtn-divider {
  width: 1px;
  height: 22px;
  background: var(--ck-border-hi);
  margin: 0 4px;
}

/* Sharp-corner rectangular buttons. */
.gc-sharp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 2px;
  font-family: var(--ck-font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  background: var(--ck-card-hi);
  color: var(--ck-t0);
  border-color: var(--ck-border-hi);
  transition: background 120ms, color 120ms, border-color 120ms;
}
.gc-sharp-btn:hover:not(:disabled) {
  background: var(--ck-card-hi);
  border-color: var(--ck-t3);
}
.gc-sharp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.gc-sharp-btn[data-variant='action'] {
  background: var(--ck-green);
  color: #0a0f13;
  border-color: transparent;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
}
.gc-sharp-btn[data-variant='action']:hover:not(:disabled) {
  background: var(--ck-green-hover);
}
.gc-sharp-btn[data-variant='action']:disabled {
  background: var(--ck-card);
  color: var(--ck-t3);
  box-shadow: none;
}
.gc-sharp-btn[data-variant='ghost'] {
  background: transparent;
  color: var(--ck-t1);
  border-color: var(--ck-border-hi);
}
.gc-sharp-btn[data-variant='ghost']:hover:not(:disabled) {
  background: var(--ck-card);
  color: var(--ck-t0);
}
.gc-sharp-btn[data-variant='danger'] {
  background: transparent;
  color: var(--ck-red);
  border-color: var(--ck-border-hi);
}
.gc-sharp-btn[data-variant='danger']:hover:not(:disabled) {
  background: var(--ck-red-bg);
  border-color: var(--ck-red);
}

/* Inputs — bordered against the deep base so they read as inputs. */
.gc-sheet-v2 input[type='text'],
.gc-sheet-v2 input:not([type]),
.gc-sheet-v2 input[type='number'],
.gc-sheet-v2 input[type='search'],
.gc-sheet-v2 textarea,
.gc-sheet-v2 select {
  background: var(--ck-bg);
  border: 1px solid var(--ck-border-hi);
  color: var(--ck-t0);
  font-family: var(--ck-font-sans);
  font-size: 12px;
  border-radius: 2px;
  padding: 0 10px;
  height: 32px;
  outline: none;
  transition: border-color 120ms;
}
.gc-sheet-v2 textarea {
  font-family: var(--ck-font-mono);
  padding: 10px 12px;
  line-height: 1.6;
  height: auto;
  min-height: 72px;
  resize: vertical;
}
.gc-sheet-v2 select {
  padding: 0 28px 0 10px;
  appearance: none;
  -webkit-appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--ck-t2) 50%),
    linear-gradient(135deg, var(--ck-t2) 50%, transparent 50%);
  background-position:
    calc(100% - 12px) calc(50% - 2px),
    calc(100% - 8px) calc(50% - 2px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  cursor: pointer;
}
.gc-sheet-v2 input:focus,
.gc-sheet-v2 textarea:focus,
.gc-sheet-v2 select:focus {
  border-color: var(--ck-green);
}
.gc-sheet-v2 input::placeholder,
.gc-sheet-v2 textarea::placeholder {
  color: var(--ck-t3);
}

/* IconInput pill — 32px, bordered. */
.gc-sheet-v2 .gc-icon-pill {
  background: var(--ck-bg) !important;
  border: 1px solid var(--ck-border-hi) !important;
  height: 32px !important;
  border-radius: 2px !important;
  padding: 0 10px !important;
}
.gc-sheet-v2 .gc-icon-pill:focus-within {
  border-color: var(--ck-green) !important;
}
.gc-sheet-v2 .gc-icon-pill input {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  height: auto !important;
  font-size: 12px !important;
  color: var(--ck-t0) !important;
  font-family: var(--ck-font-sans) !important;
}

/* Title input (identity row). */
.gc-sheet-v2 .gc-title-input {
  background: var(--ck-bg);
  border: 1px solid var(--ck-border-hi);
  color: var(--ck-t0);
  font-family: var(--ck-font-sans);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  border-radius: 2px;
  padding: 0 12px;
  height: 34px;
}
.gc-sheet-v2 .gc-title-input:focus {
  border-color: var(--ck-green);
}
.gc-sheet-v2 .gc-title-input::placeholder {
  color: var(--ck-t3);
  font-weight: 500;
}

/* Chips used in column pickers. */
.gc-sheet-v2 [data-v2-chip] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 7px;
  background: var(--ck-card);
  border: 1px solid var(--ck-border-hi);
  border-radius: 2px;
  font-family: var(--ck-font-mono);
  font-size: 11px;
  color: var(--ck-t0);
  letter-spacing: 0.02em;
}

/* Meta grid (4 columns under the identity strip). */
.gc-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  column-gap: 20px;
  row-gap: 0;
  padding: 12px 24px 16px;
  border-bottom: 1px solid var(--ck-border);
  background: var(--ck-surface);
}
.gc-meta-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
/* The value slot sits on a consistent 28px baseline so that the input
   row (Select, IconInput, Switch, Mono readout) lines up across every
   MetaCell regardless of which primitive it hosts. */
.gc-meta-cell > :nth-child(2) {
  min-height: 28px;
  display: flex;
  align-items: center;
}

/* Legacy BorderSidesEditor host normalisation. */
.gc-sheet-v2 [data-v2-border-host] span,
.gc-sheet-v2 [data-v2-border-host] button {
  font-size: 11px !important;
  line-height: 1.4 !important;
}

/* ── Monaco ExpressionEditor repaint ──────────────────────── */
.gc-sheet-v2 .monaco-editor,
.gc-sheet-v2 .monaco-editor-background,
.gc-sheet-v2 .monaco-editor .margin {
  background: var(--ck-bg) !important;
}
.gc-sheet-v2 .monaco-editor .view-lines,
.gc-sheet-v2 .monaco-editor .view-line {
  color: var(--ck-t0);
}
/* Monaco overflow-widgets host (mounted on document.body by
   ExpressionEditor to escape the sheet's transform/clip ancestors — see
   ExpressionEditorInner.tsx). The cockpit tokens are scoped to
   '.gc-sheet-v2', but widgets rendered inside the body-mounted host sit
   OUTSIDE that scope, so --ck-* vars would resolve to undefined and the
   theme-aware rules below would paint transparent. Re-bind the tokens
   here so body-mounted widgets still look right. */
[data-gc-monaco-overflow] {
  --ck-bg:           #111417;
  --ck-surface:      #1a1d21;
  --ck-card:         #22262b;
  --ck-card-hi:      #2a2e34;
  --ck-border:       #2d3339;
  --ck-border-hi:    #3a4149;
  --ck-t0:           #eaecef;
  --ck-t1:           #b7bdc6;
  --ck-t2:           #848e9c;
  --ck-t3:           #5e6673;
  --ck-green:        #6ee7b7;
  --ck-green-bg:     rgba(110,231,183,0.10);
  --ck-amber:        #ffb020;
  --ck-red:          #f87171;
  --ck-popout-shadow: 0 40px 80px rgba(0,0,0,0.6);
  --ck-font-sans:    "IBM Plex Sans", "Inter", -apple-system, sans-serif;
  --ck-font-mono:    "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
}
[data-theme='light'] [data-gc-monaco-overflow] {
  --ck-bg:           #ffffff;
  --ck-surface:      #f5f6f8;
  --ck-card:         #edeff2;
  --ck-card-hi:      #e3e6ea;
  --ck-border:       #dbdfe4;
  --ck-border-hi:    #c0c6cd;
  --ck-t0:           #1a1d21;
  --ck-t1:           #4a5360;
  --ck-t2:           #6b7480;
  --ck-t3:           #9ba3ad;
  --ck-green:        #0d9488;
  --ck-green-bg:     rgba(13,148,136,0.08);
  --ck-popout-shadow: 0 24px 48px rgba(15,23,42,0.18);
}

.monaco-editor .suggest-widget,
.monaco-editor .parameter-hints-widget,
.monaco-editor .monaco-hover {
  background: var(--ck-card) !important;
  border: 1px solid var(--ck-border-hi) !important;
  border-radius: 2px !important;
  color: var(--ck-t0) !important;
  box-shadow: var(--ck-popout-shadow) !important;
  font-family: var(--ck-font-sans) !important;
  font-size: 11px !important;
}
.monaco-editor .suggest-widget .monaco-list-row {
  color: var(--ck-t1) !important;
  padding: 2px 6px !important;
}
.monaco-editor .suggest-widget .monaco-list-row.focused {
  background: var(--ck-green-bg) !important;
  color: var(--ck-t0) !important;
  border-left: 2px solid var(--ck-green) !important;
  padding-left: 4px !important;
}
.monaco-editor .suggest-widget .monaco-list-row .label-name {
  font-family: var(--ck-font-mono) !important;
  font-size: 11px !important;
}
.monaco-editor .suggest-widget .monaco-list-row .type-label {
  color: var(--ck-t3) !important;
  font-family: var(--ck-font-sans) !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  font-size: 9px !important;
}
.monaco-editor .suggest-widget .details-label,
.monaco-editor .suggest-widget .docs {
  color: var(--ck-t2) !important;
  font-family: var(--ck-font-sans) !important;
  font-size: 11px !important;
}

/* ── Scrollbar ────────────────────────────────────────────── */
.gc-sheet-v2 ::-webkit-scrollbar { width: 8px; height: 8px; }
.gc-sheet-v2 ::-webkit-scrollbar-track { background: transparent; }
.gc-sheet-v2 ::-webkit-scrollbar-thumb {
  background: var(--ck-border-hi);
  border-radius: 0;
}
.gc-sheet-v2 ::-webkit-scrollbar-thumb:hover {
  background: var(--ck-t3);
}

/* ── Scrollbar (portaled popovers) ──────────────────────────
   The Excel-format reference popover portals out of the sheet
   scope to document.body, so the .gc-sheet-v2 scrollbar rules
   above can't reach it. Repeat the theme-aware thumb styling
   on the unscoped .gc-excel-ref-scroll class so the popover's
   overflow-y rail matches the host app's dark / light mode
   instead of the browser's default white track. --gc-border
   falls back through --bn-border which swaps with the theme. */
.gc-excel-ref-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.gc-excel-ref-scroll::-webkit-scrollbar-track { background: transparent; }
.gc-excel-ref-scroll::-webkit-scrollbar-thumb {
  background: var(--gc-border, #313944);
  border-radius: 0;
}
.gc-excel-ref-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--gc-text-muted, #64748b);
}
`;
