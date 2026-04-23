import type { HierarchyNode } from '@marketsui/shared-types';

/**
 * Storage interface for organizational hierarchy management.
 * Supports tree operations: create, read, update, delete, ancestor/descendant queries.
 */
export interface IHierarchyStorage {
  create(node: HierarchyNode): Promise<HierarchyNode>;
  findById(id: string): Promise<HierarchyNode | null>;
  findByPath(path: string): Promise<HierarchyNode | null>;
  findChildren(parentId: string): Promise<HierarchyNode[]>;
  getAncestors(nodeId: string): Promise<HierarchyNode[]>;
  getDescendants(nodeId: string): Promise<HierarchyNode[]>;
  update(id: string, updates: Partial<HierarchyNode>): Promise<HierarchyNode>;
  delete(id: string): Promise<boolean>;
  getTree(): Promise<HierarchyNode[]>;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
