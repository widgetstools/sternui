/**
 * 3. Expression Syntax — column refs, literals, operators, built-in
 * function inventory, and trading examples for conditional styling,
 * calculated columns, and custom aggregations.
 */

import { Code, H1, H2, H3, P, Pre, Table } from './primitives';

export function ExpressionsSection() {
  return (
    <>
      <H1>3. Expression Syntax</H1>
      <P>
        Used by Conditional Styling (rule predicates), Calculated Columns
        (virtual column valueGetter), and Column Settings → Row Grouping →
        custom aggregation. All three share one engine — CSP-safe, tree-walking.
      </P>

      <H2>Column references</H2>
      <Table
        cols={['Syntax', 'Meaning']}
        rows={[
          [<Code>[price]</Code>, "Current row's price value"],
          [<Code>{'{price}'}</Code>, 'Alias — same as [price]'],
          [<Code>[value]</Code>, 'In custom agg: the array of child values AG-Grid feeds'],
        ]}
      />
      <P>
        Names with spaces or hyphens must use brackets: <Code>[order id]</Code>.
      </P>

      <H2>Literals &amp; operators</H2>
      <Table
        cols={['Category', 'Examples']}
        rows={[
          ['Number', <Code>42 3.14 -100 1e6</Code>],
          ['String', <Code>"BUY" 'SELL'</Code>],
          ['Boolean', <Code>true false</Code>],
          ['Null', <Code>null</Code>],
          ['Arithmetic', <Code>+ - * / %</Code>],
          ['Comparison', <Code>{'= == != > < >= <='}</Code>],
          ['Logical', <Code>AND && OR || NOT !</Code>],
          ['Membership', <Code>IN (a, b, c) BETWEEN a AND b</Code>],
          ['Ternary', <Code>cond ? then : else</Code>],
        ]}
      />
      <P>
        <strong>Keywords are case-sensitive</strong> — <Code>AND</Code>, <Code>OR</Code>,{' '}
        <Code>NOT</Code>, <Code>IN</Code>, <Code>BETWEEN</Code> must be UPPER,
        otherwise they're treated as column references.
      </P>

      <H2>Built-in functions (65+)</H2>
      <H3>Math</H3>
      <P>
        <Code>ABS</Code> <Code>ROUND</Code> <Code>FLOOR</Code> <Code>CEIL</Code>{' '}
        <Code>MOD</Code> <Code>POW</Code> <Code>SQRT</Code> <Code>LN</Code>{' '}
        <Code>LOG</Code> <Code>EXP</Code> <Code>SIGN</Code> <Code>TRUNC</Code>{' '}
        <Code>PI</Code>
      </P>

      <H3>Aggregation (column-aware)</H3>
      <P>
        When given a direct column reference, these operate on the whole column
        array (from <Code>ctx.allRows</Code>). In custom aggregations, use{' '}
        <Code>[value]</Code> to access the aggregate values array.
      </P>
      <P>
        <Code>SUM</Code> <Code>AVG</Code> <Code>MIN</Code> <Code>MAX</Code>{' '}
        <Code>COUNT</Code> <Code>DISTINCT_COUNT</Code> <Code>MEDIAN</Code>{' '}
        <Code>STDEV</Code> <Code>VARIANCE</Code>
      </P>

      <H3>Logical</H3>
      <Table
        cols={['Function', 'Purpose']}
        rows={[
          [<Code>{'IF(cond, then, else?)'}</Code>, 'Single-branch'],
          [<Code>{'IFS(cond1, val1, …, default?)'}</Code>, 'Multi-branch (first-truthy wins)'],
          [<Code>{'SWITCH(expr, case1, val1, …, default?)'}</Code>, 'Value-equality multi-branch'],
          [<Code>{'AND(a, b, …)'}</Code>, 'All-true'],
          [<Code>{'OR(a, b, …)'}</Code>, 'Any-true'],
          [<Code>NOT(x)</Code>, 'Negate'],
          [<Code>{'COALESCE(…)'}</Code>, 'First non-null'],
        ]}
      />
      <P>
        <Code>IFS</Code> with an <strong>odd</strong> arg count treats the last
        arg as the default. Even count means no default — falling through all
        conditions returns <Code>null</Code>.
      </P>

      <H3>String</H3>
      <P>
        <Code>CONCAT</Code> <Code>LEFT</Code> <Code>RIGHT</Code> <Code>MID</Code>{' '}
        <Code>LEN</Code> <Code>UPPER</Code> <Code>LOWER</Code> <Code>TRIM</Code>{' '}
        <Code>SUBSTITUTE</Code> <Code>SEARCH</Code> <Code>REPLACE</Code>{' '}
        <Code>STARTSWITH</Code> <Code>ENDSWITH</Code> <Code>CONTAINS</Code>
      </P>

      <H3>Date</H3>
      <P>
        <Code>TODAY</Code> <Code>NOW</Code> <Code>YEAR</Code> <Code>MONTH</Code>{' '}
        <Code>DAY</Code> <Code>HOUR</Code> <Code>MINUTE</Code> <Code>SECOND</Code>{' '}
        <Code>WEEKDAY</Code> <Code>DATE</Code> <Code>DAYS</Code> <Code>EDATE</Code>{' '}
        <Code>EOMONTH</Code> <Code>DATEDIFF</Code>
      </P>

      <H3>Type / coercion / lookup</H3>
      <P>
        <Code>ISBLANK</Code> <Code>ISNUMBER</Code> <Code>ISTEXT</Code> <Code>TYPE</Code>{' '}
        <Code>NUMBER</Code> <Code>TEXT</Code> <Code>BOOL</Code> <Code>LOOKUP</Code>{' '}
        <Code>VLOOKUP</Code>
      </P>

      <H2>Trading examples</H2>

      <H3>Conditional styling — highlight large filled buys</H3>
      <Pre>{'[side] = "BUY" AND [quantity] >= 10000 AND [status] = "FILLED"'}</Pre>

      <H3>Calculated column — notional</H3>
      <Pre>{'[quantity] * [price] / 100'}</Pre>

      <H3>Calculated column — high-yield classifier</H3>
      <Pre>{`IFS(
  [yield] >= 7, "JUNK",
  [yield] >= 5, "HIGH YIELD",
  [yield] >= 3, "INV GRADE",
  "LOW"
)`}</Pre>

      <H3>Calculated column — relative to cost basis</H3>
      <Pre>{'([price] - [costBasis]) / [costBasis] * 100'}</Pre>

      <H3>Calculated column — days to maturity</H3>
      <Pre>{'DAYS([maturityDate], TODAY())'}</Pre>

      <H3>Calculated column — classify vs dataset mean</H3>
      <Pre>{`IF([price] >= AVG([price]) * 1.05, 1,
   IF([price] >= AVG([price]) * 0.95, 2, 3))`}</Pre>

      <H3>Custom aggregation — weighted-average spread</H3>
      <Pre>{'SUM([value] * [quantity]) / SUM([quantity])'}</Pre>
    </>
  );
}
