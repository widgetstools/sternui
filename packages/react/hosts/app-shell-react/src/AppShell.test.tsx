import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppShell } from './AppShell.js';
import type { RuntimePort } from '@starui/runtime-port';
import type { ConfigClient } from '@starui/config-service';

afterEach(() => cleanup());

function makeRuntime(): RuntimePort {
  return {
    name: 'browser',
    resolveIdentity: () => ({
      instanceId: 'test',
      appId: 'test',
      userId: 'test',
      componentType: 'Test',
      componentSubType: '',
      isTemplate: false,
      singleton: false,
      roles: [],
      permissions: [],
      customData: {},
    }),
    openSurface: async () => { throw new Error('not used'); },
    getTheme: () => 'light',
    onThemeChanged: () => () => {},
    onWindowShown: () => () => {},
    onWindowClosing: () => () => {},
    onCustomDataChanged: () => () => {},
    onWorkspaceSave: () => () => {},
    dispose: () => {},
  };
}

function makeConfigClient(): ConfigClient {
  // ConfigClient surface is wide; cast through unknown for tests
  // that only need HostWrapper to accept the prop.
  return {} as unknown as ConfigClient;
}

describe('AppShell', () => {
  it('renders children inside HostWrapper when only runtime + configManager are provided', async () => {
    render(
      <AppShell runtime={makeRuntime()} configManager={makeConfigClient()}>
        <div data-testid="app-child">hi</div>
      </AppShell>,
    );
    expect((await screen.findByTestId('app-child')).textContent).toBe('hi');
  });

  it('throws when configManager is missing and no hostWrapper render-prop is supplied', () => {
    // React 19 surfaces the throw through an error event during the
    // initial render. Catching via console.error suppression isn't
    // needed because the error fires before commit.
    expect(() =>
      render(
        // @ts-expect-error — intentionally omitting configManager
        <AppShell runtime={makeRuntime()}>
          <div />
        </AppShell>,
      ),
    ).toThrow(/configManager.*required/);
  });

  it('wraps with dataServicesProvider and configServiceProvider when supplied', async () => {
    const dsCalled: string[] = [];
    const csCalled: string[] = [];
    function DSP({ children }: { children?: React.ReactNode }) {
      dsCalled.push('rendered');
      return <div data-testid="dsp">{children}</div>;
    }
    function CSP({ children }: { children?: React.ReactNode }) {
      csCalled.push('rendered');
      return <div data-testid="csp">{children}</div>;
    }
    render(
      <AppShell
        runtime={makeRuntime()}
        configManager={makeConfigClient()}
        dataServicesProvider={<DSP />}
        configServiceProvider={<CSP />}
      >
        <div data-testid="app-child">hi</div>
      </AppShell>,
    );
    expect((await screen.findByTestId('app-child')).textContent).toBe('hi');
    expect(dsCalled).toHaveLength(1);
    expect(csCalled).toHaveLength(1);
    // dsp wraps csp (outer → inner)
    const dsp = screen.getByTestId('dsp');
    const csp = screen.getByTestId('csp');
    expect(dsp.contains(csp)).toBe(true);
  });

  it('defers to hostWrapper render-prop and skips the default HostWrapper', async () => {
    const calls: string[] = [];
    render(
      <AppShell
        runtime={makeRuntime()}
        hostWrapper={(children) => {
          calls.push('hostWrapper-render');
          return <div data-testid="custom-wrapper">{children}</div>;
        }}
      >
        <div data-testid="app-child">hi</div>
      </AppShell>,
    );
    expect((await screen.findByTestId('app-child')).textContent).toBe('hi');
    expect(screen.getByTestId('custom-wrapper')).toBeTruthy();
    expect(calls).toEqual(['hostWrapper-render']);
  });

  it('applies the outer wrapper at the outermost layer', async () => {
    function Outer({ children }: { children: React.ReactNode }) {
      return <div data-testid="outer">{children}</div>;
    }
    render(
      <AppShell
        runtime={makeRuntime()}
        configManager={makeConfigClient()}
        outer={Outer}
      >
        <div data-testid="app-child">hi</div>
      </AppShell>,
    );
    expect((await screen.findByTestId('app-child')).textContent).toBe('hi');
    const outer = screen.getByTestId('outer');
    const child = screen.getByTestId('app-child');
    expect(outer.contains(child)).toBe(true);
  });
});
