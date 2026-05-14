/**
 * Overview — landing section of the HelpPanel. Lists the "where you use
 * each language" mapping and offers jump buttons to the other sections.
 * Receives `navigateTo` from the shell so its in-body buttons can
 * select another rail entry.
 */

import { SECTION_META } from './sectionMeta';
import { Code, H1, H2, P, Table } from './primitives';
import type { HelpSectionProps } from './types';

export function Overview({ navigateTo }: HelpSectionProps) {
  return (
    <>
      <H1>Formats &amp; Expressions Cookbook</H1>
      <P>
        Reference for the two mini-languages used across the grid customizer:{' '}
        <strong>Excel format strings</strong> (how a cell looks) and our{' '}
        <strong>expression syntax</strong> (what a cell is, plus conditional logic
        and aggregations).
      </P>

      <H2>Where you use each</H2>
      <Table
        cols={['Where', 'Language']}
        rows={[
          ['Formatting Toolbar → Format → Custom', <Code>Excel format</Code>],
          ['Column Settings → 06 VALUE FORMAT → Custom Excel Format', <Code>Excel format</Code>],
          ['Column Settings → 08 ROW GROUPING → Agg Function = custom', <Code>Expression (aggregation)</Code>],
          ['Calculated Columns → Expression', <Code>Expression (per row)</Code>],
          ['Conditional Styling → Rule expression', <Code>Expression (predicate)</Code>],
        ]}
      />

      <H2>Jump to a section</H2>
      <div className="flex flex-col gap-1 mt-1.5">
        {SECTION_META.filter((s) => s.id !== 'overview').map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigateTo(s.id)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              border: '1px solid var(--ds-border-primary)',
              borderRadius: 2,
              background: 'transparent',
              color: 'var(--ds-text-primary)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'border-color 120ms, background 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--ds-overlay-positive-ring)';
              e.currentTarget.style.background = 'var(--ds-overlay-positive-soft)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--ds-border-primary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {s.title}
          </button>
        ))}
      </div>

      <H2>Safety</H2>
      <P>
        Both languages are <strong>CSP-safe</strong> — no <Code>new Function()</Code>{' '}
        or <Code>eval</Code>. Formatters are parsed ahead of time by SSF; expressions run through
        a tokenizer → Pratt parser → tree-walking evaluator.
      </P>
    </>
  );
}
