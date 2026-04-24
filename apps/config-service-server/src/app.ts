import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { ConfigurationService } from './services/ConfigurationService.js';
import { AuthService } from './services/AuthService.js';
import { createConfigurationRoutes } from './routes/configurations.js';
import { createAppRegistryRoutes } from './routes/app-registry.js';
import { createUserProfileRoutes } from './routes/user-profiles.js';
import { createRoleRoutes } from './routes/roles.js';
import { createPermissionRoutes } from './routes/permissions.js';
import { StorageFactory } from './storage/StorageFactory.js';
import { seedAuthIfEmpty } from './seed.js';
import logger from './utils/logger.js';

export async function createApp(): Promise<express.Application> {
  const app = express();

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: '*',
      exposedHeaders: '*',
      credentials: false,
      maxAge: 86400,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    }),
  );

  const isDevelopment = process.env.NODE_ENV !== 'production';

  app.use(
    helmet({
      contentSecurityPolicy: isDevelopment
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
            },
          },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
    }),
  );

  if (!isDevelopment) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60,
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/api/', limiter);
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(compression());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'marketsui-configuration-service',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });
  });

  let configService: ConfigurationService;
  let authService: AuthService;
  try {
    StorageFactory.validateEnvironment();
    configService = new ConfigurationService();
    await configService.initialize();
    logger.info('ConfigurationService initialized successfully');

    authService = new AuthService();
    await authService.initialize();
    logger.info('AuthService initialized successfully');

    const seeded = await seedAuthIfEmpty(authService);
    if (seeded) {
      logger.info('Auth tables seeded from seed-config.json');
    } else {
      logger.info('Auth tables already seeded, skipping seed step');
    }
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    throw error;
  }

  app.use('/api/v1/configurations', createConfigurationRoutes(configService));
  app.use('/api/v1/app-registry', createAppRegistryRoutes(authService));
  app.use('/api/v1/user-profiles', createUserProfileRoutes(authService));
  app.use('/api/v1/roles', createRoleRoutes(authService));
  app.use('/api/v1/permissions', createPermissionRoutes(authService));

  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
    });
  });

  app.use(
    (error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
      });
      res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: isDevelopment ? error.message : 'Something went wrong',
        ...(isDevelopment && { stack: error.stack }),
        timestamp: new Date().toISOString(),
      });
    },
  );

  const shutdownHandler = async () => {
    logger.info('Received shutdown signal, starting graceful shutdown...');
    try {
      await configService.shutdown();
      await authService.shutdown();
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
