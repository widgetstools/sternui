/**
 * HelpPanel — an in-app cheatsheet for Excel format strings, expression
 * syntax, and trading-specific recipes. Rendered inside the SettingsSheet
 * body when the user clicks the Help icon in the sheet's title bar.
 *
 * Content mirrors `docs/FORMATS_AND_EXPRESSIONS.md` — the markdown doc is
 * the source of truth for anyone browsing on GitHub; this component is
 * the same content rendered inline so users never have to leave the app.
 * Keep the two in lockstep when editing.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
// Static-layout styles — AUDIT i5 partial migration. Button/hover state
// styles stay inline (see HelpPanel.css for rationale).
import './HelpPanel.css';

type SectionId =
  | 'overview'
  | 'excel'
  | 'trading'
  | 'expressions'
  | 'traffic-light'
  | 'emojis';

const SECTIONS: Array<{ id: SectionId; title: string }> = [
  { id: 'overview', title: 'Overview' },
  { id: 'excel', title: '1. Excel Format Strings' },
  { id: 'trading', title: '2. Trading-Specific Formats' },
  { id: 'expressions', title: '3. Expression Syntax' },
  { id: 'traffic-light', title: '4. Traffic Light Walkthrough' },
  { id: 'emojis', title: '5. Emoji Gallery' },
];

export function HelpPanel() {
  const [active, setActive] = useState<SectionId>('overview');
  return (
    <div data-testid="v2-settings-help" className="gc-help-shell">
      {/* Section rail */}
      <nav className="gc-help-nav">
        {SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              data-testid={`help-nav-${s.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                width: '100%',
                padding: '7px 10px',
                border: 'none',
                borderRadius: 4,
                background: on
                  ? 'color-mix(in srgb, var(--ck-green) 10%, transparent)'
                  : 'transparent',
                color: on ? 'var(--ck-green)' : 'var(--ck-t1)',
                fontSize: 11,
                fontWeight: on ? 600 : 450,
                letterSpacing: 0.12,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 120ms, color 120ms',
              }}
            >
              <ChevronRight
                size={10}
                strokeWidth={2}
                style={{
                  opacity: on ? 1 : 0.5,
                  transform: on ? 'translateX(0)' : 'translateX(-3px)',
                  transition: 'transform 120ms, opacity 120ms',
                }}
              />
              {s.title}
            </button>
          );
        })}
        <div className="gc-help-nav-footer">
          Full reference:
          <br />
          <code>docs/FORMATS_AND_EXPRESSIONS.md</code>
        </div>
      </nav>

      {/* Content pane */}
      <section
        data-testid="help-content"
        className="gc-help-content"
        style={{ padding: '20px 28px 32px', fontSize: 12.5, lineHeight: 1.6 }}
      >
        {active === 'overview' && <Overview onNav={setActive} />}
        {active === 'excel' && <ExcelSection />}
        {active === 'trading' && <TradingSection />}
        {active === 'expressions' && <ExpressionsSection />}
        {active === 'traffic-light' && <TrafficLightSection />}
        {active === 'emojis' && <EmojiSection />}
      </section>
    </div>
  );
}

// ─── Presentational primitives ───────────────────────────────────────────

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 0.2,
        margin: '0 0 4px',
        color: 'var(--ck-t0)',
      }}
    >
      {children}
    </h1>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: 0.15,
        margin: '24px 0 8px',
        color: 'var(--ck-t0)',
        borderBottom: '1px solid var(--ck-border)',
        paddingBottom: 4,
      }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.2,
        margin: '18px 0 6px',
        color: 'var(--ck-t1)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="gc-help-p">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        background: 'var(--ck-bg)',
        border: '1px solid var(--ck-border)',
        fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
        fontSize: 11,
      }}
    >
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        margin: '8px 0 14px',
        padding: '10px 12px',
        borderRadius: 4,
        background: 'var(--ck-bg)',
        border: '1px solid var(--ck-border)',
        fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
        fontSize: 11,
        lineHeight: 1.55,
        color: 'var(--ck-t0)',
        overflowX: 'auto',
      }}
    >
      {children}
    </pre>
  );
}

function Table({ rows, cols }: { cols: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        margin: '10px 0 14px',
        fontSize: 11,
      }}
    >
      <thead>
        <tr>
          {cols.map((c) => (
            <th
              key={c}
              style={{
                textAlign: 'left',
                padding: '6px 8px',
                borderBottom: '1px solid var(--ck-border-hi)',
                fontWeight: 600,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.25,
                color: 'var(--ck-t2)',
                background: 'var(--ck-surface)',
              }}
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
                style={{
                  padding: '5px 8px',
                  borderBottom: '1px solid var(--ck-border)',
                  verticalAlign: 'top',
                  color: 'var(--ck-t0)',
                }}
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

// ─── Section bodies ──────────────────────────────────────────────────────

function Overview({ onNav }: { onNav: (id: SectionId) => void }) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
        {SECTIONS.filter((s) => s.id !== 'overview').map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onNav(s.id)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              border: '1px solid var(--ck-border)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--ck-t0)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'border-color 120ms, background 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--ck-green-dim)';
              e.currentTarget.style.background = 'var(--ck-green-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--ck-border)';
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

function ExcelSection() {
  return (
    <>
      <H1>1. Excel Format Strings</H1>
      <P>
        Powered by SSF (SheetJS Format), which gives full Excel parity for numbers,
        currencies, percentages, dates, and conditional sections.
      </P>

      <H2>Anatomy</H2>
      <P>Up to four sections separated by <Code>;</Code>:</P>
      <Pre>positive ; negative ; zero ; text</Pre>
      <P>
        With <strong>conditional sections</strong>, swap the positive/negative/zero
        test for value-equality or range tests:
      </P>
      <Pre>[condition1]section1 ; [condition2]section2 ; default</Pre>
      <P>
        Supported conditions: <Code>[&gt;N]</Code> <Code>[&gt;=N]</Code>{' '}
        <Code>[&lt;N]</Code> <Code>[&lt;=N]</Code> <Code>[=N]</Code>{' '}
        <Code>[&lt;&gt;N]</Code> where <Code>N</Code> is a literal number.
      </P>

      <H2>Numbers</H2>
      <Table
        cols={['Format', 'Input', 'Rendered']}
        rows={[
          [<Code>0</Code>, '1234.5', '1235'],
          [<Code>0.00</Code>, '1234.5', '1234.50'],
          [<Code>#,##0</Code>, '1234567', '1,234,567'],
          [<Code>#,##0.00</Code>, '1234567.89', '1,234,567.89'],
          [<Code>0%</Code>, '0.125', '13%'],
          [<Code>0.00%</Code>, '0.12345', '12.35%'],
          [<Code>0.00E+00</Code>, '12345', '1.23E+04'],
          [<Code>#,##0,</Code>, '1234567', '1,235 (thousands)'],
          [<Code>#,##0,,</Code>, '1234567890', '1,235 (millions)'],
          [<Code>#,##0,,,</Code>, '1234567890123', '1,235 (billions)'],
        ]}
      />

      <H2>Currencies</H2>
      <P>
        <Code>$</Code> and <Code>€</Code> can be used raw. Other symbols{' '}
        (<Code>£ ¥ ₹ CHF</Code>) must be wrapped in quotes — SSF otherwise
        rejects them.
      </P>
      <Table
        cols={['Format', 'Rendered']}
        rows={[
          [<Code>{'$#,##0.00'}</Code>, '$1,234.50'],
          [<Code>{'€#,##0.00'}</Code>, '€1,234.50'],
          [<Code>{'"£"#,##0.00'}</Code>, '£1,234.50'],
          [<Code>{'"¥"#,##0'}</Code>, '¥1,235'],
          [<Code>{'"CHF "#,##0.00'}</Code>, 'CHF 1,234.50'],
        ]}
      />

      <H2>Negatives</H2>
      <Table
        cols={['Format', '-1234.56 renders as']}
        rows={[
          [<Code>{'#,##0.00;-#,##0.00'}</Code>, '-1,234.56'],
          [<Code>{'#,##0.00;(#,##0.00)'}</Code>, '(1,234.56)'],
          [<Code>{'[Red]#,##0.00;[Red](#,##0.00)'}</Code>, '(1,234.56) in red'],
          [<Code>{'[Green]+#,##0;[Red]-#,##0'}</Code>, '-1,235 in red with sign'],
        ]}
      />

      <H2>Conditional sections</H2>
      <Table
        cols={['Format', 'Behavior']}
        rows={[
          [<Code>{'[>100]0;0.00'}</Code>, 'Integer when ≥ 100, 2dp otherwise'],
          [<Code>{'[>=1000000]0.0,,"M";0'}</Code>, 'Compact "million" suffix over 1M'],
          [<Code>{'[=1]"Green";[=0]"Off"'}</Code>, 'Enum mapping for 0/1 switch'],
          [<Code>{'[>0]"▲" 0.00;[<0]"▼" 0.00;0'}</Code>, 'Up/down arrows with number'],
          [<Code>{'[=1]"🟢";[=2]"🟡";[=3]"🔴"'}</Code>, 'Traffic-light emoji map'],
        ]}
      />

      <H2>Dates</H2>
      <P>
        Date values must be <Code>Date</Code> objects or ISO-8601 strings
        (starting with <Code>yyyy-mm-dd</Code>).
      </P>
      <Table
        cols={['Format', 'Rendered (2026-04-18 14:30)']}
        rows={[
          [<Code>yyyy-mm-dd</Code>, '2026-04-18'],
          [<Code>dd/mm/yyyy</Code>, '18/04/2026'],
          [<Code>mm/dd/yyyy</Code>, '04/18/2026'],
          [<Code>dd-mmm-yyyy</Code>, '18-Apr-2026'],
          [<Code>{'yyyy-mm-dd hh:mm'}</Code>, '2026-04-18 14:30'],
          [<Code>{'hh:mm AM/PM'}</Code>, '02:30 PM'],
          [<Code>{'dddd, mmmm dd, yyyy'}</Code>, 'Saturday, April 18, 2026'],
        ]}
      />

      <H2>Colors</H2>
      <P>
        Supported tags: <Code>[Black]</Code> <Code>[Blue]</Code> <Code>[Cyan]</Code>{' '}
        <Code>[Green]</Code> <Code>[Magenta]</Code> <Code>[Red]</Code>{' '}
        <Code>[White]</Code> <Code>[Yellow]</Code>. Apply to a single section:
      </P>
      <Pre>[Green]#,##0.00;[Red](#,##0.00)</Pre>
    </>
  );
}

function TradingSection() {
  return (
    <>
      <H1>2. Trading-Specific Formats</H1>

      <H2>Basis points</H2>
      <Table
        cols={['Format', 'Use case']}
        rows={[
          [<Code>{'0" bps"'}</Code>, '150 bps'],
          [<Code>{'+#,##0" bps";-#,##0" bps"'}</Code>, 'Signed bps change'],
          [<Code>{'0.0" bps"'}</Code>, 'Fractional bps'],
          [<Code>{'[Green]+0.0" bps";[Red]-0.0" bps"'}</Code>, 'Yield change colored'],
        ]}
      />

      <H2>Bond tick prices</H2>
      <P>
        Full Excel doesn't support tick prices (32nds, 64ths, etc). We ship a
        native <Code>kind: 'tick'</Code> formatter with five tokens — pick them
        from the Formatting Toolbar's tick menu.
      </P>
      <Table
        cols={['Token', 'Decimal', 'Rendered']}
        rows={[
          [<Code>TICK32</Code>, '101.5', '101-16 (16/32)'],
          [<Code>TICK32_PLUS</Code>, '101.515625', '101-16+ (sub-tick)'],
          [<Code>TICK64</Code>, '101.25', '101-16 (16/64)'],
          [<Code>TICK128</Code>, '101.125', '101-16 (16/128)'],
          [<Code>TICK256</Code>, '101.0625', '101-16 (16/256)'],
        ]}
      />

      <H2>Prices &amp; yields</H2>
      <Table
        cols={['Format', 'Use case']}
        rows={[
          [<Code>0.0000</Code>, 'FX major pairs, 4 decimals'],
          [<Code>0.00000</Code>, 'Precious metals, 5 decimals'],
          [<Code>{'0.00" pct"'}</Code>, 'Bond price as pct-of-par'],
          [<Code>{'0.000"%"'}</Code>, 'Yield'],
          [<Code>{'#,##0.00000000" BTC"'}</Code>, 'Crypto 8-decimal'],
        ]}
      />

      <H2>Order side &amp; status</H2>
      <Table
        cols={['Format', 'Use case']}
        rows={[
          [<Code>{'[="BUY"]"▲ BUY";[="SELL"]"▼ SELL";@'}</Code>, 'Side with arrows'],
          [<Code>{'[="BUY"][Green]@;[="SELL"][Red]@'}</Code>, 'Color-coded side'],
          [<Code>{'[>=100]"AT PAR";[<100]"DISCOUNT"'}</Code>, 'Price vs par'],
          [<Code>{'[=1]"PRICED";[=0]"PENDING"'}</Code>, 'Lifecycle boolean'],
          [<Code>{'[>0]"LONG " 0;[<0]"SHORT " 0'}</Code>, 'Position direction'],
        ]}
      />

      <H2>Compact notional</H2>
      <Table
        cols={['Format', '1,234,567,890 renders']}
        rows={[
          [<Code>#,##0,,</Code>, '1,235 (millions)'],
          [<Code>{'#,##0.00,,"M"'}</Code>, '1,234.57M'],
          [<Code>{'#,##0,,,'}</Code>, '1 (billions)'],
          [<Code>{'#,##0.00,,,"B"'}</Code>, '1.23B'],
        ]}
      />

      <H2>P&amp;L painting</H2>
      <Table
        cols={['Format', 'Behavior']}
        rows={[
          [<Code>{'[Green]+#,##0;[Red]-#,##0;0'}</Code>, 'Daily P&L with sign + color'],
          [
            <Code>{'[Green]+#,##0.00" USD";[Red]-#,##0.00" USD"'}</Code>,
            'Currency-tagged P&L',
          ],
        ]}
      />
    </>
  );
}

function ExpressionsSection() {
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

// ─── Emoji gallery helpers ──────────────────────────────────────────────

/**
 * Renders an emoji grid where each tile is click-to-copy. On click we
 * drop the raw character onto the clipboard and flash a "copied" label
 * for 900ms so the user knows it worked. Keeps the same layout on both
 * dark and light themes.
 */
function EmojiGrid({ items }: { items: Array<{ emoji: string; label: string }> }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // Keep the flash timer in a ref so the unmount effect can clear it — avoids
  // the StrictMode "setState on unmounted component" warning when the help
  // panel is dismissed while the 900ms flash is still running.
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
        gap: 6,
        margin: '8px 0 16px',
      }}
    >
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
              background: copied ? 'var(--ck-green-bg, rgba(45,212,191,0.12))' : 'var(--ck-bg)',
              border: '1px solid',
              borderColor: copied ? 'var(--ck-green)' : 'var(--ck-border)',
              borderRadius: 4,
              color: 'var(--ck-t0)',
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
                color: copied ? 'var(--ck-green)' : 'var(--ck-t2)',
                textAlign: 'center',
                fontFamily: 'var(--ck-font-mono, monospace)',
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

function TrafficLightSection() {
  return (
    <>
      <H1>4. Traffic Light — End-to-End</H1>
      <P>
        Full example combining a calculated column, Excel conditional-format
        sections, and a custom aggregation expression. This is the reference
        pattern for any "classify → show icon → aggregate upward" use case.
      </P>

      <H2>What we're building</H2>
      <P>
        Each order gets a red / amber / green indicator based on price. At{' '}
        <strong>group row level</strong>, aggregate up:
      </P>
      <Table
        cols={['Condition', 'Value', 'Icon']}
        rows={[
          [<Code>{'price >= 105'}</Code>, '1', '🟢 green'],
          [<Code>{'95 ≤ price < 105'}</Code>, '2', '🟡 amber'],
          [<Code>{'price < 95'}</Code>, '3', '🔴 red'],
          ['All children green', '1', '🟢'],
          ['All children red', '3', '🔴'],
          ['Any mix', '2', '🟡'],
        ]}
      />

      <H2>Step 1 — Add a calculated column</H2>
      <P>
        Settings → Calculated Columns → <strong>+ Add</strong>
      </P>
      <P>Name: <Code>Traffic Light</Code>, id: <Code>trafficlight</Code></P>
      <P>Expression:</P>
      <Pre>{'IFS([price] >= 105, 1, [price] >= 95, 2, 3)'}</Pre>

      <H2>Step 2 — Render the emoji at row level</H2>
      <P>
        Column Settings → Traffic Light → <strong>06 VALUE FORMAT</strong> →
        Custom Excel Format:
      </P>
      <Pre>[=1]&quot;🟢&quot;;[=2]&quot;🟡&quot;;[=3]&quot;🔴&quot;</Pre>

      <H2>Step 3 — Center the cell</H2>
      <P>
        Column Settings → Traffic Light → <strong>04 CELL STYLE → Alignment</strong>{' '}
        → <Code>Center</Code>
      </P>

      <H2>Step 4 — Custom aggregation</H2>
      <P>
        Column Settings → Traffic Light → <strong>08 ROW GROUPING</strong> →
        Agg Function = <Code>Custom expression…</Code>:
      </P>
      <Pre>{`IFS(
  MIN([value]) = 1 AND MAX([value]) = 1, 1,
  MIN([value]) = 3 AND MAX([value]) = 3, 3,
  2
)`}</Pre>
      <P>
        This is a 5-arg <Code>IFS</Code>: two condition/value pairs + trailing
        default (odd arg count = last-is-default). If neither "all 1s" nor
        "all 3s" matches → returns <Code>2</Code> → amber.
      </P>

      <H2>Step 5 — Group the grid</H2>
      <P>
        Drag <Code>Desk</Code> and <Code>Counterparty</Code> into the Row
        Groups tool panel (or set <Code>rowGroup: true</Code> +{' '}
        <Code>rowGroupIndex</Code> on each via the ROW GROUPING band).
      </P>

      <H2>Under the hood</H2>
      <Table
        cols={['Level', 'Input', 'Output', 'Rendered']}
        rows={[
          ['Leaf (price=110)', '—', '1', '🟢'],
          ['Leaf (price=98)', '—', '2', '🟡'],
          ['Leaf (price=90)', '—', '3', '🔴'],
          ['Sub-group (all greens)', '[1,1,1,1]', '1', '🟢'],
          ['Sub-group (all reds)', '[3,3]', '3', '🔴'],
          ['Sub-group (mixed)', '[1,3,2]', '2', '🟡'],
          ['Parent group', '[1,3,2] (child aggs)', '2', '🟡'],
        ]}
      />
      <P>
        Aggregation is <strong>hierarchical</strong> — each level's inputs are
        the aggregated results from the level below, not raw leaf values.
        That's why the classifier works recursively: a mix at any level
        produces <Code>2</Code> → amber, which propagates up.
      </P>

      <H2>Variations</H2>

      <H3>Reverse the scale (red = high)</H3>
      <Pre>{'IFS([price] >= 105, 3, [price] >= 95, 2, 1)'}</Pre>

      <H3>5-level granularity</H3>
      <Pre>{`IFS(
  [price] >= 110, 5,
  [price] >= 105, 4,
  [price] >= 100, 3,
  [price] >=  95, 2,
              1
)`}</Pre>
      <P>Excel format:</P>
      <Pre>{'[=5]"🟢🟢";[=4]"🟢";[=3]"🟡";[=2]"🟠";[=1]"🔴"'}</Pre>

      <H3>Status-based instead of price-based</H3>
      <Pre>{`SWITCH([status],
  "FILLED",    1,
  "PARTIAL",   2,
  "CANCELLED", 3,
  "REJECTED",  3,
  2)`}</Pre>

      <H2>Troubleshooting</H2>
      <Table
        cols={['Symptom', 'Fix']}
        rows={[
          [
            'Group rows show empty Traffic Light cells',
            <>Fixed in commit <Code>6b4f112</Code>. Virtual columns now return <Code>node.aggData[colId]</Code> for group rows so the aggregate value surfaces.</>,
          ],
          [
            "Excel format doesn't turn on",
            'Did you save via the Column Settings SAVE pill? Typing into the field is only a draft.',
          ],
          [
            'Aggregation returns null',
            <>IFS with an even arg count has <strong>no default</strong>. Add a trailing default to make it odd, or append <Code>true, X</Code> as the last pair.</>,
          ],
        ]}
      />
    </>
  );
}

function EmojiSection() {
  return (
    <>
      <H1>5. Emoji Gallery</H1>
      <P>
        Every emoji here is a single Unicode string. Click a tile to copy it to
        the clipboard, then paste into an Excel format or expression:
      </P>
      <Pre>{`// in a custom Excel format
[=1]"🟢";[=2]"🟡";[=3]"🔴"

// in a calc-column expression
IFS([price] >= 105, "🟢", [price] >= 95, "🟡", "🔴")

// mixed with text via CONCAT
CONCAT("📈 ", [security], " ", [side])`}</Pre>
      <p style={{ margin: '6px 0', color: 'var(--ck-t2)', fontSize: 11 }}>
        <strong>Tip:</strong> when you need group-row aggregation, use a
        numeric 1 / 2 / 3 (or N / S / E / W, etc.) from the expression and let
        the Excel format render the emoji — see the Traffic Light walkthrough.
        Lexicographic MIN / MAX on emoji strings isn't semantically meaningful.
      </p>

      <H2>Traffic lights &amp; status circles</H2>
      <EmojiGrid
        items={[
          { emoji: '🟢', label: 'green' },
          { emoji: '🟡', label: 'yellow' },
          { emoji: '🟠', label: 'orange' },
          { emoji: '🔴', label: 'red' },
          { emoji: '🟣', label: 'purple' },
          { emoji: '🔵', label: 'blue' },
          { emoji: '🟤', label: 'brown' },
          { emoji: '⚫', label: 'black' },
          { emoji: '⚪', label: 'white' },
        ]}
      />

      <H2>Directional arrows</H2>
      <EmojiGrid
        items={[
          { emoji: '▲', label: 'up-tri' },
          { emoji: '▼', label: 'down-tri' },
          { emoji: '◀', label: 'left-tri' },
          { emoji: '▶', label: 'right-tri' },
          { emoji: '⬆', label: 'up' },
          { emoji: '⬇', label: 'down' },
          { emoji: '⬅', label: 'left' },
          { emoji: '➡', label: 'right' },
          { emoji: '↗', label: 'NE' },
          { emoji: '↘', label: 'SE' },
          { emoji: '↙', label: 'SW' },
          { emoji: '↖', label: 'NW' },
          { emoji: '↔', label: 'h-flip' },
          { emoji: '↕', label: 'v-flip' },
          { emoji: '🔼', label: 'up-block' },
          { emoji: '🔽', label: 'down-block' },
          { emoji: '⤴', label: 'up-right-arr' },
          { emoji: '⤵', label: 'down-right-arr' },
          { emoji: '🔀', label: 'shuffle' },
          { emoji: '🔃', label: 'cycle' },
          { emoji: '🔄', label: 'recycle' },
        ]}
      />

      <H2>Check / cross / warning</H2>
      <EmojiGrid
        items={[
          { emoji: '✅', label: 'check' },
          { emoji: '❌', label: 'cross' },
          { emoji: '⚠️', label: 'warning' },
          { emoji: '🛑', label: 'stop-sign' },
          { emoji: '⛔', label: 'no-entry' },
          { emoji: '🚫', label: 'prohibited' },
          { emoji: '✔', label: 'check-mk' },
          { emoji: '✖', label: 'x-mk' },
          { emoji: '❎', label: 'neg-check' },
          { emoji: '❗', label: 'red-!' },
          { emoji: '❕', label: 'white-!' },
          { emoji: '❓', label: 'red-?' },
          { emoji: '❔', label: 'white-?' },
          { emoji: '✴️', label: '8-star' },
          { emoji: '✳️', label: '8-spoked' },
          { emoji: 'ℹ️', label: 'info' },
          { emoji: '⁉️', label: 'exclaim-?' },
          { emoji: '‼️', label: 'double-!' },
        ]}
      />

      <H2>Finance &amp; markets</H2>
      <EmojiGrid
        items={[
          { emoji: '📈', label: 'up-chart' },
          { emoji: '📉', label: 'down-chart' },
          { emoji: '📊', label: 'bar-chart' },
          { emoji: '💹', label: 'stock-up' },
          { emoji: '💰', label: 'moneybag' },
          { emoji: '💵', label: 'USD' },
          { emoji: '💴', label: 'JPY' },
          { emoji: '💶', label: 'EUR' },
          { emoji: '💷', label: 'GBP' },
          { emoji: '💸', label: 'flying-money' },
          { emoji: '💳', label: 'card' },
          { emoji: '🪙', label: 'coin' },
          { emoji: '💎', label: 'diamond' },
          { emoji: '🏦', label: 'bank' },
          { emoji: '🏛', label: 'classical' },
          { emoji: '💲', label: '$-sign' },
          { emoji: '🧾', label: 'receipt' },
        ]}
      />

      <H2>Signals &amp; alerts</H2>
      <EmojiGrid
        items={[
          { emoji: '🚀', label: 'rocket' },
          { emoji: '🔥', label: 'fire' },
          { emoji: '❄️', label: 'cold' },
          { emoji: '⚡', label: 'bolt' },
          { emoji: '💥', label: 'boom' },
          { emoji: '🎯', label: 'target' },
          { emoji: '🔔', label: 'bell-on' },
          { emoji: '🔕', label: 'bell-off' },
          { emoji: '🚨', label: 'siren' },
          { emoji: '🎉', label: 'party' },
          { emoji: '🏁', label: 'checker-flag' },
          { emoji: '⏳', label: 'hourglass' },
          { emoji: '⏰', label: 'alarm' },
          { emoji: '⏱', label: 'stopwatch' },
          { emoji: '⏲', label: 'timer' },
          { emoji: '🕰', label: 'mantel-clock' },
        ]}
      />

      <H2>Shapes</H2>
      <EmojiGrid
        items={[
          { emoji: '🔺', label: 'up-tri' },
          { emoji: '🔻', label: 'down-tri' },
          { emoji: '🔶', label: 'big-dia' },
          { emoji: '🔷', label: 'big-dia-blu' },
          { emoji: '🔸', label: 'sm-dia-orng' },
          { emoji: '🔹', label: 'sm-dia-blu' },
          { emoji: '🟥', label: 'red-sq' },
          { emoji: '🟧', label: 'orng-sq' },
          { emoji: '🟨', label: 'yel-sq' },
          { emoji: '🟩', label: 'grn-sq' },
          { emoji: '🟦', label: 'blu-sq' },
          { emoji: '🟪', label: 'prpl-sq' },
          { emoji: '🟫', label: 'brn-sq' },
          { emoji: '⬛', label: 'blk-sq' },
          { emoji: '⬜', label: 'wht-sq' },
          { emoji: '●', label: 'dot-blk' },
          { emoji: '○', label: 'dot-wht' },
          { emoji: '◉', label: 'bullseye' },
        ]}
      />

      <H2>Letters (enclosed)</H2>
      <EmojiGrid
        items={[
          { emoji: 'Ⓐ', label: '(A)' },
          { emoji: 'Ⓑ', label: '(B)' },
          { emoji: 'Ⓒ', label: '(C)' },
          { emoji: 'Ⓓ', label: '(D)' },
          { emoji: 'Ⓔ', label: '(E)' },
          { emoji: '🅰', label: 'A-red' },
          { emoji: '🅱', label: 'B-red' },
          { emoji: '🅾', label: 'O-red' },
          { emoji: '🅿', label: 'P-red' },
          { emoji: '🆎', label: 'AB' },
          { emoji: '🆑', label: 'CL' },
          { emoji: '🆒', label: 'COOL' },
          { emoji: '🆓', label: 'FREE' },
          { emoji: '🆔', label: 'ID' },
          { emoji: '🆕', label: 'NEW' },
          { emoji: '🆖', label: 'NG' },
          { emoji: '🆗', label: 'OK' },
          { emoji: '🆘', label: 'SOS' },
          { emoji: '🆙', label: 'UP!' },
          { emoji: '🆚', label: 'VS' },
          { emoji: 'Ⓜ', label: '(M)' },
        ]}
      />

      <H2>Numbers (enclosed)</H2>
      <EmojiGrid
        items={[
          { emoji: '0️⃣', label: '0' },
          { emoji: '1️⃣', label: '1' },
          { emoji: '2️⃣', label: '2' },
          { emoji: '3️⃣', label: '3' },
          { emoji: '4️⃣', label: '4' },
          { emoji: '5️⃣', label: '5' },
          { emoji: '6️⃣', label: '6' },
          { emoji: '7️⃣', label: '7' },
          { emoji: '8️⃣', label: '8' },
          { emoji: '9️⃣', label: '9' },
          { emoji: '🔟', label: '10' },
          { emoji: '#️⃣', label: 'hash' },
          { emoji: '*️⃣', label: 'star' },
        ]}
      />

      <H2>Currency symbols</H2>
      <EmojiGrid
        items={[
          { emoji: '₿', label: 'BTC' },
          { emoji: '$', label: 'USD' },
          { emoji: '€', label: 'EUR' },
          { emoji: '£', label: 'GBP' },
          { emoji: '¥', label: 'JPY / CNY' },
          { emoji: '₹', label: 'INR' },
          { emoji: '₩', label: 'KRW' },
          { emoji: '₪', label: 'ILS' },
          { emoji: '₱', label: 'PHP' },
          { emoji: '₴', label: 'UAH' },
          { emoji: '฿', label: 'THB' },
          { emoji: '₽', label: 'RUB' },
        ]}
      />

      <H2>Flags — G10 + majors</H2>
      <EmojiGrid
        items={[
          { emoji: '🇺🇸', label: 'USD' },
          { emoji: '🇬🇧', label: 'GBP' },
          { emoji: '🇪🇺', label: 'EUR' },
          { emoji: '🇯🇵', label: 'JPY' },
          { emoji: '🇨🇳', label: 'CNY' },
          { emoji: '🇭🇰', label: 'HKD' },
          { emoji: '🇹🇼', label: 'TWD' },
          { emoji: '🇰🇷', label: 'KRW' },
          { emoji: '🇸🇬', label: 'SGD' },
          { emoji: '🇮🇳', label: 'INR' },
          { emoji: '🇦🇺', label: 'AUD' },
          { emoji: '🇳🇿', label: 'NZD' },
          { emoji: '🇨🇦', label: 'CAD' },
          { emoji: '🇨🇭', label: 'CHF' },
          { emoji: '🇩🇪', label: 'DE' },
          { emoji: '🇫🇷', label: 'FR' },
          { emoji: '🇮🇹', label: 'IT' },
          { emoji: '🇪🇸', label: 'ES' },
          { emoji: '🇳🇱', label: 'NL' },
        ]}
      />

      <H2>Flags — EM &amp; ROW</H2>
      <EmojiGrid
        items={[
          { emoji: '🇲🇽', label: 'MXN' },
          { emoji: '🇧🇷', label: 'BRL' },
          { emoji: '🇦🇷', label: 'ARS' },
          { emoji: '🇨🇱', label: 'CLP' },
          { emoji: '🇨🇴', label: 'COP' },
          { emoji: '🇵🇪', label: 'PEN' },
          { emoji: '🇿🇦', label: 'ZAR' },
          { emoji: '🇹🇷', label: 'TRY' },
          { emoji: '🇸🇦', label: 'SAR' },
          { emoji: '🇦🇪', label: 'AED' },
          { emoji: '🇶🇦', label: 'QAR' },
          { emoji: '🇰🇼', label: 'KWD' },
          { emoji: '🇧🇭', label: 'BHD' },
          { emoji: '🇮🇱', label: 'ILS' },
          { emoji: '🇹🇭', label: 'THB' },
          { emoji: '🇮🇩', label: 'IDR' },
          { emoji: '🇲🇾', label: 'MYR' },
          { emoji: '🇵🇭', label: 'PHP' },
          { emoji: '🇻🇳', label: 'VND' },
        ]}
      />

      <H2>Weather (risk / volatility)</H2>
      <EmojiGrid
        items={[
          { emoji: '☀️', label: 'calm' },
          { emoji: '🌤', label: 'mostly-sun' },
          { emoji: '⛅', label: 'partly' },
          { emoji: '🌥', label: 'mostly-cloud' },
          { emoji: '☁️', label: 'cloudy' },
          { emoji: '🌦', label: 'sun-shower' },
          { emoji: '🌧', label: 'rain' },
          { emoji: '⛈', label: 'thunderstorm' },
          { emoji: '🌩', label: 'lightning' },
          { emoji: '🌨', label: 'snow' },
          { emoji: '❄️', label: 'cold' },
          { emoji: '☔', label: 'umbrella' },
          { emoji: '🌪', label: 'tornado' },
          { emoji: '🌫', label: 'foggy' },
          { emoji: '🌈', label: 'rainbow' },
        ]}
      />

      <H2>Desk tools</H2>
      <EmojiGrid
        items={[
          { emoji: '🖥', label: 'desktop' },
          { emoji: '💻', label: 'laptop' },
          { emoji: '📱', label: 'phone' },
          { emoji: '⌨️', label: 'kbd' },
          { emoji: '🖱', label: 'mouse' },
          { emoji: '🖨', label: 'printer' },
          { emoji: '📇', label: 'rolodex' },
          { emoji: '📋', label: 'clipboard' },
          { emoji: '📁', label: 'folder' },
          { emoji: '📂', label: 'open-folder' },
          { emoji: '🗂', label: 'divider' },
          { emoji: '🗃', label: 'box-files' },
          { emoji: '🗄', label: 'cabinet' },
          { emoji: '📎', label: 'paperclip' },
          { emoji: '📐', label: 'tri-ruler' },
          { emoji: '📏', label: 'ruler' },
          { emoji: '📑', label: 'tabs' },
          { emoji: '📒', label: 'ledger' },
          { emoji: '📓', label: 'notebook' },
          { emoji: '📕', label: 'red-book' },
          { emoji: '📗', label: 'green-book' },
          { emoji: '📘', label: 'blue-book' },
          { emoji: '📙', label: 'orange-book' },
        ]}
      />

      <H2>Security &amp; permissions</H2>
      <EmojiGrid
        items={[
          { emoji: '🔒', label: 'locked' },
          { emoji: '🔓', label: 'unlocked' },
          { emoji: '🔐', label: 'lock+key' },
          { emoji: '🔑', label: 'key' },
          { emoji: '🗝', label: 'old-key' },
          { emoji: '🛡', label: 'shield' },
          { emoji: '🛠', label: 'tools' },
          { emoji: '⚙️', label: 'gear' },
          { emoji: '🔧', label: 'wrench' },
          { emoji: '🔨', label: 'hammer' },
          { emoji: '⚒', label: 'hammer-pick' },
        ]}
      />

      <H2>Dashboard misc</H2>
      <EmojiGrid
        items={[
          { emoji: '🔍', label: 'magnify-L' },
          { emoji: '🔎', label: 'magnify-R' },
          { emoji: '🔖', label: 'bookmark' },
          { emoji: '📌', label: 'push-pin' },
          { emoji: '📍', label: 'location' },
          { emoji: '🚩', label: 'red-flag' },
          { emoji: '🏷', label: 'tag' },
          { emoji: '🎫', label: 'ticket' },
          { emoji: '🏆', label: 'trophy' },
          { emoji: '🥇', label: 'gold' },
          { emoji: '🥈', label: 'silver' },
          { emoji: '🥉', label: 'bronze' },
          { emoji: '🏅', label: 'medal' },
          { emoji: '🎖', label: 'military' },
          { emoji: '🎗', label: 'ribbon' },
          { emoji: '💡', label: 'idea' },
          { emoji: '🧠', label: 'brain' },
          { emoji: '🧭', label: 'compass' },
          { emoji: '🗺', label: 'map' },
        ]}
      />
    </>
  );
}
