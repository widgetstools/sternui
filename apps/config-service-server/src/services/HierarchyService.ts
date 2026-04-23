import { v4 as uuidv4 } from 'uuid';
import { IHierarchyStorage } from '../storage/IHierarchyStorage.js';
import type { HierarchyNode, HierarchyNodeType } from '@marketsui/shared-types';
import logger from '../utils/logger.js';

/**
 * Service for managing the organizational hierarchy tree.
 * Supports CRUD operations, ancestor/descendant queries, and tree bootstrap.
 */
export class HierarchyService {
  constructor(private storage: IHierarchyStorage) {}

  async initialize(): Promise<void> {
    await this.storage.connect();
    logger.info('HierarchyService initialized');
  }

  async shutdown(): Promise<void> {
    await this.storage.disconnect();
    logger.info('HierarchyService shut down');
  }

  async createNode(data: {
    nodeName: string;
    nodeType: HierarchyNodeType;
    parentId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<HierarchyNode> {
    let parentPath = '';
    let level = 0;

    if (data.parentId) {
      const parent = await this.storage.findById(data.parentId);
      if (!parent) {
        throw new Error(`Parent node ${data.parentId} not found`);
      }
      parentPath = parent.path;
      level = parent.level + 1;
    }

    const path = parentPath ? `${parentPath}/${data.nodeName}` : `/${data.nodeName}`;

    // Check for duplicate path
    const existing = await this.storage.findByPath(path);
    if (existing) {
      throw new Error(`Node already exists at path: ${path}`);
    }

    const node: HierarchyNode = {
      id: uuidv4(),
      nodeName: data.nodeName,
      nodeType: data.nodeType,
      parentId: data.parentId || null,
      path,
      level,
      metadata: data.metadata
    };

    try {
      const result = await this.storage.create(node);
      logger.info('Hierarchy node created', { id: result.id, path: result.path, type: result.nodeType });
      return result;
    } catch (error) {
      logger.error('Failed to create hierarchy node', { data, error });
      throw error;
    }
  }

  async getNode(id: string): Promise<HierarchyNode | null> {
    return this.storage.findById(id);
  }

  async getNodeByPath(path: string): Promise<HierarchyNode | null> {
    return this.storage.findByPath(path);
  }

  async getAncestors(nodeId: string): Promise<HierarchyNode[]> {
    return this.storage.getAncestors(nodeId);
  }

  async getChildren(nodeId: string): Promise<HierarchyNode[]> {
    return this.storage.findChildren(nodeId);
  }

  async getDescendants(nodeId: string): Promise<HierarchyNode[]> {
    return this.storage.getDescendants(nodeId);
  }

  async getTree(): Promise<HierarchyNode[]> {
    return this.storage.getTree();
  }

  async updateNode(id: string, updates: Partial<HierarchyNode>): Promise<HierarchyNode> {
    try {
      const result = await this.storage.update(id, updates);
      logger.info('Hierarchy node updated', { id, path: result.path });
      return result;
    } catch (error) {
      logger.error('Failed to update hierarchy node', { id, error });
      throw error;
    }
  }

  async moveNode(nodeId: string, newParentId: string): Promise<HierarchyNode> {
    const node = await this.storage.findById(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const newParent = await this.storage.findById(newParentId);
    if (!newParent) {
      throw new Error(`New parent node ${newParentId} not found`);
    }

    // Prevent moving a node under itself
    const descendants = await this.storage.getDescendants(nodeId);
    if (descendants.some(d => d.id === newParentId)) {
      throw new Error('Cannot move a node under its own descendant');
    }

    const oldPath = node.path;
    const newPath = `${newParent.path}/${node.nodeName}`;
    const newLevel = newParent.level + 1;

    // Update this node
    const updated = await this.storage.update(nodeId, {
      parentId: newParentId,
      path: newPath,
      level: newLevel
    });

    // Update all descendant paths
    for (const descendant of descendants) {
      const updatedDescPath = descendant.path.replace(oldPath, newPath);
      const levelDiff = newLevel - node.level;
      await this.storage.update(descendant.id, {
        path: updatedDescPath,
        level: descendant.level + levelDiff
      });
    }

    logger.info('Hierarchy node moved', { nodeId, from: oldPath, to: newPath });
    return updated;
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    try {
      const result = await this.storage.delete(nodeId);
      if (result) {
        logger.info('Hierarchy node deleted', { nodeId });
      }
      return result;
    } catch (error) {
      logger.error('Failed to delete hierarchy node', { nodeId, error });
      throw error;
    }
  }

  /**
   * Bootstrap creates a default APP root node for the given application.
   */
  async bootstrap(appId: string): Promise<HierarchyNode> {
    const existingRoot = await this.storage.findByPath(`/${appId}`);
    if (existingRoot) {
      logger.info('Bootstrap skipped — root node already exists', { appId, path: existingRoot.path });
      return existingRoot;
    }

    const rootNode = await this.createNode({
      nodeName: appId,
      nodeType: 'APP',
      parentId: null,
      metadata: { bootstrapped: true, bootstrapTime: new Date().toISOString() }
    });

    logger.info('Hierarchy bootstrapped', { appId, rootId: rootNode.id });
    return rootNode;
  }
}
