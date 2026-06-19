/**
 * Format readout — the toolbar's plain-language status line.
 *
 * Answers two questions the icon-only scope/target toggles can't on their own:
 * "what will my edit affect?" (target + scope, in words) and "what does the
 * format look like?" (a live sample of the focused column's value, rendered
 * from the already-computed `previewText`). When nothing is selected it becomes
 * the empty-state invitation. Lives in `ModuleContext`, so it renders in both
 * the horizontal toolbar and the popped-out vertical panel.
 */
import { EMPTY_SCOPE_MESSAGE, scopeSummary } from './scopeSummary';
import type { FormatterState } from './state';

export function FormatReadout({ state }: { state: FormatterState }) {
  const summary = scopeSummary({
    scope: state.scope,
    target: state.target,
    colIds: state.colIds,
    colLabel: state.colLabel,
  });
  // Headers carry no value formatter, so a sample only makes sense for cells.
  const sample = !summary.empty && state.target === 'cell' ? state.previewText : '';
  const title = summary.empty
    ? EMPTY_SCOPE_MESSAGE
    : sample
      ? `${summary.full} · ${sample}`
      : summary.full;

  return (
    <div
      className="fx-readout"
      data-testid="formatting-readout"
      data-empty={summary.empty || undefined}
      title={title}
    >
      {summary.empty ? (
        <span
          style={{
            fontSize: 11,
            color: 'var(--ds-text-faint)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {EMPTY_SCOPE_MESSAGE}
        </span>
      ) : (
        <>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--ds-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {summary.targetLabel}
            <span style={{ color: 'var(--ds-text-faint)' }}> · {summary.scopeLabel}</span>
          </span>
          {sample ? (
            <span
              data-testid="formatting-readout-sample"
              style={{
                flexShrink: 0,
                maxWidth: 96,
                padding: '0 6px',
                height: 18,
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--ds-primary-soft)',
                color: 'var(--ds-primary)',
                border: '1px solid var(--ds-border-secondary)',
                borderRadius: 'var(--ds-radius-sm)',
                fontFamily: 'var(--ds-font-mono)',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {sample}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
