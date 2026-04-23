import Joi from 'joi';
import type { UnifiedConfig, ConfigurationFilter } from '@stern/shared-types';

const configVersionSchema = Joi.object({
  versionId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  config: Joi.any().required(),
  createdTime: Joi.date().required(),
  updatedTime: Joi.date().required(),
  isActive: Joi.boolean().required(),
  metadata: Joi.any().optional()
});

export const unifiedConfigSchema = Joi.object({
  configId: Joi.string().uuid().required(),
  appId: Joi.string().min(1).max(100).required(),
  userId: Joi.string().min(1).max(100).required(),
  parentId: Joi.string().max(100).allow(null).optional(),
  componentType: Joi.string().min(1).max(100).required(),
  componentSubType: Joi.string().min(1).max(100).optional(),
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(1000).optional(),
  icon: Joi.string().max(200).optional(),
  config: Joi.any().required(),
  settings: Joi.array().items(configVersionSchema).required(),
  activeSetting: Joi.alternatives().try(
    Joi.string().uuid(),
    Joi.string().valid('', 'temp-uuid'),
    Joi.allow(null)
  ).required(),
  tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
  category: Joi.string().max(100).optional(),
  isShared: Joi.boolean().optional(),
  isDefault: Joi.boolean().optional(),
  isLocked: Joi.boolean().optional(),
  createdBy: Joi.string().min(1).max(100).required(),
  lastUpdatedBy: Joi.string().min(1).max(100).required(),
  creationTime: Joi.date().required(),
  lastUpdated: Joi.date().required(),
  deletedAt: Joi.date().allow(null).optional(),
  deletedBy: Joi.string().max(100).allow(null).optional(),
  // Hierarchy fields (optional)
  nodeId: Joi.string().max(100).optional(),
  nodePath: Joi.string().max(500).optional(),
  inheritanceStrategy: Joi.string().valid('REPLACE', 'SHALLOW_MERGE', 'DEEP_MERGE').optional(),
  inheritanceRules: Joi.object({
    strategy: Joi.string().valid('REPLACE', 'SHALLOW_MERGE', 'DEEP_MERGE').required(),
    overrideParent: Joi.boolean().required()
  }).optional(),
  isInherited: Joi.boolean().optional(),
  sourceNodePath: Joi.string().max(500).optional(),
  accessControl: Joi.object({
    ownerId: Joi.string().required(),
    canEdit: Joi.array().items(Joi.string()).required(),
    canView: Joi.array().items(Joi.string()).required(),
    canMove: Joi.array().items(Joi.string()).required()
  }).optional()
});

export const createConfigSchema = unifiedConfigSchema.fork(
  ['configId', 'creationTime', 'lastUpdated', 'deletedAt', 'deletedBy'],
  (schema) => schema.optional()
);

export const updateConfigSchema = Joi.object({
  appId: Joi.string().min(1).max(100).optional(),
  userId: Joi.string().min(1).max(100).optional(),
  parentId: Joi.string().max(100).allow(null).optional(),
  componentType: Joi.string().min(1).max(100).optional(),
  componentSubType: Joi.string().min(1).max(100).optional(),
  name: Joi.string().min(1).max(200).optional(),
  description: Joi.string().max(1000).allow('').optional(),
  icon: Joi.string().max(200).allow('').optional(),
  config: Joi.any().optional(),
  settings: Joi.array().items(configVersionSchema).optional(),
  activeSetting: Joi.alternatives().try(
    Joi.string().uuid(),
    Joi.string().valid('', 'temp-uuid'),
    Joi.allow(null)
  ).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
  category: Joi.string().max(100).allow('').optional(),
  isShared: Joi.boolean().optional(),
  isDefault: Joi.boolean().optional(),
  isLocked: Joi.boolean().optional(),
  lastUpdatedBy: Joi.string().min(1).max(100).optional(),
  nodeId: Joi.string().max(100).optional(),
  nodePath: Joi.string().max(500).optional(),
  inheritanceStrategy: Joi.string().valid('REPLACE', 'SHALLOW_MERGE', 'DEEP_MERGE').optional()
}).min(1);

export const configurationFilterSchema = Joi.object({
  configIds: Joi.array().items(Joi.string().uuid()).optional(),
  appIds: Joi.array().items(Joi.string()).optional(),
  userIds: Joi.array().items(Joi.string()).optional(),
  parentIds: Joi.array().items(Joi.string()).optional(),
  componentTypes: Joi.array().items(Joi.string()).optional(),
  componentSubTypes: Joi.array().items(Joi.string()).optional(),
  nameContains: Joi.string().max(200).optional(),
  descriptionContains: Joi.string().max(200).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  categories: Joi.array().items(Joi.string().max(100)).optional(),
  isShared: Joi.boolean().optional(),
  isDefault: Joi.boolean().optional(),
  isLocked: Joi.boolean().optional(),
  includeDeleted: Joi.boolean().optional(),
  createdAfter: Joi.date().optional(),
  createdBefore: Joi.date().optional(),
  updatedAfter: Joi.date().optional(),
  updatedBefore: Joi.date().optional(),
  hasVersions: Joi.boolean().optional(),
  activeSettingExists: Joi.boolean().optional(),
  nodeIds: Joi.array().items(Joi.string()).optional()
});

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  sortBy: Joi.string().valid('name', 'creationTime', 'lastUpdated', 'componentType').default('lastUpdated'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const cloneConfigSchema = Joi.object({
  newName: Joi.string().min(1).max(200).required(),
  userId: Joi.string().min(1).max(100).required()
});

export const bulkCreateSchema = Joi.object({
  configs: Joi.array().items(createConfigSchema).min(1).max(50).required()
});

export const bulkUpdateSchema = Joi.object({
  updates: Joi.array().items(
    Joi.object({
      configId: Joi.string().uuid().required(),
      updates: updateConfigSchema
    })
  ).min(1).max(50).required()
});

export const bulkDeleteSchema = Joi.object({
  configIds: Joi.array().items(Joi.string().uuid()).min(1).max(50).required()
});

export const cleanupSchema = Joi.object({
  dryRun: Joi.boolean().default(true)
});

export class ValidationUtils {
  static validateConfig(config: any): { error?: string; value?: UnifiedConfig } {
    const { error, value } = unifiedConfigSchema.validate(config, { abortEarly: false });
    if (error) {
      return { error: error.details.map(d => d.message).join(', ') };
    }
    return { value };
  }

  static validateFilter(filter: any): { error?: string; value?: ConfigurationFilter } {
    const { error, value } = configurationFilterSchema.validate(filter, { allowUnknown: true });
    if (error) {
      return { error: error.details.map(d => d.message).join(', ') };
    }
    return { value };
  }

  static validatePagination(params: any): {
    error?: string;
    value?: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' }
  } {
    const { error, value } = paginationSchema.validate(params);
    if (error) {
      return { error: error.details.map(d => d.message).join(', ') };
    }
    return { value };
  }

  static validateActiveSetting(config: UnifiedConfig): string | null {
    if (!config.activeSetting || config.activeSetting === '' || config.activeSetting === 'temp-uuid') {
      if (config.settings && config.settings.length > 0) {
        return 'activeSetting is required when settings array is not empty';
      }
      return null;
    }

    if (!config.settings || config.settings.length === 0) {
      return 'settings array cannot be empty when activeSetting is specified';
    }

    const activeVersion = config.settings.find(v => v.versionId === config.activeSetting);
    if (!activeVersion) {
      return 'activeSetting must reference a valid version in the settings array';
    }

    return null;
  }

  static validateUniqueVersionNames(settings: any[]): string | null {
    const names = settings.map(v => v.name);
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      return 'Version names must be unique within the settings array';
    }
    return null;
  }

  static validateCompleteConfig(config: UnifiedConfig): string | null {
    const schemaValidation = this.validateConfig(config);
    if (schemaValidation.error) {
      return schemaValidation.error;
    }

    const activeSettingError = this.validateActiveSetting(config);
    if (activeSettingError) {
      return activeSettingError;
    }

    const uniqueNamesError = this.validateUniqueVersionNames(config.settings);
    if (uniqueNamesError) {
      return uniqueNamesError;
    }

    return null;
  }
}
