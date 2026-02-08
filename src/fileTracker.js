const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileTracker {
  constructor(localPath) {
    this.localPath = localPath;
    this.stateDir = path.join(localPath, '.gdrive-sync');
    this.metaFile = path.join(this.stateDir, 'meta.json');
    this.filesPerChunk = 500; // Store 500 files per chunk
    this.state = {
      files: {},
      lastSync: null
    };
    this.dirtyChunks = new Set(); // Track which chunks need saving
    this.loadedChunks = new Map(); // Track loaded chunks with their data
    this.maxLoadedChunks = 20; // Keep max 20 chunks in memory
    this.chunkAccessOrder = []; // LRU tracking
  }

  async load() {
    try {
      // Create state directory if it doesn't exist
      await fs.mkdir(this.stateDir, { recursive: true });
      
      // Try to load from old single file format first (migration)
      const oldTrackerFile = path.join(this.localPath, '.gdrive-sync-state.json');
      try {
        const oldData = await fs.readFile(oldTrackerFile, 'utf8');
        const oldState = JSON.parse(oldData);
        
        if (oldState.files && Object.keys(oldState.files).length > 0) {
          console.log('Migrating from old single-file format...');
          this.state = oldState;
          
          // Save in new chunked format
          await this.save();
          
          // Delete old file
          await fs.unlink(oldTrackerFile);
          console.log('Migration complete, old file removed');
          
          // Clear memory after migration
          this.state.files = {};
          return;
        }
      } catch (error) {
        // Old file doesn't exist, continue with new format
      }
      
      // Load metadata only (don't load all chunks)
      try {
        const metaData = await fs.readFile(this.metaFile, 'utf8');
        const meta = JSON.parse(metaData);
        this.state.lastSync = meta.lastSync;
      } catch (error) {
        // Meta file doesn't exist, start fresh
        this.state.lastSync = null;
      }
      
      // Don't load all chunks - use lazy loading instead
      console.log('FileTracker initialized with lazy loading');
      
    } catch (error) {
      console.error('Failed to load tracker state:', error);
      this.state = { files: {}, lastSync: null };
    }
  }

  async getChunkFiles() {
    try {
      const files = await fs.readdir(this.stateDir);
      return files.filter(f => f.startsWith('chunk-') && f.endsWith('.json'));
    } catch (error) {
      return [];
    }
  }

  async loadChunk(chunkFile) {
    try {
      // Check if already loaded
      if (this.loadedChunks.has(chunkFile)) {
        this.updateChunkAccess(chunkFile);
        return;
      }
      
      const chunkPath = path.join(this.stateDir, chunkFile);
      const data = await fs.readFile(chunkPath, 'utf8');
      const chunkData = JSON.parse(data);
      
      // Store chunk data separately
      this.loadedChunks.set(chunkFile, chunkData);
      this.updateChunkAccess(chunkFile);
      
      // Merge into main state for compatibility
      Object.assign(this.state.files, chunkData);
      
      // Evict old chunks if we have too many loaded
      await this.evictOldChunks();
      
    } catch (error) {
      console.error(`Failed to load chunk ${chunkFile}:`, error);
    }
  }

  updateChunkAccess(chunkFile) {
    // Remove from current position
    const index = this.chunkAccessOrder.indexOf(chunkFile);
    if (index > -1) {
      this.chunkAccessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.chunkAccessOrder.push(chunkFile);
  }

  async evictOldChunks() {
    // Keep only the most recently used chunks
    while (this.loadedChunks.size > this.maxLoadedChunks) {
      const oldestChunk = this.chunkAccessOrder.shift();
      if (oldestChunk && !this.dirtyChunks.has(oldestChunk)) {
        // Remove from memory
        const chunkData = this.loadedChunks.get(oldestChunk);
        if (chunkData) {
          // Remove files from main state
          for (const filePath of Object.keys(chunkData)) {
            delete this.state.files[filePath];
          }
        }
        this.loadedChunks.delete(oldestChunk);
        console.log(`Evicted chunk from memory: ${oldestChunk}`);
      }
    }
  }

  getChunkName(relativePath) {
    // Use first character(s) of path for sharding
    // This groups related files together and makes chunks predictable
    const normalized = relativePath.toLowerCase().replace(/\\/g, '/');
    
    // Get first directory or first char of filename
    const firstPart = normalized.split('/')[0];
    
    if (!firstPart) {
      return 'chunk-root.json';
    }
    
    // Use first 1-2 characters for chunk name
    // This creates chunks like: chunk-a.json, chunk-do.json, chunk-sr.json
    let chunkKey;
    if (firstPart.length === 1) {
      chunkKey = firstPart;
    } else if (firstPart.match(/^[0-9]/)) {
      // Group all numeric prefixes together
      chunkKey = '0-9';
    } else if (firstPart.match(/^[^a-z0-9]/)) {
      // Group special characters together
      chunkKey = 'special';
    } else {
      // Use first 2 chars for better distribution
      chunkKey = firstPart.substring(0, 2);
    }
    
    // Sanitize for filename
    chunkKey = chunkKey.replace(/[^a-z0-9-]/g, '_');
    
    return `chunk-${chunkKey}.json`;
  }

  async save() {
    try {
      // Create state directory if it doesn't exist
      await fs.mkdir(this.stateDir, { recursive: true });
      
      // Save metadata
      const meta = {
        lastSync: this.state.lastSync,
        version: '2.0',
        chunked: true
      };
      await fs.writeFile(this.metaFile, JSON.stringify(meta, null, 2));
      
      // Group files by chunk
      const chunks = {};
      for (const [relativePath, fileData] of Object.entries(this.state.files)) {
        const chunkName = this.getChunkName(relativePath);
        if (!chunks[chunkName]) {
          chunks[chunkName] = {};
        }
        chunks[chunkName][relativePath] = fileData;
      }
      
      // Also include loaded chunks that might have files
      for (const [chunkName, chunkData] of this.loadedChunks.entries()) {
        if (!chunks[chunkName]) {
          chunks[chunkName] = {};
        }
        Object.assign(chunks[chunkName], chunkData);
      }
      
      // Save only dirty chunks (or all if dirtyChunks is empty - first save)
      const chunksToSave = this.dirtyChunks.size > 0 
        ? Array.from(this.dirtyChunks) 
        : Object.keys(chunks);
      
      for (const chunkName of chunksToSave) {
        const chunkPath = path.join(this.stateDir, chunkName);
        const chunkData = chunks[chunkName] || {};
        
        if (Object.keys(chunkData).length > 0) {
          // Use streaming write for large chunks
          const jsonStr = JSON.stringify(chunkData, null, 2);
          await fs.writeFile(chunkPath, jsonStr);
        } else {
          // Delete empty chunk files
          try {
            await fs.unlink(chunkPath);
          } catch (error) {
            // File doesn't exist, ignore
          }
        }
      }
      
      // Clear dirty chunks after save
      this.dirtyChunks.clear();
      
    } catch (error) {
      console.error('Failed to save tracker state:', error);
    }
  }

  trackFile(relativePath, driveId, fileInfo) {
    this.state.files[relativePath] = {
      driveId,
      modifiedTime: fileInfo.modifiedTime,
      size: fileInfo.size,
      checksum: fileInfo.checksum
    };
    
    // Mark chunk as dirty
    const chunkName = this.getChunkName(relativePath);
    this.dirtyChunks.add(chunkName);
    
    // Update chunk data if loaded
    if (this.loadedChunks.has(chunkName)) {
      const chunkData = this.loadedChunks.get(chunkName);
      chunkData[relativePath] = this.state.files[relativePath];
    }
  }

  untrackFile(relativePath) {
    delete this.state.files[relativePath];
    
    // Mark chunk as dirty
    const chunkName = this.getChunkName(relativePath);
    this.dirtyChunks.add(chunkName);
    
    // Update chunk data if loaded
    if (this.loadedChunks.has(chunkName)) {
      const chunkData = this.loadedChunks.get(chunkName);
      delete chunkData[relativePath];
    }
  }

  async getTrackedFile(relativePath) {
    // Check if file is in memory
    if (this.state.files[relativePath]) {
      return this.state.files[relativePath];
    }
    
    // Lazy load the chunk if needed
    const chunkName = this.getChunkName(relativePath);
    await this.loadChunk(chunkName);
    
    return this.state.files[relativePath];
  }

  async getAllTrackedFiles() {
    // For getting all files, we need to load all chunks
    // This is expensive but only used during full sync
    const chunkFiles = await this.getChunkFiles();
    for (const chunkFile of chunkFiles) {
      await this.loadChunk(chunkFile);
    }
    
    return Object.keys(this.state.files);
  }

  updateLastSync() {
    this.state.lastSync = new Date().toISOString();
  }

  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const checksum = await this.calculateChecksum(filePath);
      
      return {
        modifiedTime: stats.mtime.toISOString(),
        size: stats.size,
        checksum
      };
    } catch (error) {
      console.error('Failed to get file info:', error);
      return null;
    }
  }

  async hasChanged(relativePath) {
    const tracked = this.getTrackedFile(relativePath);
    if (!tracked) return true;

    const filePath = path.join(this.localPath, relativePath);
    const currentInfo = await this.getFileInfo(filePath);
    
    if (!currentInfo) return false;

    // Check if file has changed
    return currentInfo.checksum !== tracked.checksum ||
           currentInfo.size !== tracked.size;
  }

  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = require('fs').createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

module.exports = FileTracker;
