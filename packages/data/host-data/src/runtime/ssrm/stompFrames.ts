/**
 * STOMP frame-body classification for the SSRM ingest — pure.
 *
 * The stomp-view-server contract (and the prod brokers it mirrors)
 * ships three body shapes on one topic:
 *   • JSON array batches (snapshot AND live ticks),
 *   • a plain-text end-of-snapshot message matched by a configured
 *     case-insensitive substring token,
 *   • anything else (heartbeats, comments) — ignored.
 */

import type { SsrmRow } from './TableWriter.js';

export type FrameClass =
  | { kind: 'end' }
  | { kind: 'rows'; rows: SsrmRow[] }
  | { kind: 'ignore' };

/** Case-insensitive substring end-token match (wire-compatible with the CSRM provider). */
export function matchesEndToken(body: string, token: string | undefined): boolean {
  if (!token) return false;
  return body.toLowerCase().includes(token.toLowerCase());
}

/** Rows out of a parsed JSON body: array, `{rows: []}`, `{data: []}`, or single object. */
function extractRows(parsed: unknown): SsrmRow[] {
  if (Array.isArray(parsed)) return parsed.filter(isRow);
  if (!isRow(parsed)) return [];
  if (Array.isArray(parsed.rows)) return parsed.rows.filter(isRow);
  if (Array.isArray(parsed.data)) return parsed.data.filter(isRow);
  return [parsed];
}

function isRow(value: unknown): value is SsrmRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Classify one frame body. End-token is checked FIRST — the end
 * message is plain text on the same topic as the JSON batches.
 */
export function classifyFrame(body: string, endToken: string | undefined): FrameClass {
  const trimmed = body.trim();
  if (matchesEndToken(trimmed, endToken)) return { kind: 'end' };
  if (!trimmed) return { kind: 'ignore' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'ignore' };
  }
  const rows = extractRows(parsed);
  return rows.length > 0 ? { kind: 'rows', rows } : { kind: 'ignore' };
}
