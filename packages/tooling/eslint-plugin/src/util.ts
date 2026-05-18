import { ESLintUtils } from '@typescript-eslint/utils';

/**
 * Rule docs are hosted alongside the rule source. Each rule's
 * `meta.docs.url` resolves to a GitHub blob URL once the repo is
 * published; locally, point at the docs folder.
 */
const DOCS_BASE =
  'https://github.com/Anand-Nandanwar/marketsui-platform/blob/main/packages/tooling/eslint-plugin/docs/rules';

export const createRule = ESLintUtils.RuleCreator(
  (name: string) => `${DOCS_BASE}/${name}.md`,
);
