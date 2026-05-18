import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../util.js';

/**
 * no-bare-nested-field
 * ────────────────────
 * Flags `field: "x.y.z"` in object literals when the string contains a
 * dot. ColDef authors must use `nestedField({ path: "x.y.z" })` instead.
 *
 * Contract reference: docs/PUBLIC_API_SPEC.md §2.5 + §15 #11.
 * Design rationale: docs/plans/nested-fields-design.md.
 *
 * The rule fires when ALL of these hold:
 *   1. The property key is the literal identifier `field` (or the
 *      literal string "field"). Computed keys are out of scope.
 *   2. The value is a string literal (template literals without
 *      expressions count).
 *   3. The string contains at least one `.`.
 *
 * The rule does NOT fire inside the `nestedField()` implementation
 * itself (detected by file path) or inside any file matching the
 * `nestedFieldImplementationFiles` option.
 *
 * Auto-fix: not provided. The transformation requires inserting a
 * spread of `nestedField({ path })`, which can clash with other
 * properties in the object. Codemod work, not a per-occurrence fix.
 */

type Options = [
  {
    readonly nestedFieldImplementationFiles?: ReadonlyArray<string>;
  },
];

type MessageIds = 'bareNestedField';

const DEFAULT_IMPL_FILES = [
  // The factory's own source.
  'coldef/nestedField.ts',
  'coldef/nestedField.tsx',
  // The factory's test file.
  'coldef/nestedField.test.ts',
];

function fileMatchesAny(
  filename: string,
  patterns: ReadonlyArray<string>,
): boolean {
  for (const pat of patterns) {
    if (filename.endsWith(pat)) return true;
  }
  return false;
}

function stringValueOf(node: TSESTree.Node): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1 &&
    node.quasis[0] !== undefined
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function keyIsField(prop: TSESTree.Property): boolean {
  if (prop.computed) return false;
  if (prop.key.type === 'Identifier' && prop.key.name === 'field') return true;
  if (prop.key.type === 'Literal' && prop.key.value === 'field') return true;
  return false;
}

export const noBareNestedField = createRule<Options, MessageIds>({
  name: 'no-bare-nested-field',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow bare `field: "x.y.z"` literals in ColDefs. Use `nestedField({ path: "x.y.z" })` from `@starui/grid-react` so every AG-Grid feature is wired through the compiled accessor cache (PUBLIC_API_SPEC.md §2.5 + §15 #11).',
    },
    messages: {
      bareNestedField:
        'Bare nested field `field: "{{path}}"` bypasses the compiled accessor cache, valueSetter, stable colId, and the dev safety net. Replace with `...nestedField({ path: "{{path}}" })` from `@starui/grid-react`. See docs/PUBLIC_API_SPEC.md §2.5.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          nestedFieldImplementationFiles: {
            type: 'array',
            items: { type: 'string' },
            description:
              'File suffixes whose source defines or tests the `nestedField()` factory; the rule will not fire in these files.',
          },
        },
      },
    ],
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const filename = context.filename ?? context.getFilename();
    const exemptFiles = options.nestedFieldImplementationFiles ?? DEFAULT_IMPL_FILES;
    if (fileMatchesAny(filename, exemptFiles)) {
      return {};
    }

    return {
      Property(node: TSESTree.Property) {
        if (!keyIsField(node)) return;
        const valueNode = node.value;
        const stringValue = stringValueOf(valueNode);
        if (stringValue === null) return;
        if (!stringValue.includes('.')) return;

        context.report({
          node,
          messageId: 'bareNestedField',
          data: { path: stringValue },
        });
      },
    };
  },
});
