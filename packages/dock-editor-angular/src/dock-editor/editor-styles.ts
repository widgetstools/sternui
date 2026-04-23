/**
 * Obsidian Studio — Design system styles injected at runtime.
 * This avoids Tailwind CSS generation issues in OpenFin windows
 * by using raw CSS custom properties and keyframe animations.
 */

const EDITOR_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

[data-dock-editor] {
  --de-font: 'DM Sans', system-ui, -apple-system, sans-serif;
  --de-mono: 'JetBrains Mono', 'SF Mono', monospace;

  /* Obsidian palette */
  --de-bg-deep: #0c0c0e;
  --de-bg: #111114;
  --de-bg-raised: #18181c;
  --de-bg-surface: #1e1e24;
  --de-bg-hover: #252530;
  --de-bg-active: #2a2a38;

  --de-border: rgba(255, 255, 255, 0.06);
  --de-border-subtle: rgba(255, 255, 255, 0.04);
  --de-border-strong: rgba(255, 255, 255, 0.10);

  --de-text: #e8e8ec;
  --de-text-secondary: #8b8b9e;
  --de-text-tertiary: #5c5c6e;
  --de-text-ghost: #3a3a4a;

  /* Warm amber accent */
  --de-accent: #e8a849;
  --de-accent-dim: rgba(232, 168, 73, 0.12);
  --de-accent-subtle: rgba(232, 168, 73, 0.06);

  --de-danger: #e5534b;
  --de-danger-dim: rgba(229, 83, 75, 0.12);
  --de-success: #3fb950;

  /* Shadows */
  --de-shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --de-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --de-shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
  --de-shadow-glow: 0 0 20px rgba(232, 168, 73, 0.08);

  /* Radii */
  --de-radius-sm: 6px;
  --de-radius-md: 10px;
  --de-radius-lg: 14px;
  --de-radius-xl: 18px;

  font-family: var(--de-font);
  color: var(--de-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Light theme overrides */
[data-dock-editor][data-theme="light"] {
  --de-bg-deep: #f5f5f7;
  --de-bg: #fafafa;
  --de-bg-raised: #ffffff;
  --de-bg-surface: #f0f0f3;
  --de-bg-hover: #e8e8ec;
  --de-bg-active: #dddde3;

  --de-border: rgba(0, 0, 0, 0.08);
  --de-border-subtle: rgba(0, 0, 0, 0.04);
  --de-border-strong: rgba(0, 0, 0, 0.12);

  --de-text: #1a1a2e;
  --de-text-secondary: #5c5c72;
  --de-text-tertiary: #8e8ea0;
  --de-text-ghost: #b8b8c8;

  --de-accent: #c4882e;
  --de-accent-dim: rgba(196, 136, 46, 0.10);
  --de-accent-subtle: rgba(196, 136, 46, 0.05);

  --de-shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --de-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --de-shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
  --de-shadow-glow: 0 0 20px rgba(196, 136, 46, 0.06);
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

/** Inject the editor design system CSS into the document head. */
export function injectEditorStyles(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dock-editor-styles", "");
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
  injected = true;
}
