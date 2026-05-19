/**
 * Re-export the shared portal target context from `@starui/ui` so
 * `PopoutPortal`, grid-local shadcn wrappers, and `@starui/ui` primitives
 * all read the **same** React context — Radix portals land in the popped-
 * out window's `document.body`, not the parent shell.
 */
export {
  PortalContainerProvider,
  usePortalContainer,
  useResolvedPortalContainer,
  type PortalContainerProviderProps,
} from '@starui/ui';
