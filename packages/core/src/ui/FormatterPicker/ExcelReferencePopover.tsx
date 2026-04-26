import { Copy, Info } from 'lucide-react';
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
        <button
          type="button"
          title="Excel format reference"
          data-testid={testId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            background: 'var(--ck-bg, var(--bn-bg))',
            border: '1px solid var(--ck-border-hi, var(--bn-border))',
            borderRadius: 2,
            color: 'var(--ck-t2, var(--bn-t2))',
            cursor: 'pointer',
          }}
        >
          <Info size={12} strokeWidth={1.75} />
        </button>
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
        className="gc-excel-ref-scroll"
        style={{
          padding: 8,
          maxHeight: 420,
          overflowY: 'auto',
          // Token-backed opaque background. FormatPopover's Content
          // above already provides a solid surface; pinning it here
          // too means this specific scroll container stays opaque
          // even if someone later swaps the inner container for a
          // bespoke portal.
          background: 'var(--gc-surface, var(--bn-bg1, #161a1e))',
          fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
          // Theme-aware scrollbar. `scrollbar-color` / `scrollbar-width`
          // are native CSS properties honoured by Firefox and modern
          // Chromium/Safari — the thumb picks up our `--gc-border`
          // token which already swaps between light / dark with the
          // host app's theme (via `--bn-border*` underneath). No
          // `color-scheme` override — pinning it to one scheme would
          // fight the host when the user toggles between modes.
          scrollbarColor: 'var(--gc-border, #313944) transparent',
          scrollbarWidth: 'thin',
        }}
      >
        {EXCEL_EXAMPLES.map((cat) => (
          <section key={cat.title} style={{ marginBottom: 10 }}>
            <h4
              style={{
                margin: '6px 4px 4px',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ck-t2, var(--bn-t2))',
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
                    <button
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
                        color: 'var(--ck-t0, var(--bn-t0))',
                        fontFamily: 'inherit',
                        fontSize: 11,
                        transition: 'background 100ms, border-color 100ms',
                      }}
                      onMouseEnter={(e) => {
                        if (copyable) {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'var(--ck-surface-hover, var(--bn-bg3, #1e2329))';
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ color: 'var(--ck-t1, var(--bn-t0))' }}>{ex.label}</span>
                      <code
                        style={{
                          fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
                          fontSize: 11,
                          color: 'var(--ck-green, var(--bn-blue))',
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
                          color: 'var(--ck-t2, var(--bn-t2))',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--ck-font-mono)' }}>{ex.sample}</span>
                        {copyable ? (
                          <Copy size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
                        ) : null}
                      </span>
                    </button>
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
