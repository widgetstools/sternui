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
 * Pass a single chord or an array — useful for cross-platform toggles
 * (e.g. Alt+Shift+P on Windows/Linux and Option/Meta variants on macOS).
 *
 * Single chord only — sequences are out of scope (the data-plane
 * redesign explicitly chose a single chord for the toolbar reveal).
 */

import { useEffect, useRef } from 'react';

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

function matchesChord(ev: KeyboardEvent, parsed: ParsedChord): boolean {
  if (ev.shiftKey !== parsed.shift) return false;
  if (ev.ctrlKey !== parsed.ctrl) return false;
  if (ev.altKey !== parsed.alt) return false;
  if (ev.metaKey !== parsed.meta) return false;
  return ev.key.toLowerCase() === parsed.key;
}

export function useChordHotkey(
  chord: string | readonly string[],
  handler: (e: KeyboardEvent) => void,
  opts: { target?: HTMLElement | Document | null; enabled?: boolean } = {},
): void {
  // Hold the latest handler in a ref so callers can pass an inline
  // arrow without forcing the effect to re-run (and thereby remove +
  // re-add the keydown listener) on every render of the parent.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (opts.enabled === false) return;
    const target = opts.target ?? (typeof document !== 'undefined' ? document : null);
    if (!target) return;
    const parsedList = (Array.isArray(chord) ? chord : [chord]).map(parseChord);

    const listener = (e: Event) => {
      const ev = e as KeyboardEvent;
      for (const parsed of parsedList) {
        if (!matchesChord(ev, parsed)) continue;
        handlerRef.current(ev);
        return;
      }
    };
    target.addEventListener('keydown', listener);
    return () => target.removeEventListener('keydown', listener);
  }, [chord, opts.target, opts.enabled]);
}
