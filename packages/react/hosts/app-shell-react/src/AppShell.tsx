import { cloneElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import type { ConfigClient } from '@starui/config-service';
import type { RuntimePort } from '@starui/runtime-port';
import { HostWrapper } from '@starui/host-wrapper-react';

/**
 * `<AppShell>` — the single declarative root for any React app that
 * consumes the platform's seams.
 *
 * Collapses what used to live as a stack of provider components in
 * every app's `main.tsx`:
 *
 *     applyTheme(getTheme());
 *     const runtime = new BrowserRuntime({...});      // or async OpenFin
 *     const configManager = createConfigClient({});   // optional
 *     // ...optional DataServices / ConfigServiceProvider wrapping...
 *     <HostWrapper runtime={runtime} configManager={configManager}>
 *       <App />
 *     </HostWrapper>
 *
 * into:
 *
 *     <AppShell
 *       runtime={runtime}
 *       configManager={configManager}
 *       dataServicesProvider={<DataServicesProvider services={ds} />}
 *       configServiceProvider={<ConfigServiceProvider ... />}
 *     >
 *       <App />
 *     </AppShell>
 *
 * **Provider wrap order (outer → inner):**
 *   DataServicesProvider → ConfigServiceProvider → HostWrapper → children
 *
 * That order matters because:
 *   - `ConfigServiceProvider` may call `useDataServices()` to wire its
 *     ConfigManager against the SharedWorker hub.
 *   - `HostWrapper` is the innermost; downstream components reach the
 *     runtime through `useHost()`.
 *
 * **Opt-in design.** Every provider is optional — pass a JSX element
 * to enable it, omit to skip. Apps with no DataServices (demo-react)
 * simply leave `dataServicesProvider` undefined. Apps without
 * ConfigServiceProvider (also demo-react) leave `configServiceProvider`
 * undefined. Both demo-configservice-react and demo-react land on the
 * same root component shape.
 *
 * **Theme application** is intentionally NOT done here — apps call
 * `applyTheme(getTheme())` before `createRoot(...).render(...)` to
 * avoid a flash of unstyled content on first paint. The shell could
 * apply theme inside a useEffect but it would fire AFTER the first
 * paint. Apps keep that one line in their entry file; everything else
 * collapses into the shell.
 */
export interface AppShellProps {
  /**
   * The runtime port. Pass an instance directly, or a Promise
   * (e.g., `OpenFinRuntime.create()`). The HostWrapper renders the
   * `loading` fallback until the promise resolves.
   */
  readonly runtime: RuntimePort | Promise<RuntimePort>;

  /**
   * The config client. Pass an instance, a Promise, or omit when the
   * app does not use config storage.
   *
   * When omitted, `useHost().configManager` is unavailable — leaf
   * components that rely on it must read it from another provider
   * (e.g., one supplied via `configServiceProvider`).
   */
  readonly configManager?: ConfigClient | Promise<ConfigClient>;

  /**
   * Optional pre-bound `<DataServicesProvider>` element. The shell
   * does not import `@starui/data-services-react` directly so apps
   * that don't use it incur no transitive cost.
   *
   * Pass the element pre-bound with the services bundle:
   *   `<DataServicesProvider services={dataServices}>`
   * (the shell injects children inside it).
   */
  readonly dataServicesProvider?: ReactElement;

  /**
   * Optional pre-bound `<ConfigServiceProvider>` element. The shell
   * does not import `@starui/config-service-react` directly so apps
   * that don't use it incur no transitive cost.
   *
   * Pass the element pre-bound with identity/appId/restUrl:
   *   `<ConfigServiceProvider identity={...} appId={...} restUrl={...}>`
   * (the shell injects children inside it).
   */
  readonly configServiceProvider?: ReactElement;

  /**
   * Optional render-prop layer that wraps `<HostWrapper>`. Use when an
   * app needs to derive the `configManager` for HostWrapper from a
   * surrounding provider (e.g., reading the live `ConfigManager` out
   * of `useConfigService()` to build a `ConfigClient`).
   *
   * When supplied, the shell renders:
   *   {hostWrapperRender(children)}
   * instead of its built-in HostWrapper. The function MUST end the
   * tree with a HostWrapper that includes `children`.
   *
   * Used by markets-ui-react-reference where `HostWrapperWithProviderClient`
   * reads `useConfigService()` to derive its ConfigClient.
   */
  readonly hostWrapper?: (children: ReactNode) => ReactNode;

  /**
   * Optional render-prop placed at the OUTERMOST layer of the shell
   * (above DataServicesProvider). Use for app-wide concerns like a
   * theme context. Pass nothing when no extra wrapping is needed.
   */
  readonly outer?: ComponentType<{ children: ReactNode }>;

  /** Loading fallback rendered while runtime/configManager promises resolve. */
  readonly loading?: ReactNode;

  /** App tree. */
  readonly children: ReactNode;
}

export function AppShell(props: AppShellProps): ReactNode {
  const {
    runtime,
    configManager,
    dataServicesProvider,
    configServiceProvider,
    hostWrapper,
    outer: Outer,
    loading,
    children,
  } = props;

  // Build the tree inside-out: children → HostWrapper → optional
  // ConfigServiceProvider → optional DataServicesProvider → optional
  // outer wrapper. Each layer is gated by a presence check.
  let tree: ReactNode;

  if (hostWrapper) {
    // App supplied its own HostWrapper render (reads from a surrounding
    // provider to derive ConfigClient). The shell defers to it; the
    // function is responsible for wrapping its argument with a real
    // HostWrapper that completes the seam.
    tree = hostWrapper(children);
  } else {
    // Default path — shell mounts HostWrapper directly. Apps without a
    // configManager will see `useHost().configManager` throw, which is
    // intentional: forcing the prop early avoids "works in dev, breaks
    // when first component reads it" failures.
    if (!configManager) {
      throw new Error(
        '[AppShell] `configManager` is required when `hostWrapper` is not supplied. ' +
          'Pass either a ConfigClient (eager or Promise), or supply a `hostWrapper` ' +
          'render that builds a HostWrapper from a downstream provider.',
      );
    }
    tree = (
      <HostWrapper runtime={runtime} configManager={configManager} loading={loading}>
        {children}
      </HostWrapper>
    );
  }

  // ConfigService — wraps the HostWrapper so its hook is available to
  // `hostWrapper` render-props that need to read it.
  if (configServiceProvider) {
    tree = cloneElementWithChild(configServiceProvider, tree);
  }

  // DataServices — outermost provider so ConfigServiceProvider can
  // call `useDataServices()` if its options require it.
  if (dataServicesProvider) {
    tree = cloneElementWithChild(dataServicesProvider, tree);
  }

  // Outer custom layer (theme, error boundary, etc.).
  if (Outer) {
    tree = <Outer>{tree}</Outer>;
  }

  return tree;
}

/**
 * Clone a JSX element and inject `child` as its children. Used to
 * thread the inner tree through opt-in provider elements that the
 * shell doesn't import directly.
 *
 * `React.cloneElement` preserves the original element's props (e.g.
 * `services`, `identity`, `appId`) and only overrides `children`.
 */
function cloneElementWithChild(
  element: ReactElement,
  child: ReactNode,
): ReactElement {
  return cloneElement(element as ReactElement<{ children?: ReactNode }>, { children: child });
}
