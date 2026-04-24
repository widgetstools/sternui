import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService.js';
import logger from '../utils/logger.js';

/** REST routes for the `roles` table. Mounted at /api/v1/roles. */
export function createRoleRoutes(authService: AuthService): Router {
  const router = Router();

  const asyncHandler =
    (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { includeDeleted } = req.query;
      const rows = await authService.listRoles(includeDeleted === 'true');
      res.json(rows);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Creating role', { roleId: req.body.roleId });
      const row = await authService.createRole(req.body);
      res.status(201).json(row);
    }),
  );

  router.get(
    '/:roleId',
    asyncHandler(async (req: Request, res: Response) => {
      const row = await authService.getRole(req.params.roleId);
      if (!row) return res.status(404).json({ error: 'Role not found' });
      return res.json(row);
    }),
  );

  router.put(
    '/:roleId',
    asyncHandler(async (req: Request, res: Response) => {
      const { roleId } = req.params;
      const existing = await authService.getRole(roleId);
      if (!existing) {
        const row = await authService.createRole({ ...req.body, roleId });
        return res.status(201).json(row);
      }
      const row = await authService.updateRole(roleId, req.body);
      return res.json(row);
    }),
  );

  router.patch(
    '/:roleId',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const row = await authService.updateRole(req.params.roleId, req.body);
        return res.json(row);
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          return res.status(404).json({ error: 'Role not found' });
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:roleId',
    asyncHandler(async (req: Request, res: Response) => {
      const ok = await authService.deleteRole(req.params.roleId);
      if (!ok) return res.status(404).json({ error: 'Role not found' });
      return res.json({ success: true });
    }),
  );

  return router;
}
