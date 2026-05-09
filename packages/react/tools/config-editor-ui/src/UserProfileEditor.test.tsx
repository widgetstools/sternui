/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ConfigEditorProvider } from './ConfigEditorContext';
import { UserProfileEditor } from './UserProfileEditor';
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

describe('UserProfileEditor', () => {
  it('renders existing profiles with role chips', async () => {
    const client = createStubClient({
      apps: [
        {
          appId: 'app1',
          displayName: 'App One',
          manifestUrl: '',
          configServiceEnabled: true,
          environment: 'dev',
        },
      ],
      roles: [
        { roleId: 'admin', displayName: 'Administrator', permissionIds: [] },
      ],
      userProfiles: [
        {
          userId: 'u1',
          displayName: 'User One',
          appId: 'app1',
          roleIds: ['admin'],
        },
      ],
    });
    renderWithClient(<UserProfileEditor />, client);
    await flush();

    expect(screen.getByText('User profiles')).toBeTruthy();
    expect(screen.getByTestId('user-profile-row-u1')).toBeTruthy();
    expect(screen.getByText('Administrator')).toBeTruthy();
  });

  it('saves a new user profile with no roles selected', async () => {
    const client = createStubClient({
      apps: [
        {
          appId: 'app1',
          displayName: 'App One',
          manifestUrl: '',
          configServiceEnabled: true,
          environment: 'dev',
        },
      ],
    });
    renderWithClient(<UserProfileEditor />, client);
    await flush();

    fireEvent.click(screen.getByTestId('editor-shell-create'));
    fireEvent.change(screen.getByTestId('user-profile-field-id'), {
      target: { value: 'u2' },
    });
    fireEvent.change(screen.getByTestId('user-profile-field-display-name'), {
      target: { value: 'User Two' },
    });
    // Apps come from the seeded list — fallback path uses an Input,
    // since Radix Select trigger isn't reliably pointer-driven in jsdom.
    // We set appId via direct input fallback if present, else seed
    // the draft through edit. Here we drive create with a manual
    // text-input fallback by re-rendering after wiping apps.
    // Simpler: re-render with no apps so the Input fallback is used.
    cleanup();
    const client2 = createStubClient();
    const r2 = render(
      <ConfigEditorProvider client={client2}>
        <UserProfileEditor />
      </ConfigEditorProvider>,
    );
    await flush();
    fireEvent.click(r2.getByTestId('editor-shell-create'));
    fireEvent.change(r2.getByTestId('user-profile-field-id'), {
      target: { value: 'u2' },
    });
    fireEvent.change(r2.getByTestId('user-profile-field-display-name'), {
      target: { value: 'User Two' },
    });
    fireEvent.change(r2.getByTestId('user-profile-field-app-id'), {
      target: { value: 'app1' },
    });
    fireEvent.click(r2.getByTestId('editor-shell-save'));
    await flush();

    const created = client2.calls.find(
      (c) => c.method === 'userProfiles.create',
    );
    expect(created).toBeTruthy();
    expect(created?.args[0]).toEqual({
      userId: 'u2',
      displayName: 'User Two',
      appId: 'app1',
      roleIds: [],
    });
  });

  it('toggles a role chip via the popover checkbox', async () => {
    const client = createStubClient({
      roles: [
        { roleId: 'admin', displayName: 'Administrator', permissionIds: [] },
      ],
      apps: [],
      userProfiles: [
        {
          userId: 'u1',
          displayName: 'User One',
          appId: 'app1',
          roleIds: [],
        },
      ],
    });
    renderWithClient(<UserProfileEditor />, client);
    await flush();

    fireEvent.click(screen.getByTestId('user-profile-edit-u1'));
    // Popover may not open in jsdom without pointer events — drive
    // the checkbox via its known data-testid which renders in the
    // DOM regardless of popover open state (Radix portals it but
    // Testing Library still queries the document).
    fireEvent.click(screen.getByTestId('user-profile-field-roles-trigger'));
    await flush();
    const toggle = screen.getByTestId('user-profile-role-toggle-admin');
    fireEvent.click(toggle);

    fireEvent.click(screen.getByTestId('editor-shell-save'));
    await flush();

    const updated = client.calls.find((c) => c.method === 'userProfiles.update');
    expect(updated).toBeTruthy();
    expect(updated?.args[0]).toBe('u1');
    expect(updated?.args[1]).toMatchObject({ roleIds: ['admin'] });
  });
});
