import { IConfigurationStorage } from './IConfigurationStorage.js';
import { SqliteStorage } from './SqliteStorage.js';

/**
 * Factory for creating the configuration storage implementation.
 * SQLite is the only engine currently wired up; MongoDB is a documented
 * future option.
 */
export class StorageFactory {
  static createStorage(): IConfigurationStorage {
    const env = process.env.NODE_ENV || 'development';
    const override = process.env.DATABASE_TYPE;

    if (override === 'mongodb') {
      throw new Error('MongoDB storage not yet implemented. Use DATABASE_TYPE=sqlite.');
    }

    if (override === 'sqlite' || env === 'development' || env === 'test') {
      return new SqliteStorage();
    }

    if (env === 'production') {
      throw new Error('MongoDB storage not yet implemented. Use DATABASE_TYPE=sqlite.');
    }

    return new SqliteStorage();
  }

  static validateEnvironment(): void {
    const env = process.env.NODE_ENV;
    const override = process.env.DATABASE_TYPE;

    if ((env === 'production' || override === 'mongodb') && !process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is required for production environment or when DATABASE_TYPE=mongodb',
      );
    }

    if ((env !== 'production' || override === 'sqlite') && process.env.SQLITE_DATABASE_PATH) {
      const dbPath = process.env.SQLITE_DATABASE_PATH;
      if (!dbPath.endsWith('.db')) {
        console.warn('SQLite database path should end with .db extension');
      }
    }
  }

  static async createAndConnect(): Promise<IConfigurationStorage> {
    this.validateEnvironment();
    const storage = this.createStorage();
    await storage.connect();
    return storage;
  }
}
