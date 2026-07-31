/**
 * What a tab shows while it has no Table yet — and what it shows when it never
 * will.
 *
 * The grid is NOT mounted until the Table exists, and that is not a nicety.
 * Exactly one grid may mount per `GridPlatform`, ever: mounting a stand-in
 * grid while the attach is in flight fires its `onGridReady`, and its
 * `onGridPreDestroyed` then calls `platform.destroy()` — permanently. The real
 * grid mounts into a destroyed platform where every platform-driven feature
 * (formatting toolbar, auto-formatter, saved filters, profiles) is silently
 * dead while the grid itself looks healthy.
 *
 * So this is a placeholder, deliberately, and it says which of the three
 * states it is in rather than showing an indefinite spinner: attaching is
 * normal, `unavailable` means the provider holds no Table (a real answer, not
 * a slow one), and `error` is a failure worth reading.
 */
export interface PerspectiveAttachNoticeProps {
  status: string;
  reason?: string;
}

const COPY: Record<string, { title: string; body: string }> = {
  idle: {
    title: 'Waiting for the provider',
    body: 'The tab’s catalog row is being written before the Table is opened.',
  },
  attaching: {
    title: 'Opening the worker-held Table…',
    body:
      'The hub is binding a ProxySession to this window. The book is built once ' +
      'in the SharedWorker — this window only opens a View onto it.',
  },
  unavailable: {
    title: 'This provider holds no Table',
    body:
      'The provider started but built no Perspective Table. A mock-perspective ' +
      'provider needs a single-column keyColumn and flat rows (rowShape: "ssrm" ' +
      'with columnDefinitions) — see src/data/perspectiveProvider.ts.',
  },
  error: {
    title: 'Could not attach to the Table',
    body: 'The hub refused or failed the attach.',
  },
};

export function PerspectiveAttachNotice({ status, reason }: PerspectiveAttachNoticeProps) {
  const copy = COPY[status] ?? COPY.attaching!;
  const bad = status === 'unavailable' || status === 'error';

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center p-8"
      data-testid="perspective-attach-notice"
      data-status={status}
    >
      <div className="max-w-md space-y-2 text-center">
        <div
          className={
            bad
              ? 'text-[14px] font-semibold text-[color:var(--ds-accent-negative)]'
              : 'text-[14px] font-semibold text-[color:var(--ds-text-primary)]'
          }
        >
          {copy.title}
        </div>
        <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          {copy.body}
        </p>
        {reason && (
          <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] px-3 py-2 text-left text-[11px] text-[color:var(--ds-text-secondary)]">
            {reason}
          </pre>
        )}
      </div>
    </div>
  );
}
