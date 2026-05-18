import { RuleTester } from '@typescript-eslint/rule-tester';
import * as vitest from 'vitest';
import { noBareNestedField } from './no-bare-nested-field.js';

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester();

ruleTester.run('no-bare-nested-field', noBareNestedField, {
  valid: [
    // Simple flat field — no dot, allowed.
    {
      code: `const col = { headerName: 'X', field: 'price', cellClass: 'numeric' };`,
    },
    // Object spread with nestedField is the sanctioned path.
    {
      code: `const col = { headerName: 'X', ...nestedField({ path: 'trade.price.last' }) };`,
    },
    // Computed key — out of scope.
    {
      code: `const col = { [keyName]: 'trade.price.last' };`,
    },
    // Non-string value — not a field literal.
    {
      code: `const col = { field: getField() };`,
    },
    // String with no dot — bare flat field is fine.
    {
      code: `const col = { field: 'simpleField' };`,
    },
    // Key isn't 'field' — not our concern.
    {
      code: `const obj = { name: 'trade.price.last' };`,
    },
    // Inside the nestedField implementation — exempted by default.
    {
      code: `const base = { field: opts.path };`,
      filename: '/repo/packages/react/widgets/grid-react/src/coldef/nestedField.ts',
    },
    // Inside the nestedField test file — also exempted.
    {
      code: `expect(col.field).toBe('trade.price.last');`,
      filename: '/repo/packages/react/widgets/grid-react/src/coldef/nestedField.test.ts',
    },
    // Template literal with an expression — can't statically prove
    // it contains a dot, so we don't report.
    {
      code: 'const col = { field: `prefix.${dynamic}` };',
    },
  ],
  invalid: [
    {
      code: `const col = { headerName: 'X', field: 'trade.price.last', cellClass: 'numeric' };`,
      errors: [
        {
          messageId: 'bareNestedField',
          data: { path: 'trade.price.last' },
        },
      ],
    },
    // String literal with a dot in a deeply-nested object.
    {
      code: `
        const grid = {
          defaultColDef: { sortable: true },
          columnDefs: [
            { field: 'side' },
            { field: 'trade.price.last' },
            { field: 'simple' },
          ],
        };
      `,
      errors: [{ messageId: 'bareNestedField' }],
    },
    // Template literal without expressions, contains dot.
    {
      code: 'const col = { field: `trade.price.last` };',
      errors: [{ messageId: 'bareNestedField' }],
    },
    // Multiple violations in one file each report.
    {
      code: `
        const a = { field: 'a.b' };
        const c = { field: 'c.d.e' };
      `,
      errors: [
        { messageId: 'bareNestedField', data: { path: 'a.b' } },
        { messageId: 'bareNestedField', data: { path: 'c.d.e' } },
      ],
    },
    // Literal string key 'field' — also matches.
    {
      code: `const col = { 'field': 'trade.price.last' };`,
      errors: [{ messageId: 'bareNestedField' }],
    },
  ],
});
