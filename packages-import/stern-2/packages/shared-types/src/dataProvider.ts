// DataProvider configuration types for Stern Trading Platform
// These configs are stored as UnifiedConfig with componentType='datasource'

/**
 * Provider type enumeration
 */
export const PROVIDER_TYPES = {
  STOMP: 'stomp',
  REST: 'rest',
  WEBSOCKET: 'websocket',
  SOCKETIO: 'socketio',
  MOCK: 'mock',
  APPDATA: 'appdata'
} as const;

export type ProviderType = typeof PROVIDER_TYPES[keyof typeof PROVIDER_TYPES];

/**
 * Provider type to ComponentSubType mapping
 */
export const PROVIDER_TYPE_TO_COMPONENT_SUBTYPE: Record<ProviderType, string> = {
  [PROVIDER_TYPES.STOMP]: 'stomp',
  [PROVIDER_TYPES.REST]: 'rest',
  [PROVIDER_TYPES.WEBSOCKET]: 'websocket',
  [PROVIDER_TYPES.SOCKETIO]: 'socketio',
  [PROVIDER_TYPES.MOCK]: 'mock',
  [PROVIDER_TYPES.APPDATA]: 'appdata'
};

/**
 * ComponentSubType to Provider type mapping
 */
export const COMPONENT_SUBTYPE_TO_PROVIDER_TYPE: Record<string, ProviderType> = {
  'stomp': PROVIDER_TYPES.STOMP,
  'rest': PROVIDER_TYPES.REST,
  'websocket': PROVIDER_TYPES.WEBSOCKET,
  'socketio': PROVIDER_TYPES.SOCKETIO,
  'mock': PROVIDER_TYPES.MOCK,
  'appdata': PROVIDER_TYPES.APPDATA,
  // Capitalized (backward compatibility)
  'Stomp': PROVIDER_TYPES.STOMP,
  'Rest': PROVIDER_TYPES.REST,
  'WebSocket': PROVIDER_TYPES.WEBSOCKET,
  'SocketIO': PROVIDER_TYPES.SOCKETIO,
  'Mock': PROVIDER_TYPES.MOCK,
  'AppData': PROVIDER_TYPES.APPDATA
};

/**
 * Connection state enumeration
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
} as const;

export type ConnectionState = typeof CONNECTION_STATES[keyof typeof CONNECTION_STATES];

/**
 * Field information from schema inference
 */
export interface FieldInfo {
  path: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  nullable: boolean;
  sample?: any;
  children?: Record<string, FieldInfo>;
}

/**
 * Column definition for AG-Grid
 */
export interface ColumnDefinition {
  field: string;
  headerName: string;
  cellDataType?: 'text' | 'number' | 'boolean' | 'date' | 'dateString' | 'object';
  width?: number;
  filter?: string | boolean;
  sortable?: boolean;
  resizable?: boolean;
  hide?: boolean;
  type?: string;
  valueFormatter?: string;
  cellRenderer?: string;
}

/**
 * STOMP Provider Configuration
 */
export interface StompProviderConfig {
  providerType: 'stomp';
  websocketUrl: string;
  listenerTopic: string;
  requestMessage?: string;
  requestBody?: string;
  snapshotEndToken?: string;
  keyColumn?: string;
  snapshotTimeoutMs?: number;
  manualTopics?: boolean;
  dataType?: 'positions' | 'trades' | 'orders' | 'custom';
  messageRate?: number;
  batchSize?: number;
  autoStart?: boolean;
  heartbeat?: {
    outgoing?: number;
    incoming?: number;
  };
  inferredFields?: FieldInfo[];
  columnDefinitions?: ColumnDefinition[];
}

/**
 * REST Provider Configuration
 */
export interface RestProviderConfig {
  providerType: 'rest';
  baseUrl: string;
  endpoint: string;
  method: 'GET' | 'POST';
  queryParams?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
  pollInterval?: number;
  paginationMode?: 'offset' | 'cursor' | 'page';
  pageSize?: number;
  auth?: {
    type: 'bearer' | 'apikey' | 'basic';
    credentials: string;
    headerName?: string;
  };
  timeout?: number;
}

/**
 * WebSocket Provider Configuration
 */
export interface WebSocketProviderConfig {
  providerType: 'websocket';
  url: string;
  protocol?: string;
  messageFormat: 'json' | 'binary' | 'text';
  heartbeatInterval?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

/**
 * Socket.IO Provider Configuration
 */
export interface SocketIOProviderConfig {
  providerType: 'socketio';
  url: string;
  namespace?: string;
  events: {
    snapshot: string;
    update: string;
    delete?: string;
  };
  rooms?: string[];
  auth?: any;
  reconnection?: boolean;
  reconnectionDelay?: number;
}

/**
 * Mock Provider Configuration
 */
export interface MockProviderConfig {
  providerType: 'mock';
  dataType: 'positions' | 'trades' | 'orders' | 'custom';
  updateInterval?: number;
  rowCount?: number;
  enableUpdates?: boolean;
  customData?: any[];
}

/**
 * AppData Variable
 */
export interface AppDataVariable {
  key: string;
  value: string | number | boolean | object;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  sensitive?: boolean;
}

/**
 * AppData Provider Configuration
 */
export interface AppDataProviderConfig {
  providerType: 'appdata';
  variables: Record<string, AppDataVariable>;
}

/**
 * Union type for all provider configurations
 */
export type ProviderConfig =
  | StompProviderConfig
  | RestProviderConfig
  | WebSocketProviderConfig
  | SocketIOProviderConfig
  | MockProviderConfig
  | AppDataProviderConfig;

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  hasSnapshot: boolean;
  hasRealtime: boolean;
  hasPagination: boolean;
  hasFiltering: boolean;
  hasSorting: boolean;
  hasSearch: boolean;
  maxRowsPerRequest?: number;
}

/**
 * Provider statistics for monitoring
 */
export interface ProviderStatistics {
  snapshotRowsReceived: number;
  updateRowsReceived: number;
  bytesReceived: number;
  snapshotBytesReceived: number;
  updateBytesReceived: number;
  connectionCount: number;
  disconnectionCount: number;
  isConnected: boolean;
  mode: 'idle' | 'snapshot' | 'realtime';
  lastMessageTime: number | null;
  connectionDuration?: number;
  errorCount?: number;
}

/**
 * Template variables for STOMP topic resolution
 */
export interface TemplateVariables {
  clientId: string;
  userId?: string;
  timestamp?: number;
  [key: string]: string | number | undefined;
}

/**
 * DataProvider configuration wrapper
 */
export interface DataProviderConfig {
  providerId?: string;
  name: string;
  description?: string;
  providerType: ProviderType;
  config: ProviderConfig;
  tags?: string[];
  isDefault?: boolean;
  userId: string;
}

/**
 * Validation result for provider configurations
 */
export interface ProviderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Provider connection test result
 */
export interface ProviderTestResult {
  success: boolean;
  connectionState: ConnectionState;
  responseTime?: number;
  error?: string;
  metadata?: {
    serverVersion?: string;
    capabilities?: ProviderCapabilities;
    sampleData?: any[];
  };
}

/**
 * Default provider configurations for quick setup
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<ProviderType, Partial<ProviderConfig>> = {
  stomp: {
    providerType: 'stomp',
    listenerTopic: '',
    websocketUrl: '',
    snapshotEndToken: 'Success',
    requestBody: 'START',
    snapshotTimeoutMs: 60000,
    manualTopics: false,
    dataType: 'positions',
    messageRate: 1000,
    autoStart: false,
    heartbeat: {
      outgoing: 4000,
      incoming: 4000
    },
    inferredFields: [],
    columnDefinitions: []
  },
  rest: {
    providerType: 'rest',
    baseUrl: '',
    endpoint: '',
    method: 'GET',
    pollInterval: 5000,
    pageSize: 100,
    timeout: 30000
  },
  websocket: {
    providerType: 'websocket',
    url: '',
    messageFormat: 'json',
    heartbeatInterval: 30000,
    reconnectAttempts: 5,
    reconnectDelay: 5000
  },
  socketio: {
    providerType: 'socketio',
    url: '',
    namespace: '/',
    reconnection: true,
    reconnectionDelay: 5000
  },
  mock: {
    providerType: 'mock',
    dataType: 'positions',
    updateInterval: 2000,
    rowCount: 20,
    enableUpdates: true
  },
  appdata: {
    providerType: 'appdata',
    variables: {}
  }
};

/**
 * Helper function to get default config for a provider type
 */
export function getDefaultProviderConfig(type: ProviderType): Partial<ProviderConfig> {
  return { ...DEFAULT_PROVIDER_CONFIGS[type] };
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: ProviderConfig): ProviderValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.providerType) {
    errors.push('Provider type is required');
  }

  switch (config.providerType) {
    case 'stomp': {
      const stompConfig = config as StompProviderConfig;
      if (stompConfig.websocketUrl && !stompConfig.websocketUrl.startsWith('ws://') && !stompConfig.websocketUrl.startsWith('wss://')) {
        warnings.push('WebSocket URL should typically start with ws:// or wss://');
      }
      if (stompConfig.snapshotTimeoutMs && stompConfig.snapshotTimeoutMs < 1000) {
        warnings.push('Snapshot timeout is very low (< 1 second)');
      }
      break;
    }
    case 'rest': {
      const restConfig = config as RestProviderConfig;
      if (restConfig.baseUrl && !restConfig.baseUrl.startsWith('http://') && !restConfig.baseUrl.startsWith('https://')) {
        warnings.push('Base URL should typically start with http:// or https://');
      }
      if (restConfig.pollInterval && restConfig.pollInterval < 1000) {
        warnings.push('Poll interval is very low (< 1 second), may cause high server load');
      }
      break;
    }
    case 'websocket': {
      const wsConfig = config as WebSocketProviderConfig;
      if (wsConfig.url && !wsConfig.url.startsWith('ws://') && !wsConfig.url.startsWith('wss://')) {
        warnings.push('URL should typically start with ws:// or wss://');
      }
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
