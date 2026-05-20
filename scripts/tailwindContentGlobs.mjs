/**
 * Static Tailwind content globs (relative paths only — safe for PostCSS/jiti).
 * Pick the helper that matches app depth under `apps/`.
 */

/** apps/<name>/ — e.g. demo-react, markets-ui-react-reference (3 levels to repo root) */
export const platformAppTailwindContent = [
  '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/ui/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-ui/ui/dist/**/*.{js,mjs}',
  '../../../node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/widgets-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  '../../../node_modules/@starui/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/grid/src/**/*.{ts,tsx}',
];

/** apps/demo-apps/<name>/ (4 levels to repo root) */
export const demoAppTailwindContent = [
  '../../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/ui/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-ui/ui/dist/**/*.{js,mjs}',
  '../../../../node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/widgets-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  '../../../../node_modules/@starui/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/grid/src/**/*.{ts,tsx}',
];

/** External tarball consumers (MCP templates) — scan installed package trees only. */
export const externalConsumerTailwindContent = [
  './node_modules/@starui/ui/dist/**/*.{js,mjs}',
  './node_modules/@starui/ui/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-ui/ui/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-ui/ui/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-grid/grid/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-grid/grid/src/**/*.{ts,tsx}',
  './node_modules/@starui/grid/dist/**/*.{js,mjs}',
  './node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  './node_modules/@starui/widgets-react/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  './node_modules/@starui/config-browser/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-core/config-browser/src/**/*.{ts,tsx}',
];
