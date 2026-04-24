import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService.js';
import logger from '../utils/logger.js';

/**
 * REST routes for the `permissions` table plus the two derived queries
 * (permissions-for-user, permission-check). Mounted at /api/v1/permissions.
 */
export function createPermissionRoutes(authService: AuthService): Router {
  const router = Router();

  const asyncHandler =
    (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // ── Derived queries (declared first so they win over /:permissionId) ──

  // Permissions-for-user join
  router.get(
    '/by-user/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      const rows = await authService.getUserPermissions(req.params.userId);
      res.json(rows);
    }),
  );

  // Permission-check
  router.get(
    '/check',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId, permissionId } = req.query;
      if (!userId || !permissionId) {
        return res
          .status(400)
          .json({ error: 'Missing required query parameters: userId, permissionId' });
      }
      const allowed = await authService.userHasPermission(
        String(userId),
        String(permissionId),
      );
      return res.json({ allowed });
    }),
  );

  // By-category
  router.get(
    '/by-category/:category',
    asyncHandler(async (req: Request, res: Response) => {
      const { includeDeleted } = req.query;
      const rows = await authService.listPermissionsByCategory(
        req.params.category,
        includeDeleted === 'true',
      );
      res.json(rows);
    }),
  );

  // ── Collection ──

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { includeDeleted, category } = req.query;
      const inc = includeDeleted === 'true';
      const rows = category
        ? await authService.listPermissionsByCategory(String(category), inc)
        : await authService.listPermissions(inc);
      res.json(rows);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Creating permission', { permissionId: req.body.permissionId });
      const row = await authService.createPermission(req.body);
      res.status(201).json(row);
    }),
  );

  // ── Single resource ──

  router.get(
    '/:permissionId',
    asyncHandler(async (req: Request, res: Response) => {
      const row = await authService.getPermission(req.params.permissionId);
      if (!row) return res.status(404).json({ error: 'Permission not found' });
      return res.json(row);
    }),
  );

  router.put(
    '/:permissionId',
    asyncHandler(async (req: Request, res: Response) => {
      const { permissionId } = req.params;
      const existing = await authService.getPermission(permissionId);
      if (!existing) {
        const row = await authService.createPermission({ ...req.body, permissionId });
        return res.status(201).json(row);
      }
      const row = await authService.updatePermission(permissionId, req.body);
      return res.json(row);
    }),
  );

  router.patch(
    '/:permissionId',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const row = await authService.updatePermission(req.params.permissionId, req.body);
        return res.json(row);
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          return res.status(404).json({ error: 'Permission not found' });
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:permissionId',
    asyncHandler(async (req: Request, res: Response) => {
      const ok = await authService.deletePermission(req.params.permissionId);
      if (!ok) return res.status(404).json({ error: 'Permission not found' });
      return res.json({ success: true });
    }),
  );

  return router;
}
