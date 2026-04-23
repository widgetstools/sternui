import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createApp } from './app.js';
import logger from './utils/logger.js';

// Load environment variables
const envFile = path.join(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
  logger.info('Loaded environment variables from .env file');
} else {
  logger.info('No .env file found, using system environment variables');
}

async function startServer(): Promise<void> {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || 'localhost';

    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${process.env.PORT}. Port must be between 1 and 65535.`);
    }

    // Ensure directories exist
    for (const dir of ['logs', 'data']) {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    logger.info('Starting Stern Configuration Service', {
      environment: process.env.NODE_ENV || 'development',
      port,
      host,
      databaseType: process.env.DATABASE_TYPE || 'auto-detect',
      nodeVersion: process.version,
      platform: process.platform
    });

    const app = await createApp();

    const server = app.listen(port, host, () => {
      logger.info(`Server running at http://${host}:${port}`, { port, host });
      logger.info('Available endpoints:', {
        health: `http://${host}:${port}/health`,
        configurations: `http://${host}:${port}/api/v1/configurations`,
        hierarchy: `http://${host}:${port}/api/v1/hierarchy`
      });
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use.`);
      } else if (error.code === 'EACCES') {
        logger.error(`Permission denied to bind to port ${port}.`);
      } else {
        logger.error('Server error', { error: error.message, code: error.code });
      }
      process.exit(1);
    });

    const gracefulShutdown = () => {
      logger.info('Received shutdown signal, closing server...');
      server.close((error) => {
        if (error) {
          logger.error('Error during server close', { error });
          process.exit(1);
        } else {
          logger.info('Server closed successfully');
          process.exit(0);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after 10 seconds');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

startServer().catch((error) => {
  logger.error('Unhandled error during server startup', { error });
  process.exit(1);
});
