/**
 * LoadingOverlay — animated busy indicator shown while the active
 * provider is between subscribe and snapshot delivery.
 *
 * Visual: a dual-ring rotating spinner — an outer conic-gradient
 * sweep (clockwise) layered over a dashed inner ring (counter-
 * clockwise) with a central pulsing dot. Sits inside a glassmorphism
 * card with a soft animated halo. Pure design-system tokens, dark/
 * light auto via [data-theme].
 */

export interface LoadingOverlayProps {
  /** Top-line label (e.g. provider name or "Market data"). */
  title?: string;
  /** Sub-label, free-form. Defaults to a connection-aware string. */
  message?: string;
  /** Optional row count — shown when a snapshot is actively streaming. */
  rowCount?: number;
}

export function MarketsGridLoadingOverlay({
  title = 'Loading market data',
  message,
  rowCount,
}: LoadingOverlayProps) {
  const subtitle =
    message ?? (typeof rowCount === 'number'
      ? `Streaming snapshot · ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'}`
      : 'Fetching snapshot…');

  return (
    <>
      <style>{KEYFRAMES_CSS}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label={`${title}. ${subtitle}`}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          background:
            'color-mix(in srgb, var(--background, rgba(20,20,28,0.6)) 60%, transparent)',
          pointerEvents: 'auto',
          animation: 'mui-grid-overlay-fade-in 200ms ease-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            padding: '24px 36px',
            borderRadius: 14,
            background:
              'color-mix(in srgb, var(--card, rgba(255,255,255,0.06)) 85%, transparent)',
            border: '1px solid var(--border, rgba(255,255,255,0.12))',
            boxShadow:
              '0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in srgb, var(--primary, #3b82f6) 20%, transparent)',
            minWidth: 240,
            animation: 'mui-grid-overlay-card-pulse 2.6s ease-in-out infinite',
          }}
        >
          {/* Dual-ring rotating spinner — pure border-based so it
              works in every renderer (no conic-gradient masks). */}
          <div
            style={{
              position: 'relative',
              width: 56,
              height: 56,
            }}
          >
            {/* Soft pulsing halo behind the rings */}
            <span
              style={{
                position: 'absolute',
                inset: -8,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(59,130,246,0.35) 0%, transparent 65%)',
                animation: 'mui-grid-overlay-halo 2s ease-in-out infinite',
                filter: 'blur(3px)',
              }}
            />

            {/* Outer ring — bright top arc, transparent rest, clockwise */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid transparent',
                borderTopColor: 'var(--primary, #3b82f6)',
                borderRightColor: 'rgba(59,130,246,0.35)',
                animation: 'mui-grid-overlay-spin-cw 1.0s linear infinite',
                boxShadow: '0 0 12px rgba(59,130,246,0.45)',
              }}
            />

            {/* Inner ring — dashed, counter-clockwise, slower */}
            <span
              style={{
                position: 'absolute',
                inset: 12,
                borderRadius: '50%',
                border: '2px dashed rgba(59,130,246,0.65)',
                animation: 'mui-grid-overlay-spin-ccw 2.4s linear infinite',
              }}
            />

            {/* Center dot — pulsing core */}
            <span
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 8,
                height: 8,
                marginLeft: -4,
                marginTop: -4,
                borderRadius: '50%',
                background: 'var(--primary, #3b82f6)',
                boxShadow: '0 0 14px rgba(59,130,246,0.8)',
                animation: 'mui-grid-overlay-dot 1.2s ease-in-out infinite',
              }}
            />
          </div>

          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--foreground, #e5e7eb)',
                letterSpacing: 0.2,
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--muted-foreground, #9ca3af)',
                fontFamily:
                  'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                letterSpacing: 0.15,
              }}
            >
              {subtitle}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

const KEYFRAMES_CSS = `
@keyframes mui-grid-overlay-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes mui-grid-overlay-card-pulse {
  0%, 100% { box-shadow: 0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in srgb, var(--primary, #3b82f6) 20%, transparent); }
  50%      { box-shadow: 0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in srgb, var(--primary, #3b82f6) 55%, transparent); }
}
@keyframes mui-grid-overlay-halo {
  0%, 100% { opacity: 0.45; transform: scale(0.92); }
  50%      { opacity: 0.85; transform: scale(1.06); }
}
@keyframes mui-grid-overlay-spin-cw {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes mui-grid-overlay-spin-ccw {
  from { transform: rotate(0deg); }
  to   { transform: rotate(-360deg); }
}
@keyframes mui-grid-overlay-dot {
  0%, 100% { transform: scale(0.85); opacity: 0.7; }
  50%      { transform: scale(1.15); opacity: 1; }
}
`;
