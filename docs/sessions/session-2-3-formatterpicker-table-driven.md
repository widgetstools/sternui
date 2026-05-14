# Session 2.3 — Make `FormatterPicker` table-driven

You are a fresh agent session. Your task is to convert `FormatterPicker.tsx` (1002 LOC) from a column-type switch into a table-driven config. The picker JSX shrinks to ~300 LOC; the per-type config moves to a data table. Independent of any other session.

## Required reading

- [`packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.tsx`](../../packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.tsx) — target
- Look for the existing per-column-type branching (likely `switch (colType)` or `if (colType === 'number')` chains)
- [`CLAUDE.md`](../../CLAUDE.md) — naming + boundary

## Setup

```sh
git fetch origin main
git checkout -b feat/formatterpicker-table-driven origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

## Task

Identify the per-column-type configuration (which formatters are offered, their default options, their preview rendering) and move it from a `switch`/branching pattern into a `Record<ColumnType, FormatterTypeConfig>` table. The picker becomes a generic renderer over the table.

### Step 1 — Find the branches

```sh
grep -n "switch\|case '\|if (colType\|colType ===" packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.tsx | head -30
```

You should see something like:

```tsx
switch (colType) {
  case 'number':
    return <NumberFormatterOptions ... />;
  case 'date':
    return <DateFormatterOptions ... />;
  case 'currency':
    return <CurrencyFormatterOptions ... />;
  // ...
}
```

Or scattered conditionals like `colType === 'number' && <NumberFormatter />`. Map them all.

### Step 2 — Design the config shape

Create `packages/react/widgets/grid-react/src/ui/FormatterPicker/formattersByType.ts`:

```ts
/**
 * Per-column-type formatter configuration.
 *
 * Each column data type ('number' | 'string' | 'date' | 'currency' | …)
 * declares:
 *   - the list of formatters the user can choose
 *   - the default options each formatter starts with
 *   - a function that renders a preview given the formatter + options
 *
 * Before this refactor, FormatterPicker.tsx held all of this in a
 * tall `switch (colType)`. Adding a new column type meant touching
 * five places in the file. Now: append a row to FORMATTERS_BY_TYPE.
 */

// Column types as understood by MarketsGrid's grid-react layer.
// Add new ones here; the picker auto-handles them.
export type ColumnType = 'number' | 'string' | 'date' | 'currency' | 'percent' | 'boolean';

// All formatters supported across all column types.
// (Each ColumnType supports a subset — see FormatterTypeConfig.types.)
export type Formatter =
  | 'plain'
  | 'comma'
  | 'percent'
  | 'currency'
  | 'date-short'
  | 'date-long'
  | 'date-iso'
  | 'boolean-yesno'
  | 'boolean-check';

export interface FormatterOptions {
  readonly precision?: number;
  readonly thousands?: boolean;
  readonly currencyCode?: string;
  readonly dateFormat?: string;
  // Adapt to whatever options the existing code uses.
}

export interface FormatterTypeConfig {
  /** Formatters offered for this column type, in display order. */
  readonly types: readonly Formatter[];
  /** Default options for each offered formatter. */
  readonly defaults: Readonly<Partial<Record<Formatter, FormatterOptions>>>;
  /** Render a preview cell for a given formatter + options. */
  preview(formatter: Formatter, options: FormatterOptions): string;
  /** UI label per formatter (shown in the picker dropdown). */
  readonly labels: Readonly<Partial<Record<Formatter, string>>>;
}

export const FORMATTERS_BY_TYPE: Readonly<Record<ColumnType, FormatterTypeConfig>> = {
  number: {
    types: ['plain', 'comma', 'percent'],
    defaults: {
      plain: { precision: 2 },
      comma: { precision: 2, thousands: true },
      percent: { precision: 1 },
    },
    labels: {
      plain: 'Plain',
      comma: 'Comma-separated',
      percent: 'Percent',
    },
    preview(formatter, options) {
      // Copy from the existing switch's number-case preview logic.
      const sample = 1234.5678;
      switch (formatter) {
        case 'plain':
          return sample.toFixed(options.precision ?? 2);
        case 'comma':
          return sample.toLocaleString(undefined, {
            minimumFractionDigits: options.precision ?? 2,
            maximumFractionDigits: options.precision ?? 2,
          });
        case 'percent':
          return (sample / 100).toLocaleString(undefined, {
            style: 'percent',
            minimumFractionDigits: options.precision ?? 1,
          });
        default:
          return '';
      }
    },
  },
  string: {
    types: ['plain'],
    defaults: { plain: {} },
    labels: { plain: 'Plain' },
    preview: () => 'Sample text',
  },
  date: {
    types: ['date-short', 'date-long', 'date-iso'],
    defaults: { /* ... */ },
    labels: { /* ... */ },
    preview(formatter) {
      const sample = new Date('2026-05-13T14:30:00Z');
      switch (formatter) {
        case 'date-short': return sample.toLocaleDateString();
        case 'date-long': return sample.toLocaleString();
        case 'date-iso': return sample.toISOString();
        default: return '';
      }
    },
  },
  currency: {
    types: ['currency'],
    defaults: { currency: { currencyCode: 'USD', precision: 2 } },
    labels: { currency: 'Currency' },
    preview(_, options) {
      return (12345.67).toLocaleString(undefined, {
        style: 'currency',
        currency: options.currencyCode ?? 'USD',
        minimumFractionDigits: options.precision ?? 2,
      });
    },
  },
  percent: { /* ... */ },
  boolean: { /* ... */ },
};
```

**Rule**: copy the existing preview/format logic verbatim. Don't "improve" the rendering during this refactor; that's a separate PR.

### Step 3 — Rewrite the picker to consume the table

```tsx
/**
 * FormatterPicker — generic renderer over FORMATTERS_BY_TYPE.
 *
 * Reads the column type → looks up the FormatterTypeConfig → renders
 * the offered formatters + their option editors. The old per-type
 * switch is gone; adding a new column type only requires appending
 * a row to FORMATTERS_BY_TYPE.
 */

import { useMemo, useState } from 'react';
import { FORMATTERS_BY_TYPE, type ColumnType, type Formatter, type FormatterOptions } from './formattersByType.js';

export interface FormatterPickerProps {
  readonly columnType: ColumnType;
  readonly initial?: { formatter: Formatter; options: FormatterOptions };
  onChange(formatter: Formatter, options: FormatterOptions): void;
}

export function FormatterPicker({ columnType, initial, onChange }: FormatterPickerProps) {
  const cfg = FORMATTERS_BY_TYPE[columnType];
  if (!cfg) {
    return <div>No formatters available for column type "{columnType}"</div>;
  }

  const [formatter, setFormatter] = useState<Formatter>(
    initial?.formatter ?? cfg.types[0] ?? 'plain',
  );
  const [options, setOptions] = useState<FormatterOptions>(
    initial?.options ?? cfg.defaults[formatter] ?? {},
  );

  const preview = useMemo(() => cfg.preview(formatter, options), [cfg, formatter, options]);

  return (
    <div>
      {/* Dropdown of offered formatters */}
      <FormatterDropdown
        options={cfg.types}
        labels={cfg.labels}
        value={formatter}
        onChange={(next) => {
          setFormatter(next);
          const defaults = cfg.defaults[next] ?? {};
          setOptions(defaults);
          onChange(next, defaults);
        }}
      />

      {/* Per-formatter option editors. Keep the existing ones but
          render them generically — pass `formatter` and let each
          subcomponent decide if it applies. */}
      <FormatterOptionsEditor
        formatter={formatter}
        options={options}
        onChange={(nextOptions) => {
          setOptions(nextOptions);
          onChange(formatter, nextOptions);
        }}
      />

      {/* Preview */}
      <div data-testid="formatter-preview">{preview}</div>
    </div>
  );
}
```

The picker drops to **200-300 LOC**. The per-type knowledge lives in the table.

### Step 4 — Where do option editors live?

The existing component probably has `<NumberFormatterOptions />`, `<DateFormatterOptions />`, etc. Two options:

1. **Keep them**, generalise the picker to render the right one based on `formatter` value
2. **Inline simpler editors** — most are just a `<select>` for precision

Pick whichever has lower total LOC after the refactor. Cite which choice in the PR description.

### Step 5 — Tests

`packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { FormatterPicker } from './FormatterPicker';
import { FORMATTERS_BY_TYPE } from './formattersByType';

afterEach(() => cleanup());

describe('FormatterPicker', () => {
  it('offers exactly the formatters listed in FORMATTERS_BY_TYPE for the given column type', () => {
    for (const colType of Object.keys(FORMATTERS_BY_TYPE) as Array<keyof typeof FORMATTERS_BY_TYPE>) {
      cleanup();
      const onChange = vi.fn();
      render(<FormatterPicker columnType={colType} onChange={onChange} />);
      const cfg = FORMATTERS_BY_TYPE[colType];
      for (const formatter of cfg.types) {
        const label = cfg.labels[formatter] ?? formatter;
        expect(screen.getByText(label, { exact: false })).toBeTruthy();
      }
    }
  });

  it('selecting a formatter fires onChange with the formatter + its default options', () => {
    const onChange = vi.fn();
    render(<FormatterPicker columnType="number" onChange={onChange} />);
    // Change the dropdown to "comma"
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'comma' } });
    expect(onChange).toHaveBeenCalledWith('comma', expect.objectContaining({ thousands: true }));
  });

  it('preview text matches the table preview function', () => {
    render(<FormatterPicker columnType="number" initial={{ formatter: 'comma', options: { precision: 2, thousands: true } }} onChange={() => {}} />);
    const expected = FORMATTERS_BY_TYPE.number.preview('comma', { precision: 2, thousands: true });
    expect(screen.getByTestId('formatter-preview').textContent).toBe(expected);
  });

  it('falls back gracefully for an unknown column type', () => {
    // @ts-expect-error — intentionally invalid
    render(<FormatterPicker columnType="alien" onChange={() => {}} />);
    expect(screen.getByText(/No formatters available/i)).toBeTruthy();
  });
});
```

## Verification

```sh
# 1. Picker tests
npm test -w @starui/grid-react -- --run FormatterPicker

# 2. Full package
npm test -w @starui/grid-react

# 3. Apps typecheck
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 4. E2E (formatter flows)
npx playwright test e2e/v2-template-create-apply.spec.ts e2e/v2-two-grid-isolation.spec.ts

# 5. File sizes
wc -l packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.tsx
# Expected: 200-300 (was 1002)

wc -l packages/react/widgets/grid-react/src/ui/FormatterPicker/formattersByType.ts
# Expected: 400-600

# 6. Final gate
npx turbo typecheck build test
```

## Manual smoke

```sh
npm run dev -w @starui/markets-ui-react-reference
```

Open a blotter and:
- Click a column header → format → verify the picker offers the expected formatters for that column type
- Switch formatter → preview updates
- Pick "Comma-separated" with precision 4 → save → reload → format persists

Repeat for a number column, a date column, a currency column (if present), and a string column.

## Commit, push, open PR

```sh
git add packages/react/widgets/grid-react/src/ui/FormatterPicker/
git commit -m "$(cat <<'EOF'
refactor(grid-react): table-driven FormatterPicker — column-type adapters

Moves the per-column-type configuration (offered formatters, default
options, preview function, UI labels) out of FormatterPicker.tsx
(1002 LOC) into a typed table:

  src/ui/FormatterPicker/formattersByType.ts
    export const FORMATTERS_BY_TYPE: Record<ColumnType, FormatterTypeConfig>

FormatterPicker.tsx shrinks to ~XXX LOC of generic JSX that reads
the table at render time. Adding a new column type is now an
append-only change to the table — no more 5-place edit across the
component.

Preview text + formatter behaviour preserved verbatim (no rewording
of user-visible labels; no change to actual format output).

Tests verify each column type offers exactly the formatters in the
table, selection fires onChange with the right defaults, and the
preview output matches the table's preview function.

Verification: npx turbo typecheck build test — green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/formatterpicker-table-driven
gh pr create --title "refactor(grid-react): table-driven FormatterPicker" --body "<see commit>"
```

Report the PR URL.

## Out of scope

- Adding new formatter types (`'duration'`, `'fraction'`, etc.). Append-to-table is now easy; do it in follow-up PRs.
- Changing the formatter's runtime application in cells (AG-Grid value-formatter integration, separate concern).
- Changing the picker popup/positioning.
- Touching `FiltersToolbar.tsx` or `HelpPanel.tsx`.
- Adding new dependencies.
