/**
 * Shared presentational primitives used across HelpPanel sections.
 * Pure presentational — no state, no side effects. Tokens come from
 * the design system; Tailwind utilities handle layout.
 */

import type { ReactNode } from 'react';

export function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[18px] font-bold tracking-[0.2px] mb-1 text-foreground">
      {children}
    </h1>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[14px] font-semibold tracking-[0.15px] mt-6 mb-2 text-foreground border-b border-border pb-1">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-[0.2px] mt-[18px] mb-1.5 text-[var(--ds-text-secondary)] uppercase">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="ds-help-p">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="inline-block px-1.5 py-px rounded-[3px] bg-background border border-border font-mono text-[11px]">
      {children}
    </code>
  );
}

export function Pre({ children }: { children: ReactNode }) {
  return (
    <pre className="my-2 mb-3.5 px-3 py-2.5 rounded bg-background border border-border font-mono text-[11px] leading-[1.55] text-foreground overflow-x-auto">
      {children}
    </pre>
  );
}

export function Table({ rows, cols }: { cols: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <table className="w-full border-collapse my-2.5 mb-3.5 text-[11px]">
      <thead>
        <tr>
          {cols.map((c) => (
            <th
              key={c}
              className="text-left px-2 py-1.5 border-b border-[var(--ds-border-secondary)] font-semibold text-[10px] uppercase tracking-[0.25px] text-muted-foreground bg-[var(--ds-surface-secondary)]"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td
                key={j}
                className="px-2 py-[5px] border-b border-border align-top text-foreground"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
