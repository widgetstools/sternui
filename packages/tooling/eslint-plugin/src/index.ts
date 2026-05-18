/**
 * @starui/eslint-plugin
 * ─────────────────────
 * Custom ESLint rules enforcing StarUI Platform conventions.
 *
 * Two rules ship today:
 *
 *   no-bare-nested-field
 *     Disallow `field: "x.y.z"` literals in ColDefs. Use
 *     `nestedField({ path: "x.y.z" })` from `@starui/grid-react`.
 *     See docs/PUBLIC_API_SPEC.md §2.5 + §15 #11.
 *
 *   no-bare-console
 *     Disallow direct `console.*` calls. Use a logger from
 *     `createLogger("starui:<pkg>")`. See docs/PUBLIC_API_SPEC.md §1.3.
 *
 * Usage in a flat config:
 *
 *   ```js
 *   import starui from '@starui/eslint-plugin';
 *
 *   export default [
 *     {
 *       plugins: { '@starui': starui },
 *       rules: {
 *         '@starui/no-bare-nested-field': 'error',
 *         '@starui/no-bare-console': 'error',
 *       },
 *     },
 *   ];
 *   ```
 *
 * Or via the bundled `recommended` configuration:
 *
 *   ```js
 *   import starui from '@starui/eslint-plugin';
 *   export default [starui.configs.recommended];
 *   ```
 */

import { noBareNestedField } from './rules/no-bare-nested-field.js';
import { noBareConsole } from './rules/no-bare-console.js';

const plugin = {
  meta: {
    name: '@starui/eslint-plugin',
    version: '0.1.0',
  },
  rules: {
    'no-bare-nested-field': noBareNestedField,
    'no-bare-console': noBareConsole,
  },
  configs: {} as Record<string, unknown>,
};

// `recommended` is wired AFTER `plugin` is defined so it can refer to
// itself via the `@starui` namespace consumers will install it under.
plugin.configs.recommended = {
  name: '@starui/eslint-plugin/recommended',
  plugins: { '@starui': plugin },
  rules: {
    '@starui/no-bare-nested-field': 'error',
    '@starui/no-bare-console': 'error',
  },
};

export default plugin;

// Named exports for callers that want a rule directly.
export { noBareNestedField, noBareConsole };
