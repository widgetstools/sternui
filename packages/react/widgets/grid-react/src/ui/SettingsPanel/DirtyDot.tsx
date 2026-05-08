/**
 * Small status dot — 6×6 filled circle. Replaces the previous phosphor
 * LED bar. Three states:
 *   - on + green (default)  — active / ok
 *   - on + amber            — pending / warning
 *   - off                   — muted
 *
 * `DirtyDot` is kept as a BC alias — it now renders a 6px amber dot.
 */

export interface LedBarProps {
  on?: boolean;
  amber?: boolean;
  /** Deprecated — kept so older callers don't break. */
  height?: number;
  title?: string;
}

export function LedBar({ on = true, amber, title }: LedBarProps) {
  return (
    <span
      className="gc-led"
      data-on={on ? 'true' : 'false'}
      data-amber={amber ? 'true' : 'false'}
      title={title}
      aria-label={title}
    />
  );
}

export interface DirtyDotProps {
  hidden?: boolean;
  title?: string;
}

export function DirtyDot({ hidden, title = 'Unsaved changes' }: DirtyDotProps) {
  if (hidden) {
    return (
      <span
        aria-hidden
        style={{ display: 'inline-block', width: 6, height: 6, visibility: 'hidden', flexShrink: 0 }}
      />
    );
  }
  return <LedBar amber on title={title} />;
}
