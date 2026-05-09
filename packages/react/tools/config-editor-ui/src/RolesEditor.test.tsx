/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ConfigEditorProvider } from './ConfigEditorContext';
import { RolesEditor } from './RolesEditor';
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

describe('RolesEditor', () => {
  it('renders existing roles', async () => {
    const client = createStubClient({
      roles: [
        { roleId: 'admin', displayName: 'Administrator', permissionIds: ['p:1'] },
      ],
    });
    renderWithClient(<RolesEditor />, client);
    await flush();

    expect(screen.getByText('Roles')).toBeTruthy();
    expect(screen.getByTestId('role-row-admin')).toBeTruthy();
    expect(screen.getByText('Administrator')).toBeTruthy();
  });

  it('saves a new role through the stubbed ConfigClient', async () => {
    const { client } = renderWithClient(<RolesEditor />);
    await flush();

    fireEvent.click(screen.getByTestId('editor-shell-create'));
    fireEvent.change(screen.getByTestId('role-field-id'), {
      target: { value: 'developer' },
    });
    fireEvent.change(screen.getByTestId('role-field-display-name'), {
      target: { value: 'Developer' },
    });
    fireEvent.change(screen.getByTestId('role-field-permissions'), {
      target: { value: 'config:read, config:write' },
    });

    fireEvent.click(screen.getByTestId('editor-shell-save'));
    await flush();

    const created = client.calls.find((c) => c.method === 'roles.create');
    expect(created).toBeTruthy();
    expect(created?.args[0]).toEqual({
      roleId: 'developer',
      displayName: 'Developer',
      permissionIds: ['config:read', 'config:write'],
    });
  });

  it('blocks save when validation fails (empty role id)', async () => {
    const { client } = renderWithClient(<RolesEditor />);
    await flush();

    fireEvent.click(screen.getByTestId('editor-shell-create'));
    fireEvent.change(screen.getByTestId('role-field-display-name'), {
      target: { value: 'No id' },
    });

    const save = screen.getByTestId('editor-shell-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    await flush();
    expect(client.calls).toHaveLength(0);
  });
});
