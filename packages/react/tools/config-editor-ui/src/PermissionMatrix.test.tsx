/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PermissionRow, RoleRow } from '@starui/config-service';

import { PermissionMatrix } from './PermissionMatrix';

afterEach(cleanup);

const PERMISSIONS: PermissionRow[] = [
  { permissionId: 'config:read', description: 'Read configs', category: 'config' },
  { permissionId: 'config:write', description: 'Write configs', category: 'config' },
  { permissionId: 'admin:users', description: 'Manage users', category: 'admin' },
];

const ROLES: RoleRow[] = [
  {
    roleId: 'developer',
    displayName: 'Developer',
    permissionIds: ['config:read'],
  },
  { roleId: 'admin', displayName: 'Administrator', permissionIds: [] },
];

function Harness({
  initialRoles,
  permissions,
  onChange,
}: {
  initialRoles: RoleRow[];
  permissions: PermissionRow[];
  onChange?: (next: RoleRow[]) => void;
}) {
  const [roles, setRoles] = useState(initialRoles);
  return (
    <PermissionMatrix
      roles={roles}
      permissions={permissions}
      onChange={(next) => {
        setRoles(next);
        onChange?.(next);
      }}
    />
  );
}

describe('PermissionMatrix', () => {
  it('renders one row per role and groups columns by category', () => {
    render(<Harness initialRoles={ROLES} permissions={PERMISSIONS} />);

    expect(screen.getByTestId('permission-matrix-row-developer')).toBeTruthy();
    expect(screen.getByTestId('permission-matrix-row-admin')).toBeTruthy();
    expect(screen.getByTestId('permission-matrix-category-config')).toBeTruthy();
    expect(screen.getByTestId('permission-matrix-category-admin')).toBeTruthy();
    expect(screen.getByTestId('permission-matrix-col-config:read')).toBeTruthy();
    expect(screen.getByTestId('permission-matrix-col-admin:users')).toBeTruthy();
  });

  it('toggles a cell and emits the next roles array', () => {
    const onChange = vi.fn();
    render(
      <Harness
        initialRoles={ROLES}
        permissions={PERMISSIONS}
        onChange={onChange}
      />,
    );

    const cell = screen.getByTestId(
      'permission-matrix-cell-admin-config:write',
    );
    fireEvent.click(cell);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as RoleRow[];
    const adminRow = next.find((r) => r.roleId === 'admin');
    expect(adminRow?.permissionIds).toEqual(['config:write']);
    const devRow = next.find((r) => r.roleId === 'developer');
    expect(devRow?.permissionIds).toEqual(['config:read']);
  });

  it('removes a permission when toggling an already-granted cell', () => {
    const onChange = vi.fn();
    render(
      <Harness
        initialRoles={ROLES}
        permissions={PERMISSIONS}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByTestId('permission-matrix-cell-developer-config:read'),
    );

    const next = onChange.mock.calls[0][0] as RoleRow[];
    expect(next.find((r) => r.roleId === 'developer')?.permissionIds).toEqual(
      [],
    );
  });

  it('filters permissions by id, description, and category', () => {
    render(<Harness initialRoles={ROLES} permissions={PERMISSIONS} />);

    const filter = screen.getByTestId(
      'permission-matrix-filter',
    ) as HTMLInputElement;

    act(() => {
      fireEvent.change(filter, { target: { value: 'admin' } });
    });

    expect(screen.queryByTestId('permission-matrix-category-config')).toBeNull();
    expect(screen.getByTestId('permission-matrix-category-admin')).toBeTruthy();
    expect(screen.getByTestId('permission-matrix-col-admin:users')).toBeTruthy();
    expect(screen.queryByTestId('permission-matrix-col-config:read')).toBeNull();
  });

  it('shows an empty-state when no permissions match the filter', () => {
    render(<Harness initialRoles={ROLES} permissions={PERMISSIONS} />);

    const filter = screen.getByTestId('permission-matrix-filter');
    act(() => {
      fireEvent.change(filter, { target: { value: 'nope-no-match' } });
    });

    expect(
      screen.getByText('No permissions match the filter.'),
    ).toBeTruthy();
  });

  it('shows an empty-state when no roles are defined', () => {
    render(<Harness initialRoles={[]} permissions={PERMISSIONS} />);

    expect(screen.getByText('No roles defined.')).toBeTruthy();
  });
});
