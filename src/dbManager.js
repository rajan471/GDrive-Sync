class DBManager {
  constructor() {
    this.dbName = 'GDriveSyncDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store for sync configurations
        if (!db.objectStoreNames.contains('syncConfigs')) {
          const configStore = db.createObjectStore('syncConfigs', { keyPath: 'id', autoIncrement: true });
          configStore.createIndex('localPath', 'localPath', { unique: false });
          configStore.createIndex('driveFolderId', 'driveFolderId', { unique: false });
        }

        // Store for tokens
        if (!db.objectStoreNames.contains('tokens')) {
          db.createObjectStore('tokens', { keyPath: 'id' });
        }

        // Store for sync history
        if (!db.objectStoreNames.contains('syncHistory')) {
          const historyStore = db.createObjectStore('syncHistory', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
          historyStore.createIndex('configId', 'configId', { unique: false });
        }

        // Store for synced files
        if (!db.objectStoreNames.contains('syncedFiles')) {
          const filesStore = db.createObjectStore('syncedFiles', { keyPath: 'id', autoIncrement: true });
          filesStore.createIndex('configId', 'configId', { unique: false });
          filesStore.createIndex('relativePath', 'relativePath', { unique: false });
        }
      };
    });
  }

  // Token operations
  async saveToken(tokens) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tokens'], 'readwrite');
      const store = transaction.objectStore('tokens');
      const request = store.put({ id: 'current', tokens, savedAt: new Date().toISOString() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getToken() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tokens'], 'readonly');
      const store = transaction.objectStore('tokens');
      const request = store.get('current');

      request.onsuccess = () => resolve(request.result?.tokens || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteToken() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tokens'], 'readwrite');
      const store = transaction.objectStore('tokens');
      const request = store.delete('current');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Save sync config operations
  async saveSyncConfig(config) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncConfigs'], 'readwrite');
      const store = transaction.objectStore('syncConfigs');
      
      const configData = {
        ...config,
        updatedAt: new Date().toISOString()
      };

      const request = config.id ? store.put(configData) : store.add(configData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getLastSyncConfig() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncConfigs'], 'readonly');
      const store = transaction.objectStore('syncConfigs');
      const request = store.getAll();

      request.onsuccess = () => {
        const configs = request.result;
        if (configs.length === 0) {
          resolve(null);
        } else {
          // Return the most recently updated config
          const sorted = configs.sort((a, b) => 
            new Date(b.updatedAt) - new Date(a.updatedAt)
          );
          resolve(sorted[0]);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncConfigs() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncConfigs'], 'readonly');
      const store = transaction.objectStore('syncConfigs');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncConfig(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncConfigs'], 'readonly');
      const store = transaction.objectStore('syncConfigs');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSyncConfig(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncConfigs'], 'readwrite');
      const store = transaction.objectStore('syncConfigs');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Sync history operations
  async addSyncHistory(configId, stats) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncHistory'], 'readwrite');
      const store = transaction.objectStore('syncHistory');
      
      const historyData = {
        configId,
        stats,
        timestamp: new Date().toISOString()
      };

      const request = store.add(historyData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncHistory(configId, limit = 50) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncHistory'], 'readonly');
      const store = transaction.objectStore('syncHistory');
      const index = store.index('configId');
      const request = index.getAll(configId);

      request.onsuccess = () => {
        const results = request.result
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limit);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Synced files operations
  async saveSyncedFile(configId, fileData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncedFiles'], 'readwrite');
      const store = transaction.objectStore('syncedFiles');
      
      const data = {
        configId,
        ...fileData,
        syncedAt: new Date().toISOString()
      };

      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncedFiles(configId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncedFiles'], 'readonly');
      const store = transaction.objectStore('syncedFiles');
      const index = store.index('configId');
      const request = index.getAll(configId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearSyncedFiles(configId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncedFiles'], 'readwrite');
      const store = transaction.objectStore('syncedFiles');
      const index = store.index('configId');
      const request = index.openCursor(configId);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DBManager;
}
