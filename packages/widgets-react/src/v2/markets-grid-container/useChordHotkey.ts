/**
 * useChordHotkey — minimal keyboard chord listener.
 *
 * Doesn't depend on react-hotkeys-hook (not in this monorepo).
 * Watches keydown on a target element (or document by default) and
 * invokes the handler whenever the chord matches.
 *
 * Chord syntax: `'Shift+Ctrl+P'` → matches event with shiftKey,
 * ctrlKey, no metaKey, no altKey, and key === 'P' (case-insensitive).
 *
 * Single chord only — sequences are out of scope (the data-plane
 * redesign explicitly chose a single chord for the toolbar reveal).
 */

import { useEffect } from 'react';

interface ParsedChord {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function parseChord(chord: string): ParsedChord {
  const parts = chord.split('+').map((p) => p.trim().toLowerCase());
  return {
    shift: parts.includes('shift'),
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    alt: parts.includes('alt') || parts.includes('option'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    key: parts.find((p) => !['shift', 'ctrl', 'control', 'alt', 'option', 'meta', 'cmd', 'command'].includes(p)) ?? '',
  };
}

export function useChordHotkey(
  chord: string,
  handler: (e: KeyboardEvent) => void,
  opts: { target?: HTMLElement | Document | null; enabled?: boolean } = {},
): void {
  useEffect(() => {
    if (opts.enabled === false) return;
    const target = opts.target ?? (typeof document !== 'undefined' ? document : null);
    if (!target) return;
    const parsed = parseChord(chord);

    const listener = (e: Event) => {
      const ev = e as KeyboardEvent;
      if (ev.shiftKey !== parsed.shift) return;
      if (ev.ctrlKey !== parsed.ctrl) return;
      if (ev.altKey !== parsed.alt) return;
      if (ev.metaKey !== parsed.meta) return;
      if (ev.key.toLowerCase() !== parsed.key) return;
      handler(ev);
    };
    target.addEventListener('keydown', listener);
    return () => target.removeEventListener('keydown', listener);
  }, [chord, handler, opts.target, opts.enabled]);
}
