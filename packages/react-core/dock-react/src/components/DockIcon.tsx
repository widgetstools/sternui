import type { DockIconSpec, DockTheme } from "../types";

interface DockIconProps {
  icon: DockIconSpec;
  theme: DockTheme;
  size?: number;
  className?: string;
}

/**
 * Render a pre-resolved {@link DockIconSpec} for the live theme.
 *
 * Picks the variant for `theme`, falling back to whichever variant exists.
 * Returns `null` when neither is set so the button can show its own
 * fallback (a lucide glyph) instead of a broken `<img>`.
 */
export function DockIcon({ icon, theme, size = 18, className }: DockIconProps) {
  const url = icon[theme] || icon.dark || icon.light;
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className ?? "shrink-0"}
      style={{ width: size, height: size }}
    />
  );
}
