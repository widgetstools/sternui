/**
 * Platform context — singleton holding dependency instances for the library.
 */

import { ILogger, IConfigService, IViewManager, ConsoleLogger, OpenFinPlatformOptions } from './interfaces.js';

class PlatformContext {
  private static instance: PlatformContext;

  private _logger: ILogger = new ConsoleLogger();
  private _configService?: IConfigService;
  private _viewManager?: IViewManager;
  private _options: OpenFinPlatformOptions = {};

  private constructor() {}

  static getInstance(): PlatformContext {
    if (!PlatformContext.instance) {
      PlatformContext.instance = new PlatformContext();
    }
    return PlatformContext.instance;
  }

  initialize(options: OpenFinPlatformOptions): void {
    this._options = options;
    if (options.logger) this._logger = options.logger;
    if (options.configService) this._configService = options.configService;
    if (options.viewManager) this._viewManager = options.viewManager;
  }

  get logger(): ILogger { return this._logger; }
  get configService(): IConfigService | undefined { return this._configService; }
  get viewManager(): IViewManager | undefined { return this._viewManager; }
  get options(): OpenFinPlatformOptions { return this._options; }
}

export const platformContext = PlatformContext.getInstance();
