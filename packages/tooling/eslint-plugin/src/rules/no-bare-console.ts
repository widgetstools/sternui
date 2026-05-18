import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util.js';

/**
 * no-bare-console
 * ───────────────
 * Flags `console.log/warn/error/info/debug/trace(...)` calls outside
 * the sanctioned logger module and test files. All diagnostic output
 * must go through a logger obtained from `createLogger("starui:<pkg>")`
 * so prefixes, severities, and silencing rules are uniform across
 * packages.
 *
 * Contract reference: docs/PUBLIC_API_SPEC.md §1.3.
 *
 * The rule does NOT fire when:
 *   - The file path matches an `allowFiles` suffix (defaults cover
 *     the logger source itself, test files, mock-data scripts, and
 *     CLI tools where direct console output is the intentional UX).
 *   - The call is a method on something other than the global
 *     `console` — e.g. `logger.error(...)` is fine because `logger`
 *     isn't the lexical identifier `console`.
 *
 * Auto-fix: not provided. Replacing `console.warn('[foo] x')` with
 * `log.warn('x')` requires knowing the file's `log` variable name
 * and ensuring the import exists. Codemod work, not per-occurrence.
 */

type Options = [
  {
    readonly allowMethods?: ReadonlyArray<string>;
    readonly allowFiles?: ReadonlyArray<string>;
  },
];

type MessageIds = 'bareConsole';

const DEFAULT_BANNED_METHODS = [
  'log',
  'warn',
  'error',
  'info',
  'debug',
  'trace',
] as const;

const DEFAULT_ALLOW_FILES = [
  // The logger's own source.
  '/log.ts',
  '/log.tsx',
  '/logger.ts',
  '/logger.tsx',
  // Test files — vitest, jest, playwright unit tests.
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  // E2E test fixtures.
  '/e2e/',
  // CLI / build scripts where console output IS the user-facing
  // interface; logger prefixing would obscure the message.
  '/scripts/',
  '/tools/scripts/',
  // ESLint rule sources — meta-tools.
  'eslint-plugin/src/',
];

function fileMatchesAny(
  filename: string,
  patterns: ReadonlyArray<string>,
): boolean {
  for (const pat of patterns) {
    if (filename.includes(pat)) return true;
  }
  return false;
}

export const noBareConsole = createRule<Options, MessageIds>({
  name: 'no-bare-console',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct `console.*` calls. Use a logger obtained from `createLogger("starui:<pkg>")` so log output is uniformly prefixed, level-filtered, and silenceable. See docs/PUBLIC_API_SPEC.md §1.3.',
    },
    messages: {
      bareConsole:
        'Bare `console.{{method}}(...)` is not allowed. Obtain a logger via `createLogger("starui:<pkg>")` and call `log.{{level}}(...)` instead. See docs/PUBLIC_API_SPEC.md §1.3.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowMethods: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Console methods that are allowed even outside exempted files. Defaults to none — all of log/warn/error/info/debug/trace are banned.',
          },
          allowFiles: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Substrings that mark a file as exempt (test files, the logger module, CLI scripts).',
          },
        },
      },
    ],
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const filename = context.filename ?? context.getFilename();
    const allowFiles = options.allowFiles ?? DEFAULT_ALLOW_FILES;
    if (fileMatchesAny(filename, allowFiles)) return {};

    const allowMethods = new Set(options.allowMethods ?? []);
    const bannedMethods = DEFAULT_BANNED_METHODS.filter(
      (m) => !allowMethods.has(m),
    );

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.computed) return;

        // We only care about the GLOBAL `console` identifier, not a
        // user variable named `console`. ESLint's scope analysis
        // tells us whether the identifier resolves to the global.
        const object = callee.object;
        if (object.type !== 'Identifier' || object.name !== 'console') return;

        // Reject if the name is locally shadowed (e.g. a util module
        // that destructures `const { log } = console`). The scope
        // check guarantees we're looking at the GLOBAL console.
        const scope = context.sourceCode.getScope(node);
        const variable = scope.variables.find((v) => v.name === 'console');
        if (variable && variable.defs.length > 0) {
          // Locally-defined `console` — not the global. Skip.
          return;
        }

        const property = callee.property;
        if (property.type !== 'Identifier') return;
        if (!bannedMethods.includes(property.name as never)) return;

        const level =
          property.name === 'log' || property.name === 'debug' || property.name === 'trace'
            ? 'info'
            : property.name; // warn → warn, error → error, info → info

        context.report({
          node,
          messageId: 'bareConsole',
          data: { method: property.name, level },
        });
      },
    };
  },
});
