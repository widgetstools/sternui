/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RoleRow, UserProfileRow } from '@starui/config-service';

import { RoleAssignmentMatrix } from './RoleAssignmentMatrix';

afterEach(cleanup);

const ROLES: RoleRow[] = [
  { roleId: 'admin', displayName: 'Administrator', permissionIds: [] },
  { roleId: 'developer', displayName: 'Developer', permissionIds: [] },
  { roleId: 'viewer', displayName: 'Viewer', permissionIds: [] },
];

const USERS: UserProfileRow[] = [
  {
    userId: 'alice',
    appId: 'app-1',
    displayName: 'Alice',
    roleIds: ['developer'],
  },
  {
    userId: 'bob',
    appId: 'app-1',
    displayName: 'Bob',
    roleIds: ['admin', 'developer'],
  },
];

function Harness({
  initialUsers,
  roles,
  initialMode,
  onChange,
}: {
  initialUsers: UserProfileRow[];
  roles: RoleRow[];
  initialMode?: 'by-user' | 'by-role';
  onChange?: (next: UserProfileRow[]) => void;
}) {
  const [users, setUsers] = useState(initialUsers);
  return (
    <RoleAssignmentMatrix
      users={users}
      roles={roles}
      initialMode={initialMode}
      onChange={(next) => {
        setUsers(next);
        onChange?.(next);
      }}
    />
  );
}

describe('RoleAssignmentMatrix', () => {
  it('renders by-user layout with assigned chips', () => {
    render(<Harness initialUsers={USERS} roles={ROLES} />);

    expect(screen.getByTestId('role-assignment-matrix-user-alice')).toBeTruthy();
    expect(screen.getByTestId('role-assignment-matrix-user-bob')).toBeTruthy();
    expect(
      screen.getByTestId('role-assignment-matrix-chip-alice-developer'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('role-assignment-matrix-chip-bob-admin'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('role-assignment-matrix-chip-bob-developer'),
    ).toBeTruthy();
  });

  it('removes a chip and emits the next users array (by-user)', () => {
    const onChange = vi.fn();
    render(
      <Harness initialUsers={USERS} roles={ROLES} onChange={onChange} />,
    );

    fireEvent.click(
      screen.getByTestId('role-assignment-matrix-chip-alice-developer-remove'),
    );

    const next = onChange.mock.calls[0][0] as UserProfileRow[];
    expect(next.find((u) => u.userId === 'alice')?.roleIds).toEqual([]);
    expect(next.find((u) => u.userId === 'bob')?.roleIds).toEqual([
      'admin',
      'developer',
    ]);
  });

  it('adds a role via the picker (by-user)', () => {
    const onChange = vi.fn();
    render(
      <Harness initialUsers={USERS} roles={ROLES} onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId('role-assignment-matrix-add-alice'));
    fireEvent.click(
      screen.getByTestId('role-assignment-matrix-add-alice-option-viewer'),
    );

    const next = onChange.mock.calls[0][0] as UserProfileRow[];
    expect(next.find((u) => u.userId === 'alice')?.roleIds).toEqual([
      'developer',
      'viewer',
    ]);
  });

  it('switches to by-role layout and shows users assigned to each role', () => {
    render(<Harness initialUsers={USERS} roles={ROLES} />);

    fireEvent.click(
      screen.getByTestId('role-assignment-matrix-mode-by-role'),
    );

    expect(screen.getByTestId('role-assignment-matrix-role-admin')).toBeTruthy();
    expect(
      screen.getByTestId('role-assignment-matrix-chip-admin-bob'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('role-assignment-matrix-chip-developer-alice'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('role-assignment-matrix-chip-developer-bob'),
    ).toBeTruthy();
  });

  it('removes a chip and emits the next users array (by-role)', () => {
    const onChange = vi.fn();
    render(
      <Harness
        initialUsers={USERS}
        roles={ROLES}
        initialMode="by-role"
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByTestId('role-assignment-matrix-chip-admin-bob-remove'),
    );

    const next = onChange.mock.calls[0][0] as UserProfileRow[];
    expect(next.find((u) => u.userId === 'bob')?.roleIds).toEqual(['developer']);
  });

  it('adds a user via the picker (by-role)', () => {
    const onChange = vi.fn();
    render(
      <Harness
        initialUsers={USERS}
        roles={ROLES}
        initialMode="by-role"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('role-assignment-matrix-add-viewer'));
    fireEvent.click(
      screen.getByTestId('role-assignment-matrix-add-viewer-option-alice'),
    );

    const next = onChange.mock.calls[0][0] as UserProfileRow[];
    expect(next.find((u) => u.userId === 'alice')?.roleIds).toEqual([
      'developer',
      'viewer',
    ]);
  });

  it('filters users in by-user mode', () => {
    render(<Harness initialUsers={USERS} roles={ROLES} />);

    act(() => {
      fireEvent.change(
        screen.getByTestId('role-assignment-matrix-filter'),
        { target: { value: 'alice' } },
      );
    });

    expect(screen.getByTestId('role-assignment-matrix-user-alice')).toBeTruthy();
    expect(screen.queryByTestId('role-assignment-matrix-user-bob')).toBeNull();
  });

  it('filters roles in by-role mode', () => {
    render(
      <Harness initialUsers={USERS} roles={ROLES} initialMode="by-role" />,
    );

    act(() => {
      fireEvent.change(
        screen.getByTestId('role-assignment-matrix-filter'),
        { target: { value: 'admin' } },
      );
    });

    expect(screen.getByTestId('role-assignment-matrix-role-admin')).toBeTruthy();
    expect(screen.queryByTestId('role-assignment-matrix-role-developer')).toBeNull();
  });
});
