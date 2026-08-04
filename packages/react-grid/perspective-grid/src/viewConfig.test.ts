import { describe, expect, it } from 'vitest';
import {
  blankUnaggregatedNonNumeric,
  isFilterModelMappable,
  sanitizeQuickFilterTerm,
  toQuickFilterExpression,
  QUICK_FILTER_COLUMN,
  toGroupColumns,
  toPerspectiveAggregate,
  toPerspectiveFilter,
  toPerspectiveFilterClauses,
  toPerspectiveGroupLevel,
  toPerspectiveSort,
  toPerspectiveViewConfig,
  viewConfigKey,
} from './viewConfig.js';

describe('toPerspectiveSort', () => {
  it('maps colId + direction, preserving multi-sort order', () => {
    expect(
      toPerspectiveSort([
        { colId: 'desk', sort: 'asc' },
        { colId: 'pnl', sort: 'desc' },
      ]),
    ).toEqual([
      ['desk', 'asc'],
      ['pnl', 'desc'],
    ]);
  });

  it('is undefined when empty, so the key stays stable', () => {
    expect(toPerspectiveSort([])).toBeUndefined();
    expect(toPerspectiveSort(undefined)).toBeUndefined();
  });

  it('drops unknown directions rather than guessing', () => {
    expect(toPerspectiveSort([{ colId: 'a', sort: 'sideways' }])).toBeUndefined();
  });
});

describe('toPerspectiveAggregate', () => {
  it('maps AG agg funcs, including min/max -> low/high', () => {
    expect(toPerspectiveAggregate('sum')).toBe('sum');
    expect(toPerspectiveAggregate('avg')).toBe('avg');
    expect(toPerspectiveAggregate('min')).toBe('low');
    expect(toPerspectiveAggregate('max')).toBe('high');
    expect(toPerspectiveAggregate('count')).toBe('count');
  });

  it('returns null for unmappable funcs so the column is left alone', () => {
    // Notably `weighted mean` is NOT a valid 4.5.2 aggregate — passing it
    // through as a bare string triggers a wasm abort.
    expect(toPerspectiveAggregate('weightedAvg')).toBeNull();
    expect(toPerspectiveAggregate(null)).toBeNull();
    expect(toPerspectiveAggregate(undefined)).toBeNull();
  });
});

describe('toPerspectiveFilterClauses', () => {
  it('maps numeric comparisons', () => {
    expect(
      toPerspectiveFilterClauses('pnl', { filterType: 'number', type: 'greaterThan', filter: 100 }),
    ).toEqual([['pnl', '>', 100]]);
    expect(
      toPerspectiveFilterClauses('pnl', { filterType: 'number', type: 'lessThanOrEqual', filter: 5 }),
    ).toEqual([['pnl', '<=', 5]]);
  });

  it('maps text equality and contains', () => {
    expect(
      toPerspectiveFilterClauses('desk', { filterType: 'text', type: 'equals', filter: 'RATES' }),
    ).toEqual([['desk', '==', 'RATES']]);
    expect(
      toPerspectiveFilterClauses('desk', { filterType: 'text', type: 'contains', filter: 'RAT' }),
    ).toEqual([['desk', 'contains', 'RAT']]);
  });

  it('maps a set filter to `in`', () => {
    expect(
      toPerspectiveFilterClauses('desk', { filterType: 'set', values: ['RATES', 'FX'] }),
    ).toEqual([['desk', 'in', ['RATES', 'FX']]]);
  });

  it('expands inRange into two AND clauses', () => {
    expect(
      toPerspectiveFilterClauses('qty', {
        filterType: 'number',
        type: 'inRange',
        filter: 10,
        filterTo: 20,
      }),
    ).toEqual([
      ['qty', '>=', 10],
      ['qty', '<=', 20],
    ]);
  });

  it('maps blank / notBlank to null checks', () => {
    expect(toPerspectiveFilterClauses('desk', { type: 'blank' })).toEqual([['desk', 'is null']]);
    expect(toPerspectiveFilterClauses('desk', { type: 'notBlank' })).toEqual([
      ['desk', 'is not null'],
    ]);
  });

  it('flattens AND compound conditions', () => {
    expect(
      toPerspectiveFilterClauses('qty', {
        operator: 'AND',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 10 },
          { filterType: 'number', type: 'lessThan', filter: 90 },
        ],
      }),
    ).toEqual([
      ['qty', '>', 10],
      ['qty', '<', 90],
    ]);
  });

  // Perspective clause lists are conjunctive; emitting OR conditions as AND
  // would silently narrow the book, so we emit nothing instead.
  it('refuses OR compounds rather than mistranslating them as AND', () => {
    expect(
      toPerspectiveFilterClauses('qty', {
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 90 },
          { filterType: 'number', type: 'lessThan', filter: 10 },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses unknown operators and missing operands', () => {
    expect(toPerspectiveFilterClauses('qty', { type: 'startsWith', filter: 'x' })).toEqual([]);
    expect(toPerspectiveFilterClauses('qty', { type: 'greaterThan' })).toEqual([]);
    expect(toPerspectiveFilterClauses('qty', { type: 'inRange', filter: 1 })).toEqual([]);
  });
});

describe('toPerspectiveFilter', () => {
  it('ANDs clauses across columns', () => {
    expect(
      toPerspectiveFilter({
        desk: { filterType: 'text', type: 'equals', filter: 'RATES' },
        pnl: { filterType: 'number', type: 'greaterThan', filter: 0 },
      }),
    ).toEqual([
      ['desk', '==', 'RATES'],
      ['pnl', '>', 0],
    ]);
  });

  it('is undefined when nothing translated', () => {
    expect(toPerspectiveFilter(null)).toBeUndefined();
    expect(toPerspectiveFilter({})).toBeUndefined();
    expect(toPerspectiveFilter({ a: { type: 'startsWith', filter: 'z' } })).toBeUndefined();
  });
});

describe('isFilterModelMappable', () => {
  it('accepts a model whose every column contributes a clause', () => {
    expect(
      isFilterModelMappable({
        sector: { filterType: 'set', values: ['Energy'] },
        quantity: { filterType: 'number', type: 'greaterThan', filter: 5000 },
      }),
    ).toBe(true);
  });

  it('accepts an empty or absent model — nothing to get wrong', () => {
    expect(isFilterModelMappable(null)).toBe(true);
    expect(isFilterModelMappable(undefined)).toBe(true);
    expect(isFilterModelMappable({})).toBe(true);
  });

  it('rejects an OR compound — the clause list would narrow, not widen', () => {
    // Perspective clause lists are conjunctive. `toPerspectiveFilterClauses`
    // drops the whole entry rather than render OR as AND, so a count taken
    // from it would report the unfiltered book.
    expect(
      isFilterModelMappable({
        sector: {
          operator: 'OR',
          conditions: [
            { filterType: 'text', type: 'equals', filter: 'Energy' },
            { filterType: 'text', type: 'equals', filter: 'Tech' },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects an operator with no Perspective equivalent', () => {
    expect(
      isFilterModelMappable({ cusip: { filterType: 'text', type: 'startsWith', filter: 'US' } }),
    ).toBe(false);
  });

  it('rejects when ANY column is unmappable, not just when all are', () => {
    expect(
      isFilterModelMappable({
        sector: { filterType: 'set', values: ['Energy'] },
        cusip: { filterType: 'text', type: 'endsWith', filter: '9' },
      }),
    ).toBe(false);
  });
});

describe('toPerspectiveViewConfig', () => {
  it('omits every key that has no content, so unchanged requests reuse the View', () => {
    expect(toPerspectiveViewConfig({})).toEqual({});
    expect(toPerspectiveViewConfig({ sortModel: [], rowGroupCols: [], valueCols: [] })).toEqual({});
  });

  it('builds group_by + aggregates from AG row-group/value columns', () => {
    expect(
      toPerspectiveViewConfig({
        rowGroupCols: [{ id: 'desk' }],
        valueCols: [
          { id: 'pnl', aggFunc: 'sum' },
          { id: 'price', aggFunc: 'avg' },
          { id: 'note', aggFunc: 'weightedAvg' }, // unmappable -> omitted
        ],
      }),
    ).toEqual({
      group_by: ['desk'],
      aggregates: { pnl: 'sum', price: 'avg' },
    });
  });

  it('passes calculated columns through as an expression map', () => {
    const cfg = toPerspectiveViewConfig({
      expressions: { notional: '"quantity" * "price"' },
      sortModel: [{ colId: 'notional', sort: 'desc' }],
    });
    // Expression columns are sortable server-side — verified against 4.5.2.
    expect(cfg.expressions).toEqual({ notional: '"quantity" * "price"' });
    expect(cfg.sort).toEqual([['notional', 'desc']]);
  });

  it('copies the expressions map so later caller mutation cannot leak in', () => {
    const expressions = { a: '1' };
    const cfg = toPerspectiveViewConfig({ expressions });
    expressions.a = '2';
    expect(cfg.expressions).toEqual({ a: '1' });
  });
});

describe('viewConfigKey', () => {
  it('is stable across key order and object identity', () => {
    const a = toPerspectiveViewConfig({
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [
        { id: 'pnl', aggFunc: 'sum' },
        { id: 'price', aggFunc: 'avg' },
      ],
    });
    const b = toPerspectiveViewConfig({
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [
        { id: 'price', aggFunc: 'avg' },
        { id: 'pnl', aggFunc: 'sum' },
      ],
    });
    expect(viewConfigKey(a)).toBe(viewConfigKey(b));
  });

  it('changes when the config meaningfully changes', () => {
    const base = viewConfigKey(toPerspectiveViewConfig({ sortModel: [{ colId: 'a', sort: 'asc' }] }));
    const sorted = viewConfigKey(
      toPerspectiveViewConfig({ sortModel: [{ colId: 'a', sort: 'desc' }] }),
    );
    expect(base).not.toBe(sorted);
  });

  it('does not change for a repeated identical request (no needless View rebuild)', () => {
    const make = () =>
      toPerspectiveViewConfig({
        sortModel: [{ colId: 'pnl', sort: 'desc' }],
        filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      });
    expect(viewConfigKey(make())).toBe(viewConfigKey(make()));
  });
});

describe('toPerspectiveGroupLevel', () => {
  const groups = [{ id: 'sector' }, { id: 'book' }];
  const values = [{ id: 'pnl', aggFunc: 'sum' }];

  it('groups by ONE column at the requested depth, not the whole tree', () => {
    const root = toPerspectiveGroupLevel({ rowGroupCols: groups, valueCols: values, groupKeys: [] });
    expect(root.config.group_by).toEqual(['sector']);
    expect(root.groupColId).toBe('sector');
    expect(root.depth).toBe(0);
    expect(root.config.filter).toBeUndefined();
  });

  it('pushes ancestor keys down as filter clauses', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      valueCols: values,
      groupKeys: ['Energy'],
    });
    expect(level.config.group_by).toEqual(['book']);
    expect(level.config.filter).toEqual([['sector', '==', 'Energy']]);
    expect(level.depth).toBe(1);
  });

  it('keeps the user filter and appends the ancestor clauses after it', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      groupKeys: ['Energy'],
      filterModel: { quantity: { filterType: 'number', type: 'greaterThan', filter: 100 } },
    });
    expect(level.config.filter).toEqual([
      ['quantity', '>', 100],
      ['sector', '==', 'Energy'],
    ]);
  });

  it('uses the null predicate for a blank group key — `== null` is not a comparison', () => {
    const level = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: [null] });
    expect(level.config.filter).toEqual([['sector', 'is null']]);
  });

  it('drops group_by at the leaf level so the View returns real rows', () => {
    const leaf = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      valueCols: values,
      groupKeys: ['Energy', 'FI-GOVT'],
    });
    expect(leaf.config.group_by).toBeUndefined();
    expect(leaf.groupColId).toBeNull();
    expect(leaf.config.filter).toEqual([
      ['sector', '==', 'Energy'],
      ['book', '==', 'FI-GOVT'],
    ]);
  });

  it('carries sort and aggregates into every level', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      valueCols: values,
      groupKeys: ['Energy'],
      sortModel: [{ colId: 'pnl', sort: 'desc' }],
    });
    expect(level.config.sort).toEqual([['pnl', 'desc']]);
    expect(level.config.aggregates).toEqual({ pnl: 'sum' });
  });

  it('is a flat view when nothing is grouped', () => {
    const flat = toPerspectiveGroupLevel({ sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(flat.config.group_by).toBeUndefined();
    expect(flat.groupColId).toBeNull();
    expect(flat.depth).toBe(0);
  });

  it('gives each level a distinct view key so levels never share a View', () => {
    const root = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: [] });
    const child = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: ['Energy'] });
    const sibling = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: ['Technology'] });
    const keys = [root, child, sibling].map((l) => viewConfigKey(l.config));
    expect(new Set(keys).size).toBe(3);
  });
});

describe('toGroupColumns', () => {
  it('moves the deepest __ROW_PATH__ entry onto the group column and drops the path', () => {
    const columns = { __ROW_PATH__: [['Energy'], ['Technology']], pnl: [10, 20] };
    expect(toGroupColumns(columns, 'sector')).toEqual({
      sector: ['Energy', 'Technology'],
      pnl: [10, 20],
    });
  });

  it('takes the LAST path entry, so a nested level shows its own key', () => {
    const columns = { __ROW_PATH__: [['Energy', 'FI-GOVT'], ['Energy', 'FX-SPOT']], pnl: [10, 20] };
    expect(toGroupColumns(columns, 'book').book).toEqual(['FI-GOVT', 'FX-SPOT']);
  });

  it('overwrites the aggregated column of the same name with the group key', () => {
    const columns = { __ROW_PATH__: [['Energy']], sector: ['whatever the agg produced'], pnl: [10] };
    expect(toGroupColumns(columns, 'sector').sector).toEqual(['Energy']);
  });

  it('maps the grand-total row (empty path) to null rather than undefined', () => {
    expect(toGroupColumns({ __ROW_PATH__: [[]], pnl: [1] }, 'sector').sector).toEqual([null]);
  });

  it('passes an ungrouped window through untouched', () => {
    const columns = { positionId: ['a'], pnl: [1] };
    expect(toGroupColumns(columns, 'sector')).toBe(columns);
  });
});

describe('sanitizeQuickFilterTerm', () => {
  it('lowercases, because the compiled haystack is lowered', () => {
    expect(sanitizeQuickFilterTerm('MiKe')).toBe('mike');
  });

  it('turns regex metacharacters into wildcards rather than escaping them', () => {
    // MEASURED: `match()` takes a regex, and a lone `(` aborts the View build
    // even when backslash-escaped — so there is no escaping strategy to use.
    expect(sanitizeQuickFilterTerm('(ann)')).toBe('.ann.');
    expect(sanitizeQuickFilterTerm('(')).toBe('.');
    expect(sanitizeQuickFilterTerm('a|b')).toBe('a.b');
    expect(sanitizeQuickFilterTerm('a*b+c?')).toBe('a.b.c.');
    expect(sanitizeQuickFilterTerm('^a$')).toBe('.a.');
  });

  it('neutralises the quote and backslash that would break the literal', () => {
    expect(sanitizeQuickFilterTerm("o'brien")).toBe('o.brien');
    // A literal backslash: it both breaks the quoted literal and can leave a
    // dangling escape in the regex.
    expect(sanitizeQuickFilterTerm(`a${String.fromCharCode(92)}b`)).toBe('a.b');
  });

  it('keeps letters, digits, spaces, underscore and hyphen', () => {
    expect(sanitizeQuickFilterTerm('BOOK_002-x 9')).toBe('book_002-x 9');
  });

  it('keeps non-ASCII letters and digits', () => {
    expect(sanitizeQuickFilterTerm('Müller')).toBe('müller');
  });
});

describe('toQuickFilterExpression', () => {
  const COLS = ['desk', 'trader'];

  it('ORs across every column for a single token', () => {
    expect(toQuickFilterExpression(COLS, 'mike')).toBe(
      "(match(lower(string(\"desk\")), 'mike') or match(lower(string(\"trader\")), 'mike'))",
    );
  });

  it('ANDs the tokens — AG needs every token to match SOME column', () => {
    const expr = toQuickFilterExpression(COLS, 'mike rates')!;
    expect(expr.split(' and ')).toHaveLength(2);
    expect(expr).toContain("'mike'");
    expect(expr).toContain("'rates'");
  });

  it('wraps every column in string(), so numerics and nulls are searchable', () => {
    // MEASURED: `string()` works on both string and float columns, and a null
    // row neither matches nor poisons the expression.
    expect(toQuickFilterExpression(['quantity'], '20')).toContain('string("quantity")');
  });

  it('uses `or`, never `|`', () => {
    // MEASURED: `|` parses but is not a logical or — it matched every row.
    expect(toQuickFilterExpression(COLS, 'x')).not.toContain('|');
  });

  it('returns null when there is nothing to apply', () => {
    expect(toQuickFilterExpression(COLS, '')).toBeNull();
    expect(toQuickFilterExpression(COLS, '   ')).toBeNull();
    expect(toQuickFilterExpression(COLS, undefined)).toBeNull();
    expect(toQuickFilterExpression([], 'mike')).toBeNull();
  });

  it('collapses runs of whitespace rather than emitting an empty token', () => {
    // An empty term is an empty regex, which matches every row.
    const expr = toQuickFilterExpression(COLS, '  mike   rates  ')!;
    expect(expr.split(' and ')).toHaveLength(2);
    expect(expr).not.toContain("''");
  });

  it('sanitizes the term it embeds', () => {
    expect(toQuickFilterExpression(['desk'], "o'brien")).toContain("'o.brien'");
  });
});

describe('toPerspectiveViewConfig — quick filter', () => {
  it('adds the expression column AND the clause that selects on it', () => {
    const config = toPerspectiveViewConfig({
      quickFilterText: 'mike',
      quickFilterColumns: ['trader'],
    });
    expect(config.expressions?.[QUICK_FILTER_COLUMN]).toContain('match(');
    expect(config.filter).toEqual([[QUICK_FILTER_COLUMN, '==', true]]);
  });

  it('ANDs with the column filters instead of replacing them', () => {
    const config = toPerspectiveViewConfig({
      filterModel: { sector: { filterType: 'set', values: ['Energy'] } },
      quickFilterText: 'mike',
      quickFilterColumns: ['trader'],
    });
    expect(config.filter).toHaveLength(2);
    expect(config.filter).toContainEqual(['sector', 'in', ['Energy']]);
  });

  it('MERGES with calculated-column expressions rather than clobbering them', () => {
    // Assigning would drop the quick expression while leaving the clause that
    // references it — a View that cannot build at all.
    const config = toPerspectiveViewConfig({
      expressions: { calc: '"a" * 2' },
      quickFilterText: 'mike',
      quickFilterColumns: ['trader'],
    });
    expect(config.expressions?.calc).toBe('"a" * 2');
    expect(config.expressions?.[QUICK_FILTER_COLUMN]).toBeDefined();
  });

  it('emits nothing at all when there is no quick text', () => {
    const config = toPerspectiveViewConfig({ quickFilterColumns: ['trader'] });
    expect(config.expressions).toBeUndefined();
    expect(config.filter).toBeUndefined();
  });
});

describe('blankUnaggregatedNonNumeric', () => {
  const schema = {
    positionId: 'string',
    desk: 'string',
    asOf: 'datetime',
    active: 'boolean',
    quantity: 'integer',
    pnl: 'float',
  };

  it('blanks a text column the user did not ask to aggregate', () => {
    // AG leaves an un-aggregated column empty in a group row. Perspective
    // fills it with the type's default — a distinct-count for a string — so a
    // text column renders a number under a group header.
    const out = blankUnaggregatedNonNumeric(
      { desk: [3, 2], quantity: [10, 20] },
      { schema },
    );
    expect(out.desk).toEqual([null, null]);
  });

  it('leaves numeric columns alone — a totals row is what they are for', () => {
    const out = blankUnaggregatedNonNumeric(
      { quantity: [10, 20], pnl: [1.5, 2.5] },
      { schema },
    );
    expect(out.quantity).toEqual([10, 20]);
    expect(out.pnl).toEqual([1.5, 2.5]);
  });

  it('keeps a non-numeric column the user DID aggregate', () => {
    // `first` / `last` are the two that mean anything for text, and opting in
    // is the whole escape hatch.
    const out = blankUnaggregatedNonNumeric(
      { desk: ['Rates', 'Credit'] },
      { schema, aggregates: { desk: 'first' } },
    );
    expect(out.desk).toEqual(['Rates', 'Credit']);
  });

  it('blanks dates and booleans too, not just strings', () => {
    const out = blankUnaggregatedNonNumeric(
      { asOf: [1, 2], active: [2, 1] },
      { schema },
    );
    expect(out.asOf).toEqual([null, null]);
    expect(out.active).toEqual([null, null]);
  });

  it('never blanks the structural columns', () => {
    // The group column carries the path key; blanking it erases the group
    // label itself.
    const out = blankUnaggregatedNonNumeric(
      { desk: ['Rates'], __ROW_PATH__: [['Rates']] },
      { schema, keep: ['desk'] },
    );
    expect(out.desk).toEqual(['Rates']);
    expect(out.__ROW_PATH__).toEqual([['Rates']]);
  });

  it('leaves columns the schema does not know — expression columns', () => {
    // Quick-filter and calculated columns are not in `table.schema()`; guessing
    // about them would blank a calculated total.
    const out = blankUnaggregatedNonNumeric({ calc_pnlPct: [1, 2] }, { schema });
    expect(out.calc_pnlPct).toEqual([1, 2]);
  });

  it('changes nothing without a schema', () => {
    const columns = { desk: [3, 2] };
    expect(blankUnaggregatedNonNumeric(columns, { schema: null })).toBe(columns);
  });
});

describe('toPerspectiveViewConfig — the column window', () => {
  it('emits nothing when no window is set — every column, as before', () => {
    expect(toPerspectiveViewConfig({}).columns).toBeUndefined();
  });

  it('never emits an empty array', () => {
    // MEASURED against 4.5.2: `columns: []` is ACCEPTED and produces a View
    // with zero columns, so an empty window has to mean "every column" or an
    // unresolvable one would blank the grid instead of degrading.
    expect(toPerspectiveViewConfig({ columns: [] }).columns).toBeUndefined();
  });

  it('sorts, so a column MOVE does not rebuild every View', () => {
    // AG hands its columns back in display order and `viewConfigKey` hashes
    // this array.
    const a = toPerspectiveViewConfig({ columns: ['pnl', 'desk', 'id'] });
    const b = toPerspectiveViewConfig({ columns: ['id', 'pnl', 'desk'] });
    expect(a.columns).toEqual(['desk', 'id', 'pnl']);
    expect(viewConfigKey(a)).toBe(viewConfigKey(b));
  });

  it('carries every aggregated value column, wherever the band is', () => {
    // A value column's aggregate is present only when the column is listed, so
    // without this the totals row silently empties for anything scrolled past.
    const config = toPerspectiveViewConfig({
      columns: ['id'],
      valueCols: [{ id: 'pnl', aggFunc: 'sum' }, { id: 'notional', aggFunc: 'avg' }],
    });
    expect(config.columns).toEqual(['id', 'notional', 'pnl']);
  });

  it('does NOT carry a value column whose aggFunc is unmappable', () => {
    // It gets no `aggregates` entry either, so there is nothing to preserve.
    const config = toPerspectiveViewConfig({
      columns: ['id'],
      valueCols: [{ id: 'pnl', aggFunc: 'stddev' }],
    });
    expect(config.columns).toEqual(['id']);
  });

  it('leaves sort, filter and group columns out — measured as unnecessary', () => {
    // `columnWindowProbe.mjs` against 4.5.2: a filter clause, a sort and a
    // group_by all resolve correctly against columns the View does not carry.
    // Pinning them would be payload for nothing.
    const config = toPerspectiveViewConfig({
      columns: ['id'],
      sortModel: [{ colId: 'pnl', sort: 'desc' }],
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'Rates' } },
      rowGroupCols: [{ id: 'sector' }],
    });
    expect(config.columns).toEqual(['id']);
  });
});
