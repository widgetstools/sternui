import { RuleTester } from '@typescript-eslint/rule-tester';
import * as vitest from 'vitest';
import { noBareConsole } from './no-bare-console.js';

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester();

ruleTester.run('no-bare-console', noBareConsole, {
  valid: [
    // Logger-based output — the sanctioned path.
    {
      code: `const log = createLogger('starui:grid'); log.warn('thing happened');`,
    },
    // Test file — exempted by default.
    {
      code: `console.error('inside a test'); console.log('debug');`,
      filename: '/repo/packages/foo/src/bar.test.ts',
    },
    // Logger module itself — exempted by default.
    {
      code: `console.warn('emit'); console.error('fail');`,
      filename: '/repo/packages/shared/foundation/shared-types/src/log.ts',
    },
    // CLI script — exempted by default.
    {
      code: `console.log('Build complete');`,
      filename: '/repo/tools/scripts/build.mjs',
    },
    // E2E fixture — exempted.
    {
      code: `console.warn('flake-detection');`,
      filename: '/repo/e2e/grid/specs/popout.test.ts',
    },
    // Locally-defined `console` variable — not the global.
    {
      code: `function fn() { const console = { error: (x: string) => x }; console.error('not the global'); }`,
    },
    // Non-banned method on console — `console.table`, `console.dir`,
    // `console.time`, etc. are interactive devtools helpers, not
    // diagnostic output.
    {
      code: `console.table([{ a: 1 }]); console.time('t'); console.timeEnd('t'); console.dir(obj);`,
    },
    // Computed access — out of scope.
    {
      code: `console[method](x);`,
    },
    // Method call on something that isn't the lexical `console`.
    {
      code: `myLogger.error('x'); appLog.warn('y');`,
    },
  ],
  invalid: [
    {
      code: `console.warn('boom');`,
      errors: [
        {
          messageId: 'bareConsole',
          data: { method: 'warn', level: 'warn' },
        },
      ],
    },
    {
      code: `console.error('broken', err);`,
      errors: [{ messageId: 'bareConsole', data: { method: 'error', level: 'error' } }],
    },
    {
      code: `console.log('debug-style chatter');`,
      errors: [{ messageId: 'bareConsole', data: { method: 'log', level: 'info' } }],
    },
    {
      code: `console.info('an event');`,
      errors: [{ messageId: 'bareConsole', data: { method: 'info', level: 'info' } }],
    },
    // Multiple violations in one file each report.
    {
      code: `
        function bootstrap() {
          console.info('starting');
          if (failed) console.error('nope');
          console.warn('legacy path');
        }
      `,
      errors: [
        { messageId: 'bareConsole' },
        { messageId: 'bareConsole' },
        { messageId: 'bareConsole' },
      ],
    },
    // Inside an arrow function — still applies.
    {
      code: `const handle = () => console.error('arrow');`,
      errors: [{ messageId: 'bareConsole' }],
    },
  ],
});
