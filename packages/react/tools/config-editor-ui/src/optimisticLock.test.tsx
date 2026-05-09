/**
 * @vitest-environment jsdom
 *
 * Optimistic-lock dialog flow — covers the AlertDialog surface that
 * fires when the row was modified between edit-start and save
 * (Decision 12.5 / Session 14.3). The four editors share the same
 * shape; we exercise the RolesEditor as the canonical case and rely on
 * the unit-level guard test for the other tables.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ConfigEditorProvider } from './ConfigEditorContext';
import { RolesEditor } from './RolesEditor';
import { createStubClient, type StubClient } from './createStubClient';
import {
  EditorOptimisticLockError,
  guardOptimisticUpdate,
  isOptimisticLockError,
} from './useOptimisticUpdate';

afterEach(cleanup);

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('guardOptimisticUpdate', () => {
  it('passes when expectedUpdatedTime matches the current row', async () => {
    await expect(
      guardOptimisticUpdate({
        expectedUpdatedTime: '2026-05-01T00:00:00.000Z',
        fetchCurrent: async () => ({
          updatedTime: '2026-05-01T00:00:00.000Z',
        }),
      }),
    ).resolves.toBeUndefined();
  });

  it('throws EditorOptimisticLockError when stale', async () => {
    await expect(
      guardOptimisticUpdate({
        expectedUpdatedTime: '2026-05-01T00:00:00.000Z',
        fetchCurrent: async () => ({
          updatedTime: '2026-05-02T00:00:00.000Z',
        }),
      }),
    ).rejects.toBeInstanceOf(EditorOptimisticLockError);
  });

  it('isOptimisticLockError matches the editor-local error', () => {
    expect(isOptimisticLockError(new EditorOptimisticLockError(undefined))).toBe(
      true,
    );
    expect(isOptimisticLockError(new Error('nope'))).toBe(false);
  });
});

describe('RolesEditor — optimistic lock dialog', () => {
  function setup(): StubClient {
    return createStubClient({
      roles: [
        {
          roleId: 'admin',
          displayName: 'Administrator',
          permissionIds: ['p:1'],
          updatedTime: '2026-05-01T00:00:00.000Z',
        },
      ],
      permissions: [
        { permissionId: 'p:1', description: 'P1', category: 'config' },
      ],
    });
  }

  it('shows the dialog when the row was changed concurrently', async () => {
    const client = setup();
    render(
      <ConfigEditorProvider client={client}>
        <RolesEditor />
      </ConfigEditorProvider>,
    );
    await flush();

    fireEvent.click(screen.getByTestId('role-edit-admin'));
    await flush();

    // Simulate a concurrent writer bumping updatedTime via the stub.
    await client.roles.update('admin', {
      roleId: 'admin',
      displayName: 'Administrator',
      permissionIds: ['p:1'],
      updatedTime: '2026-05-02T00:00:00.000Z',
    });

    fireEvent.change(screen.getByTestId('role-field-display-name'), {
      target: { value: 'Administrator (mine)' },
    });
    fireEvent.click(screen.getByTestId('editor-shell-save'));
    await flush();

    expect(
      screen.getByTestId('editor-optimistic-lock-dialog'),
    ).toBeTruthy();
  });

  it('reload refreshes the editor draft from disk', async () => {
    const client = setup();
    render(
      <ConfigEditorProvider client={client}>
        <RolesEditor />
      </ConfigEditorProvider>,
    );
    await flush();

    fireEvent.click(screen.getByTestId('role-edit-admin'));
    await flush();

    await client.roles.update('admin', {
      roleId: 'admin',
      displayName: 'Administrator (concurrent)',
      permissionIds: ['p:1'],
      updatedTime: '2026-05-02T00:00:00.000Z',
    });

    fireEvent.change(screen.getByTestId('role-field-display-name'), {
      target: { value: 'Administrator (mine)' },
    });
    fireEvent.click(screen.getByTestId('editor-shell-save'));
    await flush();

    fireEvent.click(screen.getByTestId('editor-optimistic-lock-reload'));
    await flush();

    const displayName = screen.getByTestId(
      'role-field-display-name',
    ) as HTMLInputElement;
    expect(displayName.value).toBe('Administrator (concurrent)');
  });
});
