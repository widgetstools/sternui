import { Copy, Info } from 'lucide-react';
import { Button } from '@starui/ui';
import { FormatPopover } from '../format-editor';
import { EXCEL_EXAMPLES } from './excelExamples';

/**
 * Info popover with categorised Excel format examples. Clicking any
 * row populates the FormatterPicker's custom-format input via the
 * supplied callback AND closes this reference popover so the picker's
 * input gets immediate focus.
 *
 * Clipboard write happens too — a few users had complained that the
 * "click row" UX wasn't paste-elsewhere-friendly, and the cost is one
 * `navigator.clipboard.writeText()` call per click.
 *
 * Width is deliberately 420px — wide enough that long formats like
 * `[>0][Green]▲0.00;[<0][Red]▼0.00;0.00` don't wrap mid-token.
 */
export function ExcelReferencePopover({
  onPick,
  'data-testid': testId,
}: {
  onPick: (format: string) => void;
  'data-testid'?: string;
}) {
  return (
    <FormatPopover
      width={420}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Excel format reference"
          data-testid={testId}
          className="h-6 w-6 shrink-0 rounded-[2px] border-[var(--ds-border-secondary)] bg-[var(--ds-surface-ground)] p-0 text-[var(--ds-text-muted)] shadow-none hover:bg-[var(--ds-surface-tertiary)]"
        >
          <Info size={12} strokeWidth={1.75} />
        </Button>
      }
    >
      {({ close }) => {
        const handleCopy = (format: string) => {
          // Swallow rejections — clipboard can fail on http:// origins, etc.
          void navigator.clipboard?.writeText(format).catch(() => {});
          onPick(format);
          close();
        };
        return (
      <div
        style={{
          padding: 8,
          maxHeight: 420,
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
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => copyable && handleCopy(ex.format)}
                      disabled={!copyable}
                      className="h-auto w-full grid grid-cols-[150px_1fr_auto] items-center gap-2 rounded-[2px] border border-transparent bg-transparent p-1 px-1.5 text-left text-[11px] font-[inherit] text-[var(--ds-text-primary)] shadow-none hover:bg-[var(--ds-surface-tertiary)] disabled:cursor-default disabled:opacity-100"
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
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
        );
      }}
    </FormatPopover>
  );
}
