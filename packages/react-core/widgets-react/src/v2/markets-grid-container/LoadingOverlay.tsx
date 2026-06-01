/**
 * LoadingOverlay — animated busy indicator shown while the active
 * provider is between subscribe and snapshot delivery.
 *
 * Pure design-system tokens; dark/light via [data-theme].
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
      ? `Buffering snapshot · ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'} received`
      : 'Fetching snapshot…');

  return (
    <>
      <style>{KEYFRAMES_CSS}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label={`${title}. ${subtitle}`}
        className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm pointer-events-auto animate-[mui-grid-overlay-fade-in_200ms_ease-out] bg-[color-mix(in_srgb,var(--ds-surface-ground)_60%,transparent)]"
      >
        <div
          className="flex min-w-[240px] flex-col items-center gap-[18px] rounded-[14px] border border-[color:var(--ds-border-primary)] px-9 py-6 animate-[mui-grid-overlay-card-pulse_2.6s_ease-in-out_infinite] bg-[color-mix(in_srgb,var(--ds-surface-primary)_85%,transparent)] shadow-[0_18px_50px_color-mix(in_srgb,var(--ds-text-primary)_45%,transparent),0_0_0_1px_color-mix(in_srgb,var(--ds-accent-info)_20%,transparent)]"
        >
          <div className="relative h-14 w-14">
            <span
              className="absolute -inset-2 rounded-full blur-[3px] animate-[mui-grid-overlay-halo_2s_ease-in-out_infinite] bg-[radial-gradient(circle,color-mix(in_srgb,var(--ds-accent-info)_35%,transparent)_0%,transparent_65%)]"
              aria-hidden
            />
            <span
              className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[color:var(--ds-accent-info)] border-r-[color-mix(in_srgb,var(--ds-accent-info)_35%,transparent)] animate-[mui-grid-overlay-spin-cw_1s_linear_infinite] shadow-[0_0_12px_color-mix(in_srgb,var(--ds-accent-info)_45%,transparent)]"
              aria-hidden
            />
            <span
              className="absolute inset-3 rounded-full border-2 border-dashed border-[color-mix(in_srgb,var(--ds-accent-info)_65%,transparent)] animate-[mui-grid-overlay-spin-ccw_2.4s_linear_infinite]"
              aria-hidden
            />
            <span
              className="absolute left-1/2 top-1/2 h-2 w-2 -ml-1 -mt-1 rounded-full animate-[mui-grid-overlay-dot_1.2s_ease-in-out_infinite] bg-[color:var(--ds-accent-info)] shadow-[0_0_14px_color-mix(in_srgb,var(--ds-accent-info)_80%,transparent)]"
              aria-hidden
            />
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-[13px] font-semibold tracking-[0.2px] text-[color:var(--ds-text-primary)]">
              {title}
            </span>
            <span className="font-[family-name:var(--ds-font-mono)] text-[11px] tracking-[0.15px] text-[color:var(--ds-text-muted)]">
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
  0%, 100% { box-shadow: 0 18px 50px color-mix(in srgb, var(--ds-text-primary) 45%, transparent), 0 0 0 1px color-mix(in srgb, var(--ds-accent-info) 20%, transparent); }
  50%      { box-shadow: 0 18px 50px color-mix(in srgb, var(--ds-text-primary) 45%, transparent), 0 0 0 1px color-mix(in srgb, var(--ds-accent-info) 55%, transparent); }
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
