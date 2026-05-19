/**
 * 4. Traffic Light Walkthrough — end-to-end example combining a
 * calculated column, Excel conditional-format sections, and a custom
 * aggregation expression. Includes variations and troubleshooting.
 */

import { Code, H1, H2, H3, P, Pre, Table } from './primitives';

export function TrafficLightSection() {
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
