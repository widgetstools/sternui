import { IConfigurationStorage } from '../storage/IConfigurationStorage.js';
import { HierarchyService } from './HierarchyService.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  UnifiedConfig,
  ConfigResolutionResult,
  InheritanceStrategy,
  HierarchyNode
} from '@stern/shared-types';
import logger from '../utils/logger.js';

/**
 * Resolves configurations through the organizational hierarchy.
 * Walks up the tree from a user's node, collecting and merging configs
 * according to the inheritance strategy (REPLACE, SHALLOW_MERGE, DEEP_MERGE).
 */
export class ResolutionService {
  constructor(
    private configStorage: IConfigurationStorage,
    private hierarchyService: HierarchyService
  ) {}

  /**
   * Resolve a configuration for a given hierarchy path and component type.
   * Walks up from the user's node to the root, finding the best match.
   */
  async resolveConfig(
    userNodePath: string,
    componentType: string,
    componentSubType?: string
  ): Promise<ConfigResolutionResult | null> {
    // Find the user's node
    const userNode = await this.hierarchyService.getNodeByPath(userNodePath);
    if (!userNode) {
      throw new Error(`Hierarchy node not found at path: ${userNodePath}`);
    }

    // Get ancestors (from immediate parent to root)
    const ancestors = await this.hierarchyService.getAncestors(userNode.id);

    // Build the resolution path: [userNode, parent, grandparent, ..., root]
    const nodePath = [userNode, ...ancestors];
    const nodeIds = nodePath.map(n => n.id);

    // Find configs at each level
    const configs = await this.configStorage.findByMultipleCriteria({
      nodeIds,
      componentTypes: [componentType],
      componentSubTypes: componentSubType ? [componentSubType] : undefined
    });

    if (configs.length === 0) {
      return null;
    }

    // Group configs by nodeId for ordered resolution
    const configsByNode = new Map<string, UnifiedConfig[]>();
    for (const config of configs) {
      if (config.nodeId) {
        const existing = configsByNode.get(config.nodeId) || [];
        existing.push(config);
        configsByNode.set(config.nodeId, existing);
      }
    }

    // Walk from most specific (user) to least specific (root)
    let resolvedConfig: UnifiedConfig | null = null;
    let source: 'own' | 'inherited' = 'own';
    let inheritedFrom: string | undefined;

    for (const node of nodePath) {
      const nodeConfigs = configsByNode.get(node.id);
      if (!nodeConfigs || nodeConfigs.length === 0) continue;

      // Take the first matching config at this level
      const config = nodeConfigs[0];
      const strategy = config.inheritanceStrategy || 'REPLACE';

      if (!resolvedConfig) {
        // First config found — this is the most specific
        resolvedConfig = { ...config };
        source = node.id === userNode.id ? 'own' : 'inherited';
        if (source === 'inherited') {
          inheritedFrom = `${node.nodeType}: ${node.nodeName}`;
        }

        if (strategy === 'REPLACE') {
          break; // No further merging needed
        }
      } else {
        // Merge parent config into resolved config
        resolvedConfig = this.mergeConfigs(resolvedConfig, config, strategy);
        if (!inheritedFrom) {
          inheritedFrom = `${node.nodeType}: ${node.nodeName}`;
        }
      }
    }

    if (!resolvedConfig) {
      return null;
    }

    return {
      config: resolvedConfig,
      source,
      inheritedFrom,
      resolvedPath: nodePath.map(n => n.path)
    };
  }

  /**
   * Fork an inherited config to the user's own node.
   * Creates a copy owned by the user, breaking the inheritance chain.
   */
  async forkConfig(
    configId: string,
    targetNodeId: string,
    userId: string,
    newName?: string
  ): Promise<UnifiedConfig> {
    const sourceConfig = await this.configStorage.findById(configId);
    if (!sourceConfig) {
      throw new Error(`Configuration ${configId} not found`);
    }

    const targetNode = await this.hierarchyService.getNode(targetNodeId);
    if (!targetNode) {
      throw new Error(`Target node ${targetNodeId} not found`);
    }

    const forkedConfig: UnifiedConfig = {
      ...sourceConfig,
      configId: uuidv4(),
      name: newName || `${sourceConfig.name} (forked)`,
      userId,
      nodeId: targetNodeId,
      nodePath: targetNode.path,
      isInherited: false,
      sourceNodePath: undefined,
      inheritanceStrategy: 'REPLACE',
      createdBy: userId,
      lastUpdatedBy: userId,
      creationTime: new Date(),
      lastUpdated: new Date(),
      isDefault: false,
      isLocked: false,
      deletedAt: null,
      deletedBy: null
    };

    const result = await this.configStorage.create(forkedConfig);
    logger.info('Configuration forked', {
      sourceConfigId: configId,
      newConfigId: result.configId,
      targetNodePath: targetNode.path
    });
    return result;
  }

  /**
   * Promote a config to a higher hierarchy level (e.g., from user to desk).
   */
  async promoteConfig(
    configId: string,
    targetNodePath: string,
    userId: string
  ): Promise<UnifiedConfig> {
    const sourceConfig = await this.configStorage.findById(configId);
    if (!sourceConfig) {
      throw new Error(`Configuration ${configId} not found`);
    }

    const targetNode = await this.hierarchyService.getNodeByPath(targetNodePath);
    if (!targetNode) {
      throw new Error(`Target node not found at path: ${targetNodePath}`);
    }

    const promotedConfig: UnifiedConfig = {
      ...sourceConfig,
      configId: uuidv4(),
      nodeId: targetNode.id,
      nodePath: targetNode.path,
      isInherited: false,
      sourceNodePath: undefined,
      lastUpdatedBy: userId,
      lastUpdated: new Date(),
      createdBy: userId,
      creationTime: new Date(),
      isDefault: false,
      isLocked: false,
      deletedAt: null,
      deletedBy: null
    };

    const result = await this.configStorage.create(promotedConfig);
    logger.info('Configuration promoted', {
      sourceConfigId: configId,
      newConfigId: result.configId,
      targetNodePath
    });
    return result;
  }

  private mergeConfigs(
    child: UnifiedConfig,
    parent: UnifiedConfig,
    strategy: InheritanceStrategy
  ): UnifiedConfig {
    switch (strategy) {
      case 'REPLACE':
        return child;

      case 'SHALLOW_MERGE':
        return {
          ...child,
          config: {
            ...parent.config,
            ...child.config
          }
        };

      case 'DEEP_MERGE':
        return {
          ...child,
          config: this.deepMerge(parent.config, child.config)
        };

      default:
        return child;
    }
  }

  private deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };

    for (const key of Object.keys(override)) {
      const baseVal = base[key];
      const overrideVal = override[key];

      if (
        baseVal && overrideVal &&
        typeof baseVal === 'object' && !Array.isArray(baseVal) &&
        typeof overrideVal === 'object' && !Array.isArray(overrideVal)
      ) {
        result[key] = this.deepMerge(
          baseVal as Record<string, unknown>,
          overrideVal as Record<string, unknown>
        );
      } else {
        result[key] = overrideVal;
      }
    }

    return result;
  }
}
