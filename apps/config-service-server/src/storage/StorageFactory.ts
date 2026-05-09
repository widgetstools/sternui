import { IConfigurationStorage } from './IConfigurationStorage.js';
import { SqliteStorage } from './SqliteStorage.js';
import { IAuthStorage } from './IAuthStorage.js';
import { SqliteAuthStorage } from './SqliteAuthStorage.js';

/**
 * Factory for creating the configuration storage implementation.
 * SQLite is the only engine — the previous MongoDB stub was removed
 * along with the design Decision 13 trim pass.
 */
export class StorageFactory {
  static createAuthStorage(): IAuthStorage {
    return new SqliteAuthStorage();
  }

  static createStorage(): IConfigurationStorage {
    return new SqliteStorage();
  }

  static validateEnvironment(): void {
    const dbPath = process.env.SQLITE_DATABASE_PATH;
    if (dbPath && !dbPath.endsWith('.db')) {
      console.warn('SQLite database path should end with .db extension');
    }
  }

  static async createAndConnect(): Promise<IConfigurationStorage> {
    this.validateEnvironment();
    const storage = this.createStorage();
    await storage.connect();
    return storage;
  }
}
