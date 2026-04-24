import { Router, Request, Response, NextFunction } from 'express';
import { ConfigurationService } from '../services/ConfigurationService.js';
import type { ConfigurationFilter } from '@marketsui/shared-types';
import logger from '../utils/logger.js';

/**
 * Express router for configuration management. Hierarchy-aware routes
 * (`/resolved`, `/:id/fork`, `/:id/promote`, `/by-parent/:parentId`) were
 * removed along with the hierarchy feature — this service serves the
 * flat, unified schema only.
 */
export function createConfigurationRoutes(configService: ConfigurationService): Router {
  const router = Router();

  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  // =========================================================================
  // Basic CRUD
  // =========================================================================

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Creating new configuration', {
        componentType: req.body.componentType,
        userId: req.body.userId,
      });
      const result = await configService.createConfiguration(req.body);
      res.status(201).json(result);
    }),
  );

  router.get(
    '/lookup',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId, componentType, componentSubType } = req.query;
      // Support both legacy "name" and the unified "displayText" param.
      const displayText = (req.query.displayText ?? req.query.name) as string | undefined;
      if (!userId || !componentType || !displayText) {
        return res.status(400).json({
          error: 'Missing required query parameters: userId, componentType, displayText (or name)',
        });
      }
      const result = await configService.findConfigurationByCompositeKey(
        userId as string,
        componentType as string,
        displayText,
        componentSubType as string | undefined,
      );
      if (!result) return res.status(404).json({ error: 'Configuration not found' });
      return res.json(result);
    }),
  );

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  router.post(
    '/bulk',
    asyncHandler(async (req: Request, res: Response) => {
      const { configs } = req.body;
      logger.info('Bulk creating configurations', { count: configs?.length || 0 });
      const result = await configService.bulkCreateConfigurations(configs);
      return res.status(201).json(result);
    }),
  );

  router.put(
    '/bulk',
    asyncHandler(async (req: Request, res: Response) => {
      const { updates } = req.body;
      logger.info('Bulk updating configurations', { count: updates?.length || 0 });
      const result = await configService.bulkUpdateConfigurations(updates);
      return res.json(result);
    }),
  );

  router.delete(
    '/bulk',
    asyncHandler(async (req: Request, res: Response) => {
      const { configIds } = req.body;
      logger.info('Bulk deleting configurations', { count: configIds?.length || 0 });
      const result = await configService.bulkDeleteConfigurations(configIds);
      return res.json({ results: result });
    }),
  );

  // =========================================================================
  // Single resource CRUD (parameterized)
  // =========================================================================

  router.get(
    '/:configId',
    asyncHandler(async (req: Request, res: Response) => {
      const { configId } = req.params;
      const result = await configService.findConfigurationById(configId);
      if (!result) return res.status(404).json({ error: 'Configuration not found' });
      return res.json(result);
    }),
  );

  router.put(
    '/:configId',
    asyncHandler(async (req: Request, res: Response) => {
      const { configId } = req.params;
      try {
        const result = await configService.updateConfiguration(configId, req.body);
        return res.json(result);
      } catch (error: any) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: 'Configuration not found' });
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:configId',
    asyncHandler(async (req: Request, res: Response) => {
      const { configId } = req.params;
      const result = await configService.deleteConfiguration(configId);
      if (!result) return res.status(404).json({ error: 'Configuration not found' });
      return res.json({ success: true });
    }),
  );

  router.post(
    '/:configId/clone',
    asyncHandler(async (req: Request, res: Response) => {
      const { configId } = req.params;
      const { newName, userId } = req.body;
      try {
        const result = await configService.cloneConfiguration(configId, newName, userId);
        return res.status(201).json(result);
      } catch (error: any) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: 'Configuration not found' });
        }
        throw error;
      }
    }),
  );

  // =========================================================================
  // Query Operations
  // =========================================================================

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { page, limit, sortBy, sortOrder, ...queryParams } = req.query;

      const filterParams: any = { ...queryParams };

      if (queryParams.componentType) {
        filterParams.componentTypes = [queryParams.componentType as string];
        delete filterParams.componentType;
      }
      if (queryParams.componentSubType) {
        filterParams.componentSubTypes = [queryParams.componentSubType as string];
        delete filterParams.componentSubType;
      }
      if (queryParams.userId) {
        filterParams.userIds = [queryParams.userId as string];
        delete filterParams.userId;
      }
      if (queryParams.appId) {
        filterParams.appIds = [queryParams.appId as string];
        delete filterParams.appId;
      }

      if (page || limit) {
        const result = await configService.queryConfigurationsWithPagination(
          filterParams,
          page ? parseInt(page as string) : 1,
          limit ? parseInt(limit as string) : 10,
          sortBy as string,
          sortOrder as 'asc' | 'desc',
        );
        return res.json(result);
      }
      const result = await configService.queryConfigurations(filterParams);
      return res.json(result);
    }),
  );

  // =========================================================================
  // Specialized Query Routes
  // =========================================================================

  router.get(
    '/by-app/:appId',
    asyncHandler(async (req: Request, res: Response) => {
      const { appId } = req.params;
      const { includeDeleted } = req.query;
      const result = await configService.findByAppId(appId, includeDeleted === 'true');
      res.json(result);
    }),
  );

  router.get(
    '/by-user/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId } = req.params;
      const { includeDeleted, componentType, componentSubType } = req.query;

      if (componentType || componentSubType) {
        const criteria: ConfigurationFilter = {
          userIds: [userId],
          includeDeleted: includeDeleted === 'true',
        };
        if (componentType) criteria.componentTypes = [componentType as string];
        if (componentSubType) criteria.componentSubTypes = [componentSubType as string];
        const result = await configService.queryConfigurations(criteria);
        res.json(result);
      } else {
        const result = await configService.findByUserId(userId, includeDeleted === 'true');
        res.json(result);
      }
    }),
  );

  router.get(
    '/by-component/:componentType',
    asyncHandler(async (req: Request, res: Response) => {
      const { componentType } = req.params;
      const { componentSubType, includeDeleted } = req.query;
      const result = await configService.findByComponentType(
        componentType,
        componentSubType as string,
        includeDeleted === 'true',
      );
      res.json(result);
    }),
  );

  // =========================================================================
  // System Operations
  // =========================================================================

  router.get(
    '/system/health',
    asyncHandler(async (_req: Request, res: Response) => {
      const result = await configService.getHealthStatus();
      const statusCode = result.isHealthy ? 200 : 503;
      res.status(statusCode).json(result);
    }),
  );

  router.post(
    '/system/cleanup',
    asyncHandler(async (req: Request, res: Response) => {
      const { dryRun } = req.body;
      const result = await configService.cleanupDeletedConfigurations(dryRun);
      res.json(result);
    }),
  );

  // Test helper — only in test environment
  if (process.env.NODE_ENV === 'test') {
    router.delete(
      '/test/clear',
      asyncHandler(async (_req: Request, res: Response) => {
        const storage = (configService as any).storage;
        if (storage && typeof storage.db?.exec === 'function') {
          storage.db.exec('DELETE FROM configurations');
          return res.json({ success: true, message: 'Database cleared' });
        }
        return res.json({ success: false, message: 'Cannot clear database' });
      }),
    );
  }

  return router;
}
