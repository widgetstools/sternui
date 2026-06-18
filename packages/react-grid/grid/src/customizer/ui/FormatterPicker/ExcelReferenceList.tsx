import { Copy } from 'lucide-react';
import { EXCEL_EXAMPLES } from './excelExamples';
import { ChromeButton } from '../ChromeButton';

/**
 * Categorised Excel-format example list. Pure presentation — the
 * scrollable body shared by both the inline-anchored
 * `ExcelReferencePopover` (editor presentation) and the compact
 * picker's inline-expanded reference panel (which avoids a second
 * floating portal stacked on top of the picker popover).
 *
 * Clicking a row copies the format to the clipboard and calls `onPick`.
 * The caller decides what happens next (close the popover, collapse the
 * inline panel, …).
 */
export function ExcelReferenceList({
  onPick,
  maxHeight = 420,
}: {
  onPick: (format: string) => void;
  /** Cap the scroll height. Editor popover uses the default 420; the
   *  compact inline panel passes a smaller value so it doesn't crowd
   *  the preset grid above it. */
  maxHeight?: number;
}) {
  const handleCopy = (format: string) => {
    // Swallow rejections — clipboard can fail on http:// origins, etc.
    void navigator.clipboard?.writeText(format).catch(() => {});
    onPick(format);
  };
  return (
    <div
      style={{
        padding: 8,
        maxHeight,
        overflowY: 'auto',
        background: 'var(--ds-surface-primary)',
        fontFamily: 'var(--ds-font-sans)',
        scrollbarColor: 'var(--ds-border-primary) transparent',
        scrollbarWidth: 'thin',
      }}
    >
      {EXCEL_EXAMPLES.map((cat) => (
        <section key={cat.title} style={{ marginBottom: 10 }}>
          <h4
            style={{
              margin: '6px 4px 4px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ds-text-muted)',
            }}
          >
            {cat.title}
          </h4>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
            {cat.examples.map((ex) => {
              const id = `${cat.title}:${ex.format}`;
              const copyable = !ex.format.startsWith('—');
              return (
                <li key={id}>
                  <ChromeButton
                    type="button"
                    onClick={() => copyable && handleCopy(ex.format)}
                    disabled={!copyable}
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: '150px 1fr auto',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 6px',
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 2,
                      cursor: copyable ? 'pointer' : 'default',
                      textAlign: 'left',
                      color: 'var(--ds-text-primary)',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      transition: 'background 100ms, border-color 100ms',
                    }}
                    onMouseEnter={(e) => {
                      if (copyable) {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          'var(--ds-surface-tertiary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }}
                  >
                    <span style={{ color: 'var(--ds-text-secondary)' }}>{ex.label}</span>
                    <code
                      style={{
                        fontFamily: 'var(--ds-font-mono)',
                        fontSize: 11,
                        color: 'var(--ds-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ex.format}
                    </code>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        color: 'var(--ds-text-muted)',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--ds-font-mono)' }}>{ex.sample}</span>
                      {copyable ? (
                        <Copy size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
                      ) : null}
                    </span>
                  </ChromeButton>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
