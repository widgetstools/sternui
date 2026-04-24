import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService.js';
import logger from '../utils/logger.js';

/** REST routes for the `userProfile` table. Mounted at /api/v1/user-profiles. */
export function createUserProfileRoutes(authService: AuthService): Router {
  const router = Router();

  const asyncHandler =
    (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // List (optional filter by app)
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { includeDeleted, appId } = req.query;
      const inc = includeDeleted === 'true';
      const rows = appId
        ? await authService.listUsersByApp(String(appId), inc)
        : await authService.listUserProfiles(inc);
      res.json(rows);
    }),
  );

  // Create
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Creating user profile', { userId: req.body.userId });
      const row = await authService.createUserProfile(req.body);
      res.status(201).json(row);
    }),
  );

  // By app (path variant)
  router.get(
    '/by-app/:appId',
    asyncHandler(async (req: Request, res: Response) => {
      const { includeDeleted } = req.query;
      const rows = await authService.listUsersByApp(
        req.params.appId,
        includeDeleted === 'true',
      );
      res.json(rows);
    }),
  );

  // Get by id
  router.get(
    '/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      const row = await authService.getUserProfile(req.params.userId);
      if (!row) return res.status(404).json({ error: 'User profile not found' });
      return res.json(row);
    }),
  );

  // Full upsert (PUT)
  router.put(
    '/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId } = req.params;
      const existing = await authService.getUserProfile(userId);
      if (!existing) {
        const row = await authService.createUserProfile({ ...req.body, userId });
        return res.status(201).json(row);
      }
      const row = await authService.updateUserProfile(userId, req.body);
      return res.json(row);
    }),
  );

  // Partial update
  router.patch(
    '/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const row = await authService.updateUserProfile(req.params.userId, req.body);
        return res.json(row);
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          return res.status(404).json({ error: 'User profile not found' });
        }
        throw error;
      }
    }),
  );

  // Delete
  router.delete(
    '/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      const ok = await authService.deleteUserProfile(req.params.userId);
      if (!ok) return res.status(404).json({ error: 'User profile not found' });
      return res.json({ success: true });
    }),
  );

  return router;
}
