import { IConfigurationStorage } from './IConfigurationStorage.js';
import { SqliteStorage } from './SqliteStorage.js';
import { IHierarchyStorage } from './IHierarchyStorage.js';
import { SqliteHierarchyStorage } from './SqliteHierarchyStorage.js';

/**
 * Factory class for creating storage implementations based on environment.
 * Development/Test -> SQLite, Production -> MongoDB.
 */
export class StorageFactory {
  static createStorage(): IConfigurationStorage {
    const env = process.env.NODE_ENV || 'development';
    const override = process.env.DATABASE_TYPE;

    console.log(`Environment: ${env}`);

    if (override === 'mongodb') {
      console.log('Storage: MongoDB (explicit override)');
      // TODO: return new MongoDbStorage() when implemented
      throw new Error('MongoDB storage not yet implemented in stern-2. Use DATABASE_TYPE=sqlite.');
    }

    if (override === 'sqlite') {
      console.log('Storage: SQLite (explicit override)');
      return new SqliteStorage();
    }

    switch (env) {
      case 'development':
      case 'test':
        console.log('Storage: SQLite (development)');
        return new SqliteStorage();

      case 'production':
        console.log('Storage: MongoDB (production)');
        // TODO: return new MongoDbStorage() when implemented
        throw new Error('MongoDB storage not yet implemented in stern-2.');

      default:
        console.log('Storage: SQLite (default)');
        return new SqliteStorage();
    }
  }

  static createHierarchyStorage(): IHierarchyStorage {
    const env = process.env.NODE_ENV || 'development';
    const override = process.env.DATABASE_TYPE;

    if (override === 'mongodb' || env === 'production') {
      // TODO: return new MongoDbHierarchyStorage() when implemented
      throw new Error('MongoDB hierarchy storage not yet implemented in stern-2.');
    }

    return new SqliteHierarchyStorage();
  }

  static validateEnvironment(): void {
    const env = process.env.NODE_ENV;
    const override = process.env.DATABASE_TYPE;

    if ((env === 'production' || override === 'mongodb') && !process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required for production environment or when DATABASE_TYPE=mongodb');
    }

    if ((env !== 'production' || override === 'sqlite') && process.env.SQLITE_DATABASE_PATH) {
      const dbPath = process.env.SQLITE_DATABASE_PATH;
      if (!dbPath.endsWith('.db')) {
        console.warn('SQLite database path should end with .db extension');
      }
    }

    console.log('Environment configuration validated');
  }

  static async createAndConnect(): Promise<IConfigurationStorage> {
    this.validateEnvironment();
    const storage = this.createStorage();

    try {
      await storage.connect();
      console.log('Storage connected successfully');
      return storage;
    } catch (error) {
      console.error('Failed to connect to storage:', error);
      throw error;
    }
  }
}
