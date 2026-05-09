/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';

import {
  hasBlockingError,
  validateAppRegistry,
  validatePermission,
  validatePermissionDelete,
  validateRole,
  validateUserProfile,
  validateUserProfileDelete,
} from './index';

describe('validateRole', () => {
  it('blocks save with no permissions', () => {
    const errors = validateRole(
      { roleId: 'admin', displayName: 'Administrator', permissionIds: [] },
      [],
      'create',
    );
    expect(hasBlockingError(errors)).toBe(true);
    expect(errors.map((e) => e.code)).toContain('role.permissions.empty');
  });

  it('blocks save on duplicate id in create mode', () => {
    const existing = [
      { roleId: 'admin', displayName: 'A', permissionIds: ['p:1'] },
    ];
    const errors = validateRole(
      { roleId: 'admin', displayName: 'B', permissionIds: ['p:2'] },
      existing,
      'create',
    );
    expect(errors.map((e) => e.code)).toContain('role.id.duplicate');
  });

  it('does not flag duplicate when editing the same id', () => {
    const existing = [
      { roleId: 'admin', displayName: 'A', permissionIds: ['p:1'] },
    ];
    const errors = validateRole(
      { roleId: 'admin', displayName: 'B', permissionIds: ['p:2'] },
      existing,
      'edit',
    );
    expect(errors.map((e) => e.code)).not.toContain('role.id.duplicate');
  });

  it('blocks empty role id', () => {
    const errors = validateRole(
      { roleId: '', displayName: 'A', permissionIds: ['p:1'] },
      [],
      'create',
    );
    expect(errors.map((e) => e.code)).toContain('role.id.required');
  });
});

describe('validatePermission + delete', () => {
  it('blocks save when description is empty', () => {
    const errors = validatePermission(
      { permissionId: 'config:read', description: '', category: 'config' },
      [],
      'create',
    );
    expect(errors.map((e) => e.code)).toContain('permission.description.required');
  });

  it('blocks delete when a role still references it', () => {
    const errors = validatePermissionDelete(
      { permissionId: 'config:read', description: '', category: 'config' },
      [{ roleId: 'admin', displayName: 'A', permissionIds: ['config:read'] }],
    );
    expect(hasBlockingError(errors)).toBe(true);
    expect(errors.map((e) => e.code)).toContain(
      'permission.delete.referenced',
    );
  });

  it('allows delete when no role references it', () => {
    const errors = validatePermissionDelete(
      { permissionId: 'config:read', description: '', category: 'config' },
      [{ roleId: 'admin', displayName: 'A', permissionIds: ['other'] }],
    );
    expect(errors).toHaveLength(0);
  });
});

describe('validateUserProfile', () => {
  it('blocks duplicate userId on create', () => {
    const errors = validateUserProfile(
      { userId: 'u1', displayName: 'D', appId: 'app1', roleIds: [] },
      [{ userId: 'u1', displayName: 'X', appId: 'app1', roleIds: [] }],
      [],
      'create',
    );
    expect(errors.map((e) => e.code)).toContain(
      'userProfile.id.duplicate',
    );
  });

  it('warns (not blocks) on stranded roleIds', () => {
    const errors = validateUserProfile(
      { userId: 'u1', displayName: 'D', appId: 'app1', roleIds: ['ghost'] },
      [],
      ['admin'],
      'create',
    );
    const stranded = errors.find(
      (e) => e.code === 'userProfile.roleIds.stranded',
    );
    expect(stranded).toBeTruthy();
    expect(stranded?.severity).toBe('warning');
    expect(hasBlockingError(errors)).toBe(false);
  });

  it('blocks save without an appId', () => {
    const errors = validateUserProfile(
      { userId: 'u1', displayName: 'D', appId: '', roleIds: [] },
      [],
      [],
      'create',
    );
    expect(errors.map((e) => e.code)).toContain(
      'userProfile.appId.required',
    );
  });

  it('user-profile delete that strands createdBy emits a warning', () => {
    const errors = validateUserProfileDelete(
      { userId: 'u1', displayName: 'D', appId: 'app1', roleIds: [] },
      ['u1', 'u2'],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('warning');
    expect(hasBlockingError(errors)).toBe(false);
  });
});

describe('validateAppRegistry', () => {
  it('rejects malformed manifest URL', () => {
    const errors = validateAppRegistry(
      {
        appId: 'app1',
        displayName: 'A',
        manifestUrl: 'not-a-url',
        configServiceEnabled: false,
        environment: 'dev',
      },
      [],
      'create',
    );
    expect(errors.map((e) => e.code)).toContain(
      'appRegistry.manifestUrl.invalid',
    );
  });

  it('accepts a valid https manifest URL', () => {
    const errors = validateAppRegistry(
      {
        appId: 'app1',
        displayName: 'A',
        manifestUrl: 'https://x/m.json',
        configServiceEnabled: false,
        environment: 'dev',
      },
      [],
      'create',
    );
    expect(hasBlockingError(errors)).toBe(false);
  });

  it('blocks duplicate appId on create', () => {
    const errors = validateAppRegistry(
      {
        appId: 'app1',
        displayName: 'A',
        manifestUrl: 'https://x/m.json',
        configServiceEnabled: false,
        environment: 'dev',
      },
      [
        {
          appId: 'app1',
          displayName: 'X',
          manifestUrl: 'https://x/m.json',
          configServiceEnabled: false,
          environment: 'dev',
        },
      ],
      'create',
    );
    expect(errors.map((e) => e.code)).toContain(
      'appRegistry.id.duplicate',
    );
  });
});
