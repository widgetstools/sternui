import { Router, Request, Response, NextFunction } from 'express';
import { HierarchyService } from '../services/HierarchyService.js';
import logger from '../utils/logger.js';

/**
 * Express router for hierarchy management API endpoints.
 */
export function createHierarchyRoutes(hierarchyService: HierarchyService): Router {
  const router = Router();

  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  /**
   * GET /api/v1/hierarchy/tree
   * Get the full hierarchy tree.
   */
  router.get('/tree',
    asyncHandler(async (_req: Request, res: Response) => {
      const tree = await hierarchyService.getTree();
      res.json(tree);
    })
  );

  /**
   * GET /api/v1/hierarchy/nodes/:id
   * Get a single hierarchy node by ID.
   */
  router.get('/nodes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const node = await hierarchyService.getNode(id);
      if (!node) {
        return res.status(404).json({ error: 'Hierarchy node not found' });
      }
      return res.json(node);
    })
  );

  /**
   * GET /api/v1/hierarchy/nodes/path/*
   * Get a hierarchy node by its path (e.g., /stern/APAC/HongKong).
   */
  router.get('/nodes/path/*',
    asyncHandler(async (req: Request, res: Response) => {
      const nodePath = '/' + req.params[0];
      const node = await hierarchyService.getNodeByPath(nodePath);
      if (!node) {
        return res.status(404).json({ error: `Hierarchy node not found at path: ${nodePath}` });
      }
      return res.json(node);
    })
  );

  /**
   * GET /api/v1/hierarchy/nodes/:id/ancestors
   * Get all ancestors of a node (from parent to root).
   */
  router.get('/nodes/:id/ancestors',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const ancestors = await hierarchyService.getAncestors(id);
      res.json(ancestors);
    })
  );

  /**
   * GET /api/v1/hierarchy/nodes/:id/children
   * Get direct children of a node.
   */
  router.get('/nodes/:id/children',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const children = await hierarchyService.getChildren(id);
      res.json(children);
    })
  );

  /**
   * GET /api/v1/hierarchy/nodes/:id/descendants
   * Get all descendants of a node.
   */
  router.get('/nodes/:id/descendants',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const descendants = await hierarchyService.getDescendants(id);
      res.json(descendants);
    })
  );

  /**
   * POST /api/v1/hierarchy/nodes
   * Create a new hierarchy node.
   */
  router.post('/nodes',
    asyncHandler(async (req: Request, res: Response) => {
      const { nodeName, nodeType, parentId, metadata } = req.body;

      if (!nodeName || !nodeType) {
        return res.status(400).json({ error: 'Missing required fields: nodeName, nodeType' });
      }

      try {
        const node = await hierarchyService.createNode({
          nodeName, nodeType, parentId: parentId || null, metadata
        });
        return res.status(201).json(node);
      } catch (error: any) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('already exists')) {
          return res.status(409).json({ error: error.message });
        }
        throw error;
      }
    })
  );

  /**
   * PUT /api/v1/hierarchy/nodes/:id
   * Update a hierarchy node.
   */
  router.put('/nodes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      try {
        const node = await hierarchyService.updateNode(id, req.body);
        return res.json(node);
      } catch (error: any) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: error.message });
        }
        throw error;
      }
    })
  );

  /**
   * PUT /api/v1/hierarchy/nodes/:id/move
   * Move a hierarchy node to a new parent.
   */
  router.put('/nodes/:id/move',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { newParentId } = req.body;

      if (!newParentId) {
        return res.status(400).json({ error: 'Missing required field: newParentId' });
      }

      try {
        const node = await hierarchyService.moveNode(id, newParentId);
        return res.json(node);
      } catch (error: any) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('Cannot move')) {
          return res.status(400).json({ error: error.message });
        }
        throw error;
      }
    })
  );

  /**
   * DELETE /api/v1/hierarchy/nodes/:id
   * Delete a hierarchy node (must have no children).
   */
  router.delete('/nodes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      try {
        await hierarchyService.deleteNode(id);
        return res.json({ success: true });
      } catch (error: any) {
        if (error.message.includes('Cannot delete')) {
          return res.status(400).json({ error: error.message });
        }
        throw error;
      }
    })
  );

  /**
   * POST /api/v1/hierarchy/bootstrap
   * Create a default APP root node for the given application.
   */
  router.post('/bootstrap',
    asyncHandler(async (req: Request, res: Response) => {
      const { appId } = req.body;
      if (!appId) {
        return res.status(400).json({ error: 'Missing required field: appId' });
      }

      const rootNode = await hierarchyService.bootstrap(appId);
      return res.status(201).json(rootNode);
    })
  );

  return router;
}
