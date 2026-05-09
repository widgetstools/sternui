/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ConfigEditorProvider } from './ConfigEditorContext';
import { AppRegistryEditor } from './AppRegistryEditor';
import { createStubClient } from './createStubClient';

afterEach(cleanup);

function renderWithClient(ui: ReactNode, client = createStubClient()) {
  const utils = render(
    <ConfigEditorProvider client={client}>{ui}</ConfigEditorProvider>,
  );
  return { client, ...utils };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AppRegistryEditor', () => {
  it('renders existing apps', async () => {
    const client = createStubClient({
      apps: [
        {
          appId: 'app1',
          displayName: 'App One',
          manifestUrl: 'https://x/m.json',
          configServiceEnabled: true,
          environment: 'dev',
        },
      ],
    });
    renderWithClient(<AppRegistryEditor />, client);
    await flush();

    expect(screen.getByText('App registry')).toBeTruthy();
    expect(screen.getByTestId('app-row-app1')).toBeTruthy();
  });

  it('updates an existing app via the edit drawer', async () => {
    const client = createStubClient({
      apps: [
        {
          appId: 'app1',
          displayName: 'App One',
          manifestUrl: 'https://x/m.json',
          configServiceEnabled: false,
          environment: 'dev',
        },
      ],
    });
    renderWithClient(<AppRegistryEditor />, client);
    await flush();

    fireEvent.click(screen.getByTestId('app-edit-app1'));
    fireEvent.change(screen.getByTestId('app-field-display-name'), {
      target: { value: 'App One v2' },
    });
    fireEvent.click(screen.getByTestId('editor-shell-save'));
    await flush();

    const updated = client.calls.find((c) => c.method === 'apps.update');
    expect(updated).toBeTruthy();
    expect(updated?.args[0]).toBe('app1');
    expect(updated?.args[1]).toMatchObject({
      appId: 'app1',
      displayName: 'App One v2',
      manifestUrl: 'https://x/m.json',
      environment: 'dev',
    });
  });

  it('blocks save when manifest URL is empty', async () => {
    const { client } = renderWithClient(<AppRegistryEditor />);
    await flush();

    fireEvent.click(screen.getByTestId('editor-shell-create'));
    fireEvent.change(screen.getByTestId('app-field-id'), {
      target: { value: 'app2' },
    });
    fireEvent.change(screen.getByTestId('app-field-display-name'), {
      target: { value: 'App Two' },
    });
    const save = screen.getByTestId('editor-shell-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    await flush();
    expect(client.calls).toHaveLength(0);
  });
});
