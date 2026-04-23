import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { ConfigurationService } from './services/ConfigurationService.js';
import { HierarchyService } from './services/HierarchyService.js';
import { ResolutionService } from './services/ResolutionService.js';
import { createConfigurationRoutes } from './routes/configurations.js';
import { createHierarchyRoutes } from './routes/hierarchy.js';
import { StorageFactory } from './storage/StorageFactory.js';
import { SqliteHierarchyStorage } from './storage/SqliteHierarchyStorage.js';
import logger from './utils/logger.js';

export async function createApp(): Promise<express.Application> {
  const app = express();

  // CORS
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: '*',
    exposedHeaders: '*',
    credentials: false,
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }));

  // Security
  const isDevelopment = process.env.NODE_ENV !== 'production';

  app.use(helmet({
    contentSecurityPolicy: isDevelopment ? false : {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
  }));

  // Rate limiting (production only)
  if (!isDevelopment) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    app.use('/api/', limiter);
  }

  // Body parsing & compression
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(compression());

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`
      });
    });
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'stern-configuration-service',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Initialize services
  let configService: ConfigurationService;
  let hierarchyService: HierarchyService;
  let resolutionService: ResolutionService;

  try {
    StorageFactory.validateEnvironment();

    // Config service
    configService = new ConfigurationService();
    await configService.initialize();

    // Hierarchy service
    const hierarchyStorage = new SqliteHierarchyStorage();
    await hierarchyStorage.connect();
    hierarchyService = new HierarchyService(hierarchyStorage);

    // Resolution service (bridges config + hierarchy)
    const configStorage = StorageFactory.createStorage();
    await configStorage.connect();
    resolutionService = new ResolutionService(configStorage, hierarchyService);

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    throw error;
  }

  // API routes
  app.use('/api/v1/configurations', createConfigurationRoutes(configService, resolutionService));
  app.use('/api/v1/hierarchy', createHierarchyRoutes(hierarchyService));

  // 404
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler
  app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method
    });

    res.status(error.status || 500).json({
      error: 'Internal Server Error',
      message: isDevelopment ? error.message : 'Something went wrong',
      ...(isDevelopment && { stack: error.stack }),
      timestamp: new Date().toISOString()
    });
  });

  // Graceful shutdown
  const shutdownHandler = async () => {
    logger.info('Received shutdown signal, starting graceful shutdown...');
    try {
      await configService.shutdown();
      logger.info('Services shut down successfully');
    } catch (error) {
      logger.error('Error during service shutdown', { error });
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  return app;
}

export default createApp;
