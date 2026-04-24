import Joi from 'joi';
import type {
  AppRegistryRow,
  UserProfileRow,
  RoleRow,
  PermissionRow,
} from '../storage/IAuthStorage.js';

// ─── Full-row schemas ────────────────────────────────────────────────

export const appRegistrySchema = Joi.object({
  appId: Joi.string().min(1).max(200).required(),
  displayName: Joi.string().min(1).max(200).required(),
  manifestUrl: Joi.string().min(1).max(1000).required(),
  configServiceEnabled: Joi.boolean().required(),
  environment: Joi.string().min(1).max(50).required(),
  updatedTime: Joi.string().isoDate().required(),
});

export const userProfileSchema = Joi.object({
  userId: Joi.string().min(1).max(200).required(),
  appId: Joi.string().min(1).max(200).required(),
  roleIds: Joi.array().items(Joi.string().min(1).max(200)).required(),
  displayName: Joi.string().min(1).max(200).required(),
  updatedTime: Joi.string().isoDate().required(),
});

export const roleSchema = Joi.object({
  roleId: Joi.string().min(1).max(200).required(),
  displayName: Joi.string().min(1).max(200).required(),
  permissionIds: Joi.array().items(Joi.string().min(1).max(200)).required(),
  updatedTime: Joi.string().isoDate().required(),
});

export const permissionSchema = Joi.object({
  permissionId: Joi.string().min(1).max(200).required(),
  description: Joi.string().min(1).max(500).required(),
  category: Joi.string().max(100).allow('').required(),
  updatedTime: Joi.string().isoDate().required(),
});

// ─── Partial-update schemas ──────────────────────────────────────────

export const appRegistryUpdateSchema = Joi.object({
  displayName: Joi.string().min(1).max(200).optional(),
  manifestUrl: Joi.string().min(1).max(1000).optional(),
  configServiceEnabled: Joi.boolean().optional(),
  environment: Joi.string().min(1).max(50).optional(),
}).min(1);

export const userProfileUpdateSchema = Joi.object({
  appId: Joi.string().min(1).max(200).optional(),
  roleIds: Joi.array().items(Joi.string().min(1).max(200)).optional(),
  displayName: Joi.string().min(1).max(200).optional(),
}).min(1);

export const roleUpdateSchema = Joi.object({
  displayName: Joi.string().min(1).max(200).optional(),
  permissionIds: Joi.array().items(Joi.string().min(1).max(200)).optional(),
}).min(1);

export const permissionUpdateSchema = Joi.object({
  description: Joi.string().min(1).max(500).optional(),
  category: Joi.string().max(100).allow('').optional(),
}).min(1);

// ─── Seed schema ─────────────────────────────────────────────────────

export const seedDataSchema = Joi.object({
  appRegistry: Joi.array()
    .items(
      Joi.object({
        appId: Joi.string().min(1).max(200).required(),
        displayName: Joi.string().min(1).max(200).required(),
        manifestUrl: Joi.string().min(1).max(1000).required(),
        configServiceEnabled: Joi.boolean().required(),
        environment: Joi.string().min(1).max(50).required(),
      }),
    )
    .optional(),
  userProfiles: Joi.array()
    .items(
      Joi.object({
        userId: Joi.string().min(1).max(200).required(),
        appId: Joi.string().min(1).max(200).required(),
        roleIds: Joi.array().items(Joi.string().min(1).max(200)).required(),
        displayName: Joi.string().min(1).max(200).required(),
      }),
    )
    .optional(),
  roles: Joi.array()
    .items(
      Joi.object({
        roleId: Joi.string().min(1).max(200).required(),
        displayName: Joi.string().min(1).max(200).required(),
        permissionIds: Joi.array().items(Joi.string().min(1).max(200)).required(),
      }),
    )
    .optional(),
  permissions: Joi.array()
    .items(
      Joi.object({
        permissionId: Joi.string().min(1).max(200).required(),
        description: Joi.string().min(1).max(500).required(),
        category: Joi.string().max(100).allow('').optional(),
      }),
    )
    .optional(),
});

// ─── Util façade ─────────────────────────────────────────────────────

function join(err: Joi.ValidationError): string {
  return err.details.map((d) => d.message).join(', ');
}

export class AuthValidationUtils {
  static validateApp(row: any): { error?: string; value?: AppRegistryRow } {
    const { error, value } = appRegistrySchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return { value };
  }

  static validateAppUpdate(row: any): { error?: string } {
    const { error } = appRegistryUpdateSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return {};
  }

  static validateUserProfile(row: any): { error?: string; value?: UserProfileRow } {
    const { error, value } = userProfileSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return { value };
  }

  static validateUserProfileUpdate(row: any): { error?: string } {
    const { error } = userProfileUpdateSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return {};
  }

  static validateRole(row: any): { error?: string; value?: RoleRow } {
    const { error, value } = roleSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return { value };
  }

  static validateRoleUpdate(row: any): { error?: string } {
    const { error } = roleUpdateSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return {};
  }

  static validatePermission(row: any): { error?: string; value?: PermissionRow } {
    const { error, value } = permissionSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return { value };
  }

  static validatePermissionUpdate(row: any): { error?: string } {
    const { error } = permissionUpdateSchema.validate(row, { abortEarly: false });
    if (error) return { error: join(error) };
    return {};
  }

  static validateSeedData(data: any): { error?: string; value?: any } {
    const { error, value } = seedDataSchema.validate(data, { abortEarly: false });
    if (error) return { error: join(error) };
    return { value };
  }
}
