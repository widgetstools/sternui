import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Info } from 'lucide-react';
import { FormatPopover } from '../format-editor';
import { EXCEL_EXAMPLES } from './excelExamples';

/**
 * Info popover with categorised Excel format examples. Clicking any
 * row copies the format string into the clipboard AND fires the
 * supplied callback so the FormatterPicker can paste it straight
 * into its custom-format input.
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Clear the 1200ms "copied" flash timer on unmount so we don't setState on
  // a gone component when the popover closes mid-flash.
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = (format: string, id: string) => {
    // Swallow rejections — clipboard can fail on http:// origins, etc.
    void navigator.clipboard?.writeText(format).catch(() => {});
    onPick(format);
    setCopiedId(id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(
      () => setCopiedId((prev) => (prev === id ? null : prev)),
      1200,
    );
  };

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
            background: 'var(--ck-bg, var(--background))',
            border: '1px solid var(--ck-border-hi, var(--border))',
            borderRadius: 2,
            color: 'var(--ck-t2, var(--muted-foreground))',
            cursor: 'pointer',
          }}
        >
          <Info size={12} strokeWidth={1.75} />
        </button>
      }
    >
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
          background: 'var(--gc-surface, var(--popover, #161a1e))',
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
                color: 'var(--ck-t2, var(--muted-foreground))',
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
                      onClick={() => copyable && handleCopy(ex.format, id)}
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
                        color: 'var(--ck-t0, var(--foreground))',
                        fontFamily: 'inherit',
                        fontSize: 11,
                        transition: 'background 100ms, border-color 100ms',
                      }}
                      onMouseEnter={(e) => {
                        if (copyable) {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'var(--ck-surface-hover, var(--accent, #1e2329))';
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ color: 'var(--ck-t1, var(--foreground))' }}>{ex.label}</span>
                      <code
                        style={{
                          fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
                          fontSize: 11,
                          color: 'var(--ck-green, var(--primary))',
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
                          color: 'var(--ck-t2, var(--muted-foreground))',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--ck-font-mono)' }}>{ex.sample}</span>
                        {copyable ? (
                          copiedId === id ? (
                            <Check size={11} strokeWidth={2} style={{ color: 'var(--ck-green)' }} />
                          ) : (
                            <Copy size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
                          )
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
    </FormatPopover>
  );
}
