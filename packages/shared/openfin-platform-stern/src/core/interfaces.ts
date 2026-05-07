/**
 * Core interfaces for dependency injection.
 * Allows the library to work with any implementation of these services.
 */

export interface ILogger {
  info(message: string, data?: any, context?: string): void;
  warn(message: string, data?: any, context?: string): void;
  error(message: string, error?: any, context?: string): void;
  debug(message: string, data?: any, context?: string): void;
}

export interface IConfigService {
  loadDockConfig(userId: string): Promise<any>;
  saveDockConfig(userId: string, config: any): Promise<void>;
  loadAppConfig(appId: string): Promise<any>;
  saveAppConfig(appId: string, config: any): Promise<void>;
}

export interface ViewInstance {
  id: string;
  type: string;
  title?: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface CreateViewOptions {
  type: string;
  basePath?: string;
  title?: string;
  config?: any;
}

export interface IViewManager {
  initialize(): Promise<void>;
  createView(options: CreateViewOptions): Promise<{ view: any; instance: ViewInstance }>;
  getViewInstances(): Promise<ViewInstance[]>;
  getViewInstance(viewId: string): Promise<ViewInstance | null>;
  deleteViewInstance(viewId: string): Promise<void>;
}

export interface OpenFinPlatformOptions {
  logger?: ILogger;
  configService?: IConfigService;
  viewManager?: IViewManager;
  theme?: {
    default?: 'light' | 'dark';
    palettes?: {
      light?: Record<string, string>;
      dark?: Record<string, string>;
    };
  };
  icon?: string;
  title?: string;
  disableAnalytics?: boolean;
}

export class ConsoleLogger implements ILogger {
  info(message: string, data?: any, context?: string): void {
    const prefix = context ? `[${context}]` : '';
    console.log(`${prefix} ${message}`, data || '');
  }
  warn(message: string, data?: any, context?: string): void {
    const prefix = context ? `[${context}]` : '';
    console.warn(`${prefix} ${message}`, data || '');
  }
  error(message: string, error?: any, context?: string): void {
    const prefix = context ? `[${context}]` : '';
    console.error(`${prefix} ${message}`, error || '');
  }
  debug(message: string, data?: any, context?: string): void {
    const prefix = context ? `[${context}]` : '';
    console.debug(`${prefix} ${message}`, data || '');
  }
}
