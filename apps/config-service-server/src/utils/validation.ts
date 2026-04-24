import Joi from 'joi';
import type { UnifiedConfig, ConfigurationFilter } from '@marketsui/shared-types';

export const unifiedConfigSchema = Joi.object({
  configId: Joi.string().min(1).max(200).required(),
  appId: Joi.string().min(1).max(100).required(),
  userId: Joi.string().min(1).max(100).required(),
  componentType: Joi.string().min(1).max(100).required(),
  componentSubType: Joi.string().max(100).allow('').optional(),
  isTemplate: Joi.boolean().required(),
  displayText: Joi.string().min(1).max(200).required(),
  payload: Joi.any().optional(),
  createdBy: Joi.string().min(1).max(100).required(),
  updatedBy: Joi.string().min(1).max(100).required(),
  creationTime: Joi.string().isoDate().required(),
  updatedTime: Joi.string().isoDate().required(),
});

export const createConfigSchema = unifiedConfigSchema.fork(
  ['configId', 'creationTime', 'updatedTime'],
  (schema) => schema.optional(),
);

export const updateConfigSchema = Joi.object({
  appId: Joi.string().min(1).max(100).optional(),
  userId: Joi.string().min(1).max(100).optional(),
  componentType: Joi.string().min(1).max(100).optional(),
  componentSubType: Joi.string().max(100).allow('').optional(),
  isTemplate: Joi.boolean().optional(),
  displayText: Joi.string().min(1).max(200).optional(),
  payload: Joi.any().optional(),
  updatedBy: Joi.string().min(1).max(100).optional(),
}).min(1);

export const configurationFilterSchema = Joi.object({
  configIds: Joi.array().items(Joi.string()).optional(),
  appIds: Joi.array().items(Joi.string()).optional(),
  userIds: Joi.array().items(Joi.string()).optional(),
  componentTypes: Joi.array().items(Joi.string()).optional(),
  componentSubTypes: Joi.array().items(Joi.string()).optional(),
  displayTextContains: Joi.string().max(200).optional(),
  isTemplate: Joi.boolean().optional(),
  includeDeleted: Joi.boolean().optional(),
  createdAfter: Joi.string().isoDate().optional(),
  createdBefore: Joi.string().isoDate().optional(),
  updatedAfter: Joi.string().isoDate().optional(),
  updatedBefore: Joi.string().isoDate().optional(),
});

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  sortBy: Joi.string()
    .valid('displayText', 'creationTime', 'updatedTime', 'componentType')
    .default('updatedTime'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const cloneConfigSchema = Joi.object({
  newName: Joi.string().min(1).max(200).required(),
  userId: Joi.string().min(1).max(100).required(),
});

export const bulkCreateSchema = Joi.object({
  configs: Joi.array().items(createConfigSchema).min(1).max(50).required(),
});

export const bulkUpdateSchema = Joi.object({
  updates: Joi.array()
    .items(
      Joi.object({
        configId: Joi.string().required(),
        updates: updateConfigSchema,
      }),
    )
    .min(1)
    .max(50)
    .required(),
});

export const bulkDeleteSchema = Joi.object({
  configIds: Joi.array().items(Joi.string()).min(1).max(50).required(),
});

export const cleanupSchema = Joi.object({
  dryRun: Joi.boolean().default(true),
});

export class ValidationUtils {
  static validateConfig(config: any): { error?: string; value?: UnifiedConfig } {
    const { error, value } = unifiedConfigSchema.validate(config, { abortEarly: false });
    if (error) return { error: error.details.map((d) => d.message).join(', ') };
    return { value };
  }

  static validateFilter(filter: any): { error?: string; value?: ConfigurationFilter } {
    const { error, value } = configurationFilterSchema.validate(filter, { allowUnknown: true });
    if (error) return { error: error.details.map((d) => d.message).join(', ') };
    return { value };
  }

  static validatePagination(params: any): {
    error?: string;
    value?: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' };
  } {
    const { error, value } = paginationSchema.validate(params);
    if (error) return { error: error.details.map((d) => d.message).join(', ') };
    return { value };
  }
}
