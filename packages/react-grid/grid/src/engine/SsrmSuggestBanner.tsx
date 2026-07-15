/**
 * Compact banner suggesting SSRM for large CSRM books. Confirm never auto-flips
 * the engine — parent must handle `onSuggestSsrm` (e.g. set useSSRM / rowModel).
 */

import { Button } from '@starui/ui';

export type SsrmSuggestBannerProps = {
  rowCount: number;
  threshold: number;
  onAccept: () => void;
  onDismiss: () => void;
};

export function SsrmSuggestBanner({
  rowCount,
  threshold,
  onAccept,
  onDismiss,
}: SsrmSuggestBannerProps) {
  return (
    <div
      role="status"
      data-testid="ssrm-suggest-banner"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground"
    >
      <span className="min-w-0 flex-1 leading-snug text-[color:var(--ds-text-secondary)]">
        Large dataset ({rowCount.toLocaleString()} rows ≥ {threshold.toLocaleString()}).
        Switch to the server row model for better scroll and filter performance?
      </span>
      <Button
        type="button"
        size="sm"
        variant="default"
        onClick={onAccept}
        data-testid="ssrm-suggest-accept"
      >
        Use SSRM
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDismiss}
        data-testid="ssrm-suggest-dismiss"
      >
        Dismiss
      </Button>
    </div>
  );
}
