/**
 * EmojiGrid — emoji tile grid with click-to-copy. Each tile flashes a
 * "copied!" label for 900ms after a successful clipboard write. The
 * timer is held in a ref and cleared on unmount so StrictMode doesn't
 * fire the "setState on unmounted component" warning when the help
 * panel is dismissed while a flash is still in-flight.
 */

import { useEffect, useRef, useState } from 'react';

export function EmojiGrid({ items }: { items: Array<{ emoji: string; label: string }> }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);
  const copy = async (emoji: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(emoji);
      setCopiedIdx(idx);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(
        () => setCopiedIdx((cur) => (cur === idx ? null : cur)),
        900,
      );
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <div className="grid gap-1.5 my-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
      {items.map((it, i) => {
        const copied = copiedIdx === i;
        return (
          <button
            key={`${it.emoji}-${i}`}
            type="button"
            onClick={() => copy(it.emoji, i)}
            title={`Copy ${it.emoji}  ·  ${it.label}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 6px 6px',
              background: copied ? 'var(--ds-overlay-positive-soft)' : 'var(--ds-surface-ground)',
              border: '1px solid',
              borderColor: copied ? 'var(--ds-accent-positive)' : 'var(--ds-border-primary)',
              borderRadius: 2,
              color: 'var(--ds-text-primary)',
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            <span
              style={{
                fontSize: 22,
                lineHeight: 1,
                fontFamily:
                  'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Twemoji Mozilla, EmojiOne Color, sans-serif',
              }}
            >
              {it.emoji}
            </span>
            <span
              style={{
                fontSize: 9,
                lineHeight: 1.2,
                color: copied ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)',
                textAlign: 'center',
                fontFamily: 'var(--ds-font-mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
              }}
            >
              {copied ? 'copied!' : it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
