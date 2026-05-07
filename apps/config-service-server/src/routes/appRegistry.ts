import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService.js';
import logger from '../utils/logger.js';

/** REST routes for the `appRegistry` table. Mounted at /api/v1/app-registry. */
export function createAppRegistryRoutes(authService: AuthService): Router {
  const router = Router();

  const asyncHandler =
    (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // List
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { includeDeleted } = req.query;
      const rows = await authService.listApps(includeDeleted === 'true');
      res.json(rows);
    }),
  );

  // Create
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Creating app registry entry', { appId: req.body.appId });
      const row = await authService.createApp(req.body);
      res.status(201).json(row);
    }),
  );

  // Get by id
  router.get(
    '/:appId',
    asyncHandler(async (req: Request, res: Response) => {
      const row = await authService.getApp(req.params.appId);
      if (!row) return res.status(404).json({ error: 'App not found' });
      return res.json(row);
    }),
  );

  // Full upsert (PUT)
  router.put(
    '/:appId',
    asyncHandler(async (req: Request, res: Response) => {
      const { appId } = req.params;
      const existing = await authService.getApp(appId);
      if (!existing) {
        const row = await authService.createApp({ ...req.body, appId });
        return res.status(201).json(row);
      }
      const row = await authService.updateApp(appId, req.body);
      return res.json(row);
    }),
  );

  // Partial update
  router.patch(
    '/:appId',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const row = await authService.updateApp(req.params.appId, req.body);
        return res.json(row);
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          return res.status(404).json({ error: 'App not found' });
        }
        throw error;
      }
    }),
  );

  // Delete
  router.delete(
    '/:appId',
    asyncHandler(async (req: Request, res: Response) => {
      const ok = await authService.deleteApp(req.params.appId);
      if (!ok) return res.status(404).json({ error: 'App not found' });
      return res.json({ success: true });
    }),
  );

  return router;
}
