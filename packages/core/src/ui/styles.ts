/**
 * CSS-in-JS styles for the Grid Customizer settings panel.
 *
 * Aligned with the FI Trading Terminal Design System:
 *   https://github.com/widgetstools/fi-trading-terminal
 *
 * Variables fallback to --bn-* / --fi-* tokens when available in the host app,
 * with hardcoded defaults matching the FI dark theme for standalone usage.
 */

export const STYLE_ID = 'gc-settings-styles';

export const settingsCSS = `
[data-gc-settings] {
  /* ── Surface layers (4-tier: ground → primary → secondary → tertiary) ─── */
  --gc-bg:             var(--bn-bg,       #0b0e11);
  --gc-surface:        var(--bn-bg1,      #161a1e);
  --gc-surface-hover:  var(--bn-bg2,      #1e2329);
  --gc-surface-active: var(--bn-bg3,      #2b3139);

  /* ── Text hierarchy (4-tier: primary → secondary → muted → faint) ─────── */
  --gc-text:           var(--bn-t0,       #eaecef);
  --gc-text-muted:     var(--bn-t1,       #a0a8b4);
  --gc-text-dim:       var(--bn-t2,       #7a8494);
  --gc-text-faint:     var(--bn-t3,       #4a5568);

  /* ── Borders ────────────────────────────────────────────────────────────── */
  --gc-border:         var(--bn-border,   #313944);
  --gc-border2:        var(--bn-border2,  #3e4754);

  /* ── Accent (amber/gold — matches shadcn --primary) ──────────────────── */
  --gc-accent:         var(--bn-yellow,   #f0b90b);
  --gc-accent-hover:                      #d4a40a;
  --gc-accent-muted:   rgba(240, 185, 11, 0.10);
  --gc-accent-text:                       #0b0e11;

  /* ── Positive / Teal (buy, success) ─────────────────────────────────── */
  --gc-positive:       var(--bn-green,    #2dd4bf);
  --gc-positive-muted: rgba(45, 212, 191, 0.10);

  /* ── Semantic ───────────────────────────────────────────────────────────── */
  --gc-negative:       var(--bn-red,      #f87171);
  --gc-warning:        var(--bn-yellow,   #f0b90b);
  --gc-info:           var(--bn-blue,     #3da0ff);
  --gc-danger:         var(--bn-red,      #f87171);

  /* ── Action buttons ─────────────────────────────────────────────────────── */
  --gc-buy-bg:         var(--bn-buy-bg,   #0d9488);
  --gc-sell-bg:        var(--bn-sell-bg,  #dc2626);
  --gc-cta-text:       var(--bn-cta-text, #ffffff);

  /* ── Typography ─────────────────────────────────────────────────────────── */
  --gc-font:           var(--fi-sans,     'Geist', 'Inter', -apple-system, sans-serif);
  --gc-font-mono:      var(--fi-mono,     'JetBrains Mono', Menlo, monospace);
  --gc-font-xs:        var(--fi-font-xs,  9px);
  --gc-font-sm:        var(--fi-font-sm,  11px);
  --gc-font-md:        var(--fi-font-md,  13px);
  --gc-font-lg:        var(--fi-font-lg,  18px);

  /* ── Radius (matches design-system/tokens/primitives.ts → radius) ──────── */
  --gc-radius:         4px;  /* radius.lg — cards, panels, buttons */
  --gc-radius-sm:      3px;  /* radius.md — inputs, selects, tooltips */
  --gc-radius-xs:      2px;  /* radius.sm — badges, scrollbar, small chips */
  --gc-radius-xl:      6px;  /* radius.xl — popovers, dropdowns */

  /* ── Scrollbar ──────────────────────────────────────────────────────────── */
  --gc-scrollbar:      var(--scrollbar-thumb, #4a5568);

  font-family: var(--gc-font);
  font-size: var(--gc-font-sm);
  color: var(--gc-text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

[data-gc-settings] * { box-sizing: border-box; }

/* ─── Overlay ─────────────────────────────────────────── */
.gc-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  animation: gc-fade-in 150ms ease-out;
}

/* ─── Sheet ───────────────────────────────────────────── */
.gc-sheet {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 10002;
  width: 680px; max-width: 95vw;
  background: var(--gc-bg);
  border-left: 1px solid var(--gc-border);
  display: flex; flex-direction: column;
  animation: gc-slide-in 200ms cubic-bezier(0.16,1,0.3,1);
  box-shadow: -4px 0 12px rgba(0,0,0,0.25);
}

/* ─── Header ──────────────────────────────────────────── */
.gc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--gc-border);
  background: var(--gc-surface);
  flex-shrink: 0;
}
.gc-header-title {
  font-size: var(--gc-font-md); font-weight: 600;
  display: flex; align-items: center; gap: 8px;
}
.gc-header-badge {
  font-size: var(--gc-font-xs); font-weight: 500;
  padding: 1px 6px; border-radius: var(--gc-radius-xs);
  background: var(--gc-accent-muted);
  color: var(--gc-accent);
  font-family: var(--gc-font-mono);
}
.gc-close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--gc-text-muted); padding: 4px;
  border-radius: var(--gc-radius-sm);
  transition: all 150ms;
}
.gc-close-btn:hover { color: var(--gc-text); background: var(--gc-surface-hover); }

/* ─── Body (nav + content) ────────────────────────────── */
.gc-body {
  display: flex; flex: 1; overflow: hidden;
}

/* ─── Nav Sidebar ─────────────────────────────────────── */
.gc-nav {
  width: 52px; flex-shrink: 0;
  border-right: 1px solid var(--gc-border);
  background: var(--gc-surface);
  overflow-y: auto; overflow-x: hidden;
  padding: 6px 0;
  scrollbar-width: none;
}
.gc-nav::-webkit-scrollbar { display: none; }

.gc-nav-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 8px 4px;
  cursor: pointer; border: none; background: none;
  color: var(--gc-text-faint);
  font-size: var(--gc-font-xs); font-weight: 500;
  letter-spacing: 0.02em;
  transition: all 150ms;
  position: relative; width: 100%;
}
.gc-nav-item:hover { color: var(--gc-text-muted); background: var(--gc-surface-hover); }
.gc-nav-item[data-active="true"] {
  color: var(--gc-accent);
  background: var(--gc-accent-muted);
}
.gc-nav-item[data-active="true"]::before {
  content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
  width: 2px; border-radius: 0 2px 2px 0;
  background: var(--gc-accent);
}
.gc-nav-icon { width: 16px; height: 16px; }

/* ─── Content Area ────────────────────────────────────── */
.gc-content {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 14px;
}
.gc-content::-webkit-scrollbar { width: 3px; }
.gc-content::-webkit-scrollbar-track { background: transparent; }
.gc-content::-webkit-scrollbar-thumb { background: var(--gc-scrollbar); border-radius: var(--gc-radius-xs); }

/* ─── Footer ──────────────────────────────────────────── */
.gc-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--gc-border);
  background: var(--gc-surface);
  flex-shrink: 0; gap: 8px;
}

/* ─── Shared UI Components ────────────────────────────── */
.gc-section { margin-bottom: 16px; }
.gc-section-title {
  font-size: var(--gc-font-xs); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--gc-text-muted);
  margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid var(--gc-border);
}
.gc-field {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; min-height: 32px;
}
.gc-field-label {
  font-size: var(--gc-font-sm); color: var(--gc-text);
  flex-shrink: 0; margin-right: 12px;
}
.gc-field-desc {
  font-size: var(--gc-font-xs); color: var(--gc-text-dim);
  margin-top: 1px;
}
.gc-input {
  height: 28px; padding: 6px 10px;
  background: var(--gc-bg); border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius-sm); color: var(--gc-text);
  font-size: var(--gc-font-sm); font-family: var(--gc-font-mono);
  outline: none; transition: border-color 150ms;
  width: 100%;
}
.gc-input:focus { border-color: var(--gc-accent); }
.gc-input-sm { width: 80px; text-align: right; }
.gc-input-mono { font-family: var(--gc-font-mono); font-size: var(--gc-font-xs); }

.gc-select {
  height: 28px; padding: 6px 24px 6px 10px;
  background: var(--gc-bg); border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius-sm); color: var(--gc-text);
  font-size: var(--gc-font-sm); font-family: var(--gc-font-mono);
  outline: none; appearance: none; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a8494' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 6px center;
}
.gc-select:focus { border-color: var(--gc-accent); }

.gc-switch {
  position: relative; width: 32px; height: 20px;
  background: var(--gc-border); border-radius: var(--gc-radius-xl);
  cursor: pointer; border: none; transition: background 150ms;
  flex-shrink: 0;
}
.gc-switch[data-checked="true"] { background: var(--gc-accent); }
.gc-switch::after {
  content: ''; position: absolute;
  top: 2px; left: 2px; width: 16px; height: 16px;
  background: white; border-radius: 50%;
  transition: transform 150ms;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.gc-switch[data-checked="true"]::after { transform: translateX(12px); }

.gc-btn {
  height: 32px; padding: 6px 12px;
  border-radius: var(--gc-radius);
  font-size: var(--gc-font-sm); font-weight: 500; font-family: var(--gc-font-mono);
  cursor: pointer; border: none;
  transition: all 150ms;
  display: inline-flex; align-items: center; gap: 6px;
}
.gc-btn-primary { background: var(--gc-accent); color: var(--gc-accent-text); }
.gc-btn-primary:hover { filter: brightness(1.15); }
.gc-btn-secondary { background: var(--gc-surface); color: var(--gc-text); border: 1px solid var(--gc-border); }
.gc-btn-secondary:hover { background: var(--gc-surface-hover); }
.gc-btn-ghost { background: transparent; color: var(--gc-text-muted); }
.gc-btn-ghost:hover { color: var(--gc-text); background: var(--gc-surface-hover); }
.gc-btn-danger { background: transparent; color: var(--gc-negative); border: 1px solid var(--gc-negative); }
.gc-btn-danger:hover { background: rgba(248,113,113,0.08); }
.gc-btn-sm { height: 28px; padding: 4px 10px; font-size: var(--gc-font-xs); }
.gc-btn-icon { width: 28px; height: 28px; padding: 0; justify-content: center; }

/* ─── Rule Card ───────────────────────────────────────── */
.gc-rule-card {
  background: var(--gc-surface); border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius); padding: 8px 10px;
  margin-bottom: 6px; transition: border-color 150ms;
}
.gc-rule-card:hover { border-color: var(--gc-border2); }
.gc-rule-card-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.gc-rule-card-title { font-size: var(--gc-font-sm); font-weight: 500; flex: 1; }
.gc-rule-card-body { font-size: var(--gc-font-xs); color: var(--gc-text-muted); }

/* ─── Color Swatch ────────────────────────────────────── */
.gc-color-swatch {
  width: 20px; height: 20px; border-radius: var(--gc-radius-sm);
  border: 1px solid var(--gc-border); cursor: pointer;
  position: relative; overflow: hidden;
}
.gc-color-swatch input {
  position: absolute; inset: -4px; width: 28px; height: 28px;
  cursor: pointer; opacity: 0;
}

/* ─── Profile List ────────────────────────────────────── */
.gc-profile-item {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: var(--gc-radius-sm);
  cursor: pointer; transition: background 150ms;
}
.gc-profile-item:hover { background: var(--gc-surface-hover); }
.gc-profile-item[data-active="true"] {
  background: var(--gc-accent-muted);
  border: 1px solid rgba(45,212,191,0.2);
}
.gc-profile-name { font-size: var(--gc-font-sm); font-weight: 500; flex: 1; }
.gc-profile-meta { font-size: var(--gc-font-xs); color: var(--gc-text-dim); }
.gc-profile-actions { display: flex; gap: 4px; }

/* ─── Empty State ─────────────────────────────────────── */
.gc-empty {
  text-align: center; padding: 20px 16px;
  color: var(--gc-text-dim); font-size: var(--gc-font-sm);
}

/* ─── Column List ─────────────────────────────────────── */
.gc-col-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: var(--gc-radius-sm);
  cursor: pointer; transition: background 150ms;
  font-size: var(--gc-font-sm);
}
.gc-col-item:hover { background: var(--gc-surface-hover); }
.gc-col-item[data-active="true"] { background: var(--gc-accent-muted); color: var(--gc-accent); }
.gc-col-dot {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--gc-text-faint); flex-shrink: 0;
}
.gc-col-item[data-active="true"] .gc-col-dot { background: var(--gc-accent); }

/* ─── Animations ──────────────────────────────────────── */
@keyframes gc-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes gc-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
