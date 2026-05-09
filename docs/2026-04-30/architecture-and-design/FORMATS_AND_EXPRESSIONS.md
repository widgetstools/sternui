# Formats & Expressions Cookbook

Reference guide for the two "mini-languages" used across the grid
customizer: **Excel format strings** (render how a cell looks) and our
**expression syntax** (compute what a cell is and drive conditional
logic / aggregations).

Both are available in every editor that accepts "custom format" or
"custom expression":

| Where | Excel format | Expression |
|---|---|---|
| Formatting Toolbar → Format → Custom | ✅ | |
| Column Settings → 06 VALUE FORMAT → Custom Excel Format | ✅ | |
| Column Settings → 08 ROW GROUPING → Agg Function = `custom` | | ✅ (aggregation) |
| Calculated Columns → Expression | | ✅ (per row) |
| Conditional Styling → Rule expression | | ✅ (predicate) |

All formatters are **CSP-safe** — no `new Function()` or `eval`, parsed
ahead of time and executed by a tree-walking interpreter.

---

## Part 1 — Excel Format Strings

Powered by SSF (SheetJS Format), which gives full Excel parity.

### Anatomy

A format string has up to **four sections** separated by `;`:

```
positive ; negative ; zero ; text
```

With **conditional sections** you can swap the positive/negative/zero
test for value-equality or range tests:

```
[condition1]section1 ; [condition2]section2 ; default
```

Supported conditions: `[>N]` `[>=N]` `[<N]` `[<=N]` `[=N]` `[<>N]`
where `N` is a literal number.

### Numbers

| Format | Sample input | Rendered |
|---|---|---|
| `0` | `1234.5` | `1235` |
| `0.00` | `1234.5` | `1234.50` |
| `#,##0` | `1234567` | `1,234,567` |
| `#,##0.00` | `1234567.89` | `1,234,567.89` |
| `0%` | `0.125` | `13%` |
| `0.00%` | `0.12345` | `12.35%` |
| `0.00E+00` | `12345` | `1.23E+04` |
| `0.0,,` | `1234567890` | `1234.6` (millions, no unit) |
| `#,##0,` | `1234567` | `1,235` (thousands) |
| `#,##0,,` | `1234567890` | `1,235` (millions) |
| `#,##0,,,` | `1234567890123` | `1,235` (billions) |

### Currencies

The dollar sign and euro sign can be used raw. Other symbols (£, ¥, ₹,
CHF) must be wrapped in quotes — SSF otherwise rejects them.

| Format | Sample | Rendered |
|---|---|---|
| `$#,##0.00` | `1234.5` | `$1,234.50` |
| `€#,##0.00` | `1234.5` | `€1,234.50` |
| `"£"#,##0.00` | `1234.5` | `£1,234.50` |
| `"¥"#,##0` | `1234.5` | `¥1,235` |
| `"₹"#,##0.00` | `1234.5` | `₹1,234.50` |
| `"CHF "#,##0.00` | `1234.5` | `CHF 1,234.50` |
| `[$USD] #,##0.00` | `1234.5` | `USD 1,234.50` (locale-tagged) |

### Negatives

| Format | `-1234.56` renders as |
|---|---|
| `#,##0.00;-#,##0.00` | `-1,234.56` |
| `#,##0.00;(#,##0.00)` | `(1,234.56)` |
| `[Red]#,##0.00;[Red](#,##0.00)` | `(1,234.56)` in red |
| `[Green]+#,##0;[Red]-#,##0` | `-1,235` in red |
| `#,##0.00;[Red]-#,##0.00` | positive plain, negative red |

### Conditional sections

| Format | Behavior |
|---|---|
| `[>100]0;0.00` | Integer when value ≥ 100, 2-decimal otherwise |
| `[>=1000000]0.0,,"M";0` | Compact "million" suffix over 1M |
| `[=1]"Green";[=0]"Off"` | Enum mapping for 0/1 switch |
| `[>0]"▲" 0.00;[<0]"▼" 0.00;0` | Up/down arrows with number |
| `[=1]"🟢";[=2]"🟡";[=3]"🔴"` | Traffic-light emoji map |

### Dates

Date values must be `Date` objects or ISO-8601 strings (starting with
`yyyy-mm-dd`). Epochs are coerced.

| Format | `new Date('2026-04-18T14:30')` renders |
|---|---|
| `yyyy-mm-dd` | `2026-04-18` |
| `dd/mm/yyyy` | `18/04/2026` |
| `mm/dd/yyyy` | `04/18/2026` |
| `dd-mmm-yyyy` | `18-Apr-2026` |
| `yyyy-mm-dd hh:mm` | `2026-04-18 14:30` |
| `hh:mm AM/PM` | `02:30 PM` |
| `dddd, mmmm dd, yyyy` | `Saturday, April 18, 2026` |
| `[hh]:mm` | hours over 24 allowed (durations) |

### Text

| Format | Rendered |
|---|---|
| `@` | As-is text |
| `"Ticker: "@` | `Ticker: AAPL` |
| `@" (BUY)"` | `BUY (BUY)` with suffix |

### Colors

Supported color tags: `[Black]` `[Blue]` `[Cyan]` `[Green]` `[Magenta]`
`[Red]` `[White]` `[Yellow]`. Apply to a single section.

```
[Green]#,##0.00;[Red](#,##0.00)
```

The `[Red]` / `[Green]` tags are extracted by our `excelFormatColorResolver`
and applied as per-value `cellStyle` (SSF itself returns plain text).

---

## Part 2 — Trading-Specific Formats

### Basis Points (bps)

| Format | Use case |
|---|---|
| `0" bps"` | `150 bps` |
| `+#,##0" bps";-#,##0" bps"` | Signed bps change |
| `0.0" bps"` | Fractional bps |
| `[Green]+0.0" bps";[Red]-0.0" bps"` | Yield change colored |

### Bond Tick Prices (32nds / 64ths / 128ths / 256ths)

Full Excel doesn't have built-in tick-price support. We ship a native
`kind: 'tick'` formatter that exposes five tokens. Pick them from the
Formatting Toolbar's tick menu.

| Token | Sample decimal | Rendered |
|---|---|---|
| `TICK32` | `101.5` | `101-16` (16/32) |
| `TICK32_PLUS` | `101.515625` | `101-16+` (sub-tick) |
| `TICK64` | `101.25` | `101-16` (16/64) |
| `TICK128` | `101.125` | `101-16` (16/128) |
| `TICK256` | `101.0625` | `101-16` (16/256) |

### Price / yield quotes

| Format | Use case |
|---|---|
| `0.0000` | FX major pairs, 4 decimals |
| `0.00000` | Precious metals, 5 decimals |
| `0.00" pct"` | Bond price as pct-of-par |
| `0.000"%"` | Yield |
| `#,##0.00000000" BTC"` | Crypto high-precision |

### Order-side indicators

| Format | Use case |
|---|---|
| `[="BUY"]"▲ BUY";[="SELL"]"▼ SELL";@` | Side with arrows |
| `[="BUY"][Green]@;[="SELL"][Red]@` | Color-coded side |

### Status / lifecycle

| Format | Use case |
|---|---|
| `[>=100]"AT PAR";[<100]"DISCOUNT"` | Price vs par |
| `[=1]"PRICED";[=0]"PENDING"` | Lifecycle boolean |
| `[>0]"LONG " 0;[<0]"SHORT " 0` | Position direction |

### Compact notional

| Format | `1_234_567_890` renders |
|---|---|
| `#,##0,,` | `1,235` (millions) |
| `#,##0.00,,"M"` | `1,234.57M` |
| `#,##0,,,` | `1` (billions) |
| `#,##0.00,,,"B"` | `1.23B` |

### P&L painting

| Format | Behavior |
|---|---|
| `[Green]+#,##0;[Red]-#,##0;0` | Daily P&L with color + sign |
| `[Green]+#,##0.00" USD";[Red]-#,##0.00" USD"` | Currency-tagged P&L |

---

## Part 3 — Expression Syntax

Used by:

- **Conditional Styling** — rule predicates
- **Calculated Columns** — virtual column valueGetter expressions
- **Column Settings → Row Grouping → Agg Function = Custom** — aggregation formulas

All three share **one** expression engine (`packages/core/src/expression/`).
No `eval`, no `new Function`. Tokenizer → Pratt parser → tree-walking
evaluator, all CSP-safe.

### Column references

| Syntax | Meaning |
|---|---|
| `[price]` or `{price}` | The current row's `price` value |
| `[value]` (in agg expressions) | The array of child values passed by AG-Grid |

Column names with spaces or hyphens must use brackets: `[order id]`.

### Literals

| Kind | Examples |
|---|---|
| Number | `42` `3.14` `-100` `1e6` |
| String | `"BUY"` `'SELL'` `"can't"` |
| Boolean | `true` `false` (lowercase) |
| Null | `null` |

### Operators

| Category | Operators |
|---|---|
| Arithmetic | `+` `-` `*` `/` `%` |
| Comparison | `=` or `==`, `!=`, `>`, `<`, `>=`, `<=` |
| Logical | `AND` (or `&&`), `OR` (or `||`), `NOT` (or `!`) |
| Membership | `IN (a, b, c)`, `BETWEEN a AND b` |
| Grouping | `( … )` |
| Ternary | `cond ? then : else` |

`AND`/`OR`/`NOT`/`IN`/`BETWEEN` are **case-sensitive keywords** — write
them in UPPER, otherwise they're parsed as identifiers.

### Built-in functions (65+)

#### Math

`ABS(x)`, `ROUND(x, n?)`, `FLOOR(x)`, `CEIL(x)`, `MOD(x, y)`, `POW(x, y)`,
`SQRT(x)`, `LN(x)`, `LOG(x, base?)`, `EXP(x)`, `SIGN(x)`, `MIN(…)`,
`MAX(…)`, `TRUNC(x, n?)`, `PI()`

#### Aggregation (column-aware)

When passed a direct column reference `[col]`, these operate on the
whole column array (pulled from `ctx.allRows` at evaluation time). In
custom agg expressions, `[value]` resolves to the aggregate values
array AG-Grid hands us.

`SUM([col])`, `AVG([col])`, `MIN([col])`, `MAX([col])`, `COUNT([col])`,
`DISTINCT_COUNT([col])`, `MEDIAN([col])`, `STDEV([col])`,
`VARIANCE([col])`

#### Logical

| Function | Purpose |
|---|---|
| `IF(cond, then, else?)` | Single-branch |
| `IFS(cond1, val1, cond2, val2, …, default?)` | Multi-branch (first-truthy wins) |
| `SWITCH(expr, case1, val1, case2, val2, …, default?)` | Value-equality multi-branch |
| `AND(a, b, …)` | All-true |
| `OR(a, b, …)` | Any-true |
| `NOT(x)` | Negate |
| `COALESCE(…)` | First non-null |

`IFS` with an **odd** number of args treats the last one as the
default. `IFS(c1, v1, c2, v2, c3, v3)` has no default — falling through
all conditions returns `null`.

#### String

`CONCAT(a, b, …)`, `LEFT(s, n)`, `RIGHT(s, n)`, `MID(s, start, n)`,
`LEN(s)`, `UPPER(s)`, `LOWER(s)`, `TRIM(s)`, `SUBSTITUTE(s, from, to)`,
`SEARCH(needle, haystack)`, `REPLACE(s, start, n, replace)`,
`STARTSWITH(s, prefix)`, `ENDSWITH(s, suffix)`, `CONTAINS(s, needle)`

#### Date

`TODAY()`, `NOW()`, `YEAR(d)`, `MONTH(d)`, `DAY(d)`, `HOUR(d)`,
`MINUTE(d)`, `SECOND(d)`, `WEEKDAY(d)`, `DATE(y, m, d)`, `DAYS(end, start)`,
`EDATE(d, months)`, `EOMONTH(d, months)`, `DATEDIFF(start, end, unit)`

#### Type / coercion

`ISBLANK(x)`, `ISNUMBER(x)`, `ISTEXT(x)`, `ISBOOL(x)`, `TYPE(x)`,
`NUMBER(x)`, `TEXT(x, fmt?)`, `BOOL(x)`

#### Lookup

`LOOKUP(key, dict, default?)`, `VLOOKUP(key, table, col, exact?)`

### Trading-flavoured examples

#### Conditional Styling rule

```
[yield] > 5 AND [status] = "FILLED"
```

Highlights filled orders with a yield above 5%.

#### High-yield classifier (calculated column)

```
IFS(
  [yield] >= 7, "JUNK",
  [yield] >= 5, "HIGH YIELD",
  [yield] >= 3, "INV GRADE",
  "LOW"
)
```

#### Notional calculation

```
[quantity] * [price] / 100
```

#### Trade-through detection

```
[side] = "BUY" AND [price] > [askPrice]
OR [side] = "SELL" AND [price] < [bidPrice]
```

#### Relative P&L (percent)

```
([price] - [costBasis]) / [costBasis] * 100
```

#### Volume-weighted average price (VWAP contribution)

```
SUM([quantity] * [price]) / SUM([quantity])
```

#### Age-in-days of an order

```
DAYS(NOW(), [timestamp])
```

#### Days-to-maturity

```
DAYS([maturityDate], TODAY())
```

#### Coupon-rate band

```
SWITCH(
  TRUNC([couponRate]),
  0, "ZERO COUPON",
  1, "LOW COUPON",
  2, "LOW COUPON",
  3, "MID COUPON",
  4, "MID COUPON",
  5, "HIGH COUPON",
  "VERY HIGH"
)
```

#### Aggregation: weighted average spread (custom agg)

```
SUM([value] * [quantity]) / SUM([quantity])
```

---

## Part 4 — The Traffic Light Walkthrough

Full, step-by-step example combining a calculated column, Excel format
conditional sections, and a custom aggregation expression. This is the
reference implementation for any "classify → show icon → aggregate
upward" pattern.

### What we're building

Every order gets a red / amber / green indicator based on its price:

- `price >= 105` → 🟢 green
- `95 ≤ price < 105` → 🟡 amber
- `price < 95` → 🔴 red

At **group row level**:

- All children green → 🟢
- All children red → 🔴
- Any mix → 🟡

### Step 1 — Add a calculated column

1. Open **Settings → Calculated Columns → + Add**
2. **Name**: `Traffic Light`, **id**: `trafficlight`
3. **Expression**:
   ```
   IFS([price] >= 105, 1, [price] >= 95, 2, 3)
   ```
4. Save.

The column now carries a numeric 1 / 2 / 3 per row.

### Step 2 — Render the emoji at row level

1. Open **Settings → Column Settings → Traffic Light → 06 VALUE FORMAT**
2. Select **Custom Excel Format**
3. Paste:
   ```
   [=1]"🟢";[=2]"🟡";[=3]"🔴"
   ```

SSF matches each section's condition against the numeric value and
substitutes the quoted emoji. Pure text output — no cellRenderer.

### Step 3 — Center the cell

Still in **Column Settings → Traffic Light → 04 CELL STYLE → Alignment**
→ choose **Center**.

### Step 4 — Set the custom aggregation

1. Open **Column Settings → Traffic Light → 08 ROW GROUPING**
2. **AGG FUNCTION**: select **Custom expression…**
3. Paste:
   ```
   IFS(
     MIN([value]) = 1 AND MAX([value]) = 1, 1,
     MIN([value]) = 3 AND MAX([value]) = 3, 3,
     2
   )
   ```

This is a 5-arg `IFS` — two condition/value pairs + a trailing default
(odd arg count = last-is-default). So if neither "all 1s" nor "all 3s"
matches, it returns `2` → amber.

Click **SAVE** in the Column Settings editor, then **Done**.

### Step 5 — Group the grid

Drag **Desk** and **Counterparty** into the Row Groups tool panel (or
set `rowGroup: true` + `rowGroupIndex` on each column via the
ROW GROUPING band).

### How it works under the hood

| Level | Input | Formula | Output | Rendered |
|---|---|---|---|---|
| Leaf row (price=110) | — | `IFS(110≥105, 1, …)` | `1` | 🟢 |
| Leaf row (price=98) | — | `IFS(98<105, …, 98≥95, 2, …)` | `2` | 🟡 |
| Leaf row (price=90) | — | `IFS(…, …, 3)` | `3` | 🔴 |
| Sub-group (all greens) | `[1,1,1,1]` | `MIN=1, MAX=1` → first branch | `1` | 🟢 |
| Sub-group (all reds) | `[3,3]` | `MIN=3, MAX=3` → second branch | `3` | 🔴 |
| Sub-group (mixed) | `[1,3,2]` | `MIN=1, MAX=3` → default | `2` | 🟡 |
| Parent group | `[1, 3, 2]` (children's agg) | same expression | `2` | 🟡 |

**Higher-level aggregation is hierarchical** — AG-Grid feeds the
aggregated results from the level below, not the raw leaf values. This
is why the classifier formula works recursively: `[1, 3, 2]` is a mix
at every level so the catch-all default `2` propagates up.

### Variations

**Reverse the scale** (red is high):

```
IFS([price] >= 105, 3, [price] >= 95, 2, 1)
```

**More granular (5 levels)**:

```
IFS(
  [price] >= 110, 5,
  [price] >= 105, 4,
  [price] >= 100, 3,
  [price] >=  95, 2,
              1
)
```
Excel format:
```
[=5]"🟢🟢";[=4]"🟢";[=3]"🟡";[=2]"🟠";[=1]"🔴"
```

**Classify against a dynamic threshold**:

```
IF([price] >= AVG([price]) * 1.05, 1,
IF([price] >= AVG([price]) * 0.95, 2, 3))
```

Uses column-aware AVG — every row's classification is relative to the
current dataset's mean price.

**Status-based instead of price-based**:

```
SWITCH([status],
  "FILLED", 1,
  "PARTIAL", 2,
  "CANCELLED", 3,
  "REJECTED", 3,
  2)
```

### Troubleshooting

- **Group rows show empty Traffic Light cells** — see the bug fix in
  `6b4f112`. Virtual columns now return `node.aggData[colId]` for
  group rows so the aggregate value surfaces.
- **Excel format doesn't turn on** — check you saved via the Column
  Settings SAVE pill (not just typed into the field).
- **Aggregation returns null** — `IFS` with an even arg count has no
  default. Add a trailing default (make it odd) or append `true, X` as
  the last pair.

---

## Part 5 — Emoji Gallery

Copy-paste-friendly emoji reference for Excel format strings and
expression outputs. Every emoji here is a single Unicode string — use
it raw in formats (`[=1]"🟢";…`) or in expression string literals
(`IF([side] = "BUY", "🟢", "🔴")`).

> **Note**: when returning emojis from an expression that later needs
> to aggregate at group-row level, prefer the numeric-classification
> pattern from Part 4 — lexicographic MIN/MAX over emoji codepoints
> isn't semantically meaningful. Emojis work beautifully for pure
> per-row rendering.

### Traffic lights / status circles

| 🟢 | 🟡 | 🟠 | 🔴 | 🟣 | 🔵 | 🟤 | ⚫ | ⚪ |
|---|---|---|---|---|---|---|---|---|
| green | yellow | orange | red | purple | blue | brown | black | white |

### Directional arrows

| ▲ | ▼ | ◀ | ▶ | ⬆ | ⬇ | ⬅ | ➡ | ↗ | ↘ | ↙ | ↖ | ↔ | ↕ | 🔼 | 🔽 | ⤴ | ⤵ | 🔀 | 🔃 | 🔄 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| up | down | left | right | up | down | left | right | NE | SE | SW | NW | h-flip | v-flip | up-blk | down-blk | up-right | down-right | shuffle | down-arrow-cycle | recycle |

### Check / cross / warning

| ✅ | ❌ | ⚠️ | 🛑 | ⛔ | 🚫 | ✔ | ✖ | ❎ | ❗ | ❕ | ❓ | ❔ | ✴️ | ✳️ | ℹ️ | ⁉️ | ‼️ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| check | cross | warning | stop-sign | no-entry | prohibited | check-mk | x-mk | neg-check | red-!  | white-!  | red-?  | white-?  | 8-star | 8-spoked | info | exclaim-? | double-! |

### Finance & markets

| 📈 | 📉 | 📊 | 💹 | 💰 | 💵 | 💴 | 💶 | 💷 | 💸 | 💳 | 🪙 | 💎 | 🏦 | 🏛 | 💲 | 🧾 | 🗂 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| up-chart | down-chart | bar-chart | stock-up | moneybag | USD | JPY | EUR | GBP | flying-money | card | coin | diamond | bank | classical | $-sign | receipt | tab-file |

### Signals & alerts

| 🚀 | 🔥 | ❄️ | ⚡ | 💥 | 🎯 | 🔔 | 🔕 | 🚨 | 🎉 | 🏁 | ⏳ | ⏰ | ⏱ | ⏲ | 🕰 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rocket | fire | cold | bolt | boom | target | bell-on | bell-off | siren | party | checker-flag | hourglass | alarm | stopwatch | timer | mantel-clock |

### Shapes

| 🔺 | 🔻 | 🔶 | 🔷 | 🔸 | 🔹 | 🟥 | 🟧 | 🟨 | 🟩 | 🟦 | 🟪 | 🟫 | ⬛ | ⬜ | ◼ | ◻ | ▪ | ▫ | ● | ○ | ◉ | ⚫ | ⚪ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| up-tri | down-tri | big-dia | big-dia-blue | sm-dia-orng | sm-dia-blue | red-sq | orng-sq | yel-sq | grn-sq | blu-sq | prpl-sq | brn-sq | blk-sq | wht-sq | med-blk | med-wht | sm-blk | sm-wht | dot-blk | dot-wht | bullseye | blk-cir | wht-cir |

### Enclosed letters & numbers

| Ⓐ | Ⓑ | Ⓒ | Ⓓ | Ⓔ | 🅰 | 🅱 | 🅾 | 🅿 | 🆎 | 🆑 | 🆒 | 🆓 | 🆔 | 🆕 | 🆖 | 🆗 | 🆘 | 🆙 | 🆚 | Ⓜ | ㊗ | ㊙ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (A) | (B) | (C) | (D) | (E) | A-red | B-red | O-red | P-red | AB | CL | COOL | FREE | ID | NEW | NG | OK | SOS | UP! | VS | M | congr | secret |

| 0️⃣ | 1️⃣ | 2️⃣ | 3️⃣ | 4️⃣ | 5️⃣ | 6️⃣ | 7️⃣ | 8️⃣ | 9️⃣ | 🔟 | #️⃣ | *️⃣ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | hash | star |

### Currency symbols (raw unicode)

| ₿ | $ | € | £ | ¥ | ₹ | ₩ | ₪ | ₱ | ₴ | ฿ | ₽ | 💲 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BTC | USD | EUR | GBP | JPY/CNY | INR | KRW | ILS | PHP | UAH | THB | RUB | $-emoji |

### Flags (common trading jurisdictions)

| 🇺🇸 | 🇬🇧 | 🇪🇺 | 🇯🇵 | 🇨🇳 | 🇭🇰 | 🇹🇼 | 🇰🇷 | 🇸🇬 | 🇮🇳 | 🇦🇺 | 🇳🇿 | 🇨🇦 | 🇨🇭 | 🇩🇪 | 🇫🇷 | 🇮🇹 | 🇪🇸 | 🇳🇱 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| USD | GBP | EUR | JPY | CNY | HKD | TWD | KRW | SGD | INR | AUD | NZD | CAD | CHF | EUR | EUR | EUR | EUR | EUR |

| 🇲🇽 | 🇧🇷 | 🇦🇷 | 🇨🇱 | 🇨🇴 | 🇵🇪 | 🇿🇦 | 🇹🇷 | 🇸🇦 | 🇦🇪 | 🇶🇦 | 🇰🇼 | 🇧🇭 | 🇮🇱 | 🇹🇭 | 🇮🇩 | 🇲🇾 | 🇵🇭 | 🇻🇳 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MXN | BRL | ARS | CLP | COP | PEN | ZAR | TRY | SAR | AED | QAR | KWD | BHD | ILS | THB | IDR | MYR | PHP | VND |

### Weather (volatility / risk indicators)

| ☀️ | 🌤 | ⛅ | 🌥 | ☁️ | 🌦 | 🌧 | ⛈ | 🌩 | 🌨 | ❄️ | ☔ | 🌪 | 🌫 | 🌈 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| calm | mostly | partly | mostly-cloud | cloudy | sun-shower | rain | thunderstorm | lightning | snow | cold | umbrella | tornado | foggy | rainbow |

### Desk tools / workstation

| 🖥 | 💻 | 📱 | ⌨️ | 🖱 | 🖨 | 📇 | 📋 | 📁 | 📂 | 🗂 | 🗃 | 🗄 | 📎 | 🖇 | 📐 | 📏 | 📑 | 📒 | 📓 | 📕 | 📗 | 📘 | 📙 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | laptop | phone | kbd | mouse | printer | rolodex | clipboard | folder | open-folder | divider | box-files | cabinet | paperclip | chain-clip | triangle-ruler | ruler | tabs | ledger | notebook | red-book | green-book | blue-book | orange-book |

### Security & permissions

| 🔒 | 🔓 | 🔐 | 🔑 | 🗝 | 🛡 | 🛠 | ⚙️ | 🔧 | 🔨 | ⚒ | 🛑 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| locked | unlocked | lock+key | key | old-key | shield | tools | gear | wrench | hammer | hammer-pick | stop |

### People / roles

| 👤 | 👥 | 🧑‍💼 | 👨‍💼 | 👩‍💼 | 🧑‍💻 | 👨‍💻 | 👩‍💻 | 🧑‍⚖️ | ⚖️ | 🤝 | 👔 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bust | busts | office-worker | m-office | w-office | tech-worker | m-tech | w-tech | judge | scale | handshake | tie |

### Misc (common in dashboards)

| 🔍 | 🔎 | 🔖 | 📌 | 📍 | 🚩 | 🏷 | 🎫 | 🏆 | 🥇 | 🥈 | 🥉 | 🏅 | 🎖 | 🎗 | 🎁 | 🎈 | 💡 | 🧠 | 🧭 | 🗺 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| magnify-L | magnify-R | bookmark | push-pin | location | red-flag | tag | ticket | trophy | gold | silver | bronze | medal | military | ribbon | gift | balloon | idea | brain | compass | map |

### How to copy

- **Raw emoji** — just copy the character (`🟢`) out of any table cell.
- **In Excel format** — wrap in double-quotes: `[=1]"🟢"`.
- **In expressions** — single OR double quotes work: `IF(..., "🟢", "🔴")` or `IF(..., '🟢', '🔴')`.
- **Concatenation** — `CONCAT("📈 ", [security], " ", [side])` → `"📈 AAPL BUY"`.

### Caveats

- **Set-filter floating-filter display** — AG-Grid renders the selected
  values as comma-joined strings in the compact floating-filter cell; a
  set filter over an emoji column works but reads the emoji glyphs
  themselves.
- **Export to CSV / Excel** — AG-Grid's export uses the formatted string,
  so emoji cells survive as actual emoji characters in `.csv`. Opens
  correctly in Excel when the receiving file is UTF-8.
- **Width** — a single emoji often renders wider than the same-numbered
  character. Give emoji columns an `initialWidth` ≥ 50 and center-align
  the cell.
