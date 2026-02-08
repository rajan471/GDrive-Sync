const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const FileTracker = require('./fileTracker');

class SyncManager {
  constructor(tokens) {
    this.tokens = tokens;
    this.oauth2Client = null;
    this.drive = null;
    this.watcher = null;
    this.syncing = false;
    this.localPath = null;
    this.statusCallback = null;
    this.fileTracker = null;
    this.driveFolderId = null; // Target Drive folder ID
    this.syncQueue = [];
    this.activeSyncs = 0;
    this.maxConcurrentSyncs = 3; // Limit to 3 concurrent uploads
    this.retryAttempts = 3; // Number of retry attempts for failed operations
    this.retryDelay = 1000; // Initial retry delay in ms
    this.conflictResolution = 'keep-both'; // Default: keep-both, local-wins, drive-wins, ask
  }

  async retryOperation(operation, operationName, maxRetries = this.retryAttempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on authentication errors
        if (error.code === 401 || error.code === 403) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          this.sendStatus(`${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async authenticate() {
    try {
      // Load OAuth credentials for token refresh
      const credentials = this.loadCredentials();
      
      // OAuth client needs client ID and secret for token refresh
      this.oauth2Client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        credentials.redirectUri
      );
      this.oauth2Client.setCredentials(this.tokens);
      
      // Set up token refresh handler
      this.oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          // Store the new refresh token
          this.tokens.refresh_token = tokens.refresh_token;
        }
        if (tokens.access_token) {
          this.tokens.access_token = tokens.access_token;
        }
        if (tokens.expiry_date) {
          this.tokens.expiry_date = tokens.expiry_date;
        }
        
        // Save updated tokens
        this.saveTokens();
        this.sendStatus('Access token refreshed', 'info');
      });
      
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    } catch (error) {
      console.error('Authentication error:', error);
      await this.removeInvalidTokens();
      throw error;
    }
  }

  async removeInvalidTokens() {
    try {
      const tokenPath = path.join(process.cwd(), 'token.json');
      await require('fs').promises.unlink(tokenPath);
      console.log('Removed invalid token file');
      this.sendStatus('Invalid tokens removed. Please re-authenticate.', 'error');
    } catch (error) {
      // Token file doesn't exist, ignore
    }
  }

  async handleAuthError(error) {
    // Check if it's an authentication error
    const isAuthError = 
      error.code === 401 || 
      error.code === 403 ||
      error.status === 401 ||
      error.status === 403 ||
      (error.message && error.message.includes('invalid_request')) ||
      (error.message && error.message.includes('invalid_grant')) ||
      (error.message && error.message.includes('invalid_token'));
    
    if (isAuthError) {
      console.error('Authentication error detected:', error.message);
      await this.removeInvalidTokens();
      this.sendStatus('Authentication failed. Please sign in again.', 'error');
      return true;
    }
    
    return false;
  }

  loadCredentials() {
    // Try environment variables first (production)
    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Fall back to config.json (development)
    if (!clientId || !clientSecret) {
      try {
        const configPath = path.join(process.cwd(), 'config.json');
        const config = require(configPath);
        
        if (config.google && config.google.clientId && config.google.clientSecret) {
          clientId = config.google.clientId;
          clientSecret = config.google.clientSecret;
        }
      } catch (error) {
        // Config file doesn't exist or is invalid
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not found. Please check config.json or environment variables.');
    }

    return {
      clientId,
      clientSecret,
      redirectUri: `http://127.0.0.1:9001/oauth2callback`
    };
  }

  async saveTokens() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const tokenPath = path.join(process.cwd(), 'token.json');
      await fs.writeFile(tokenPath, JSON.stringify(this.tokens, null, 2));
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  async startSync(localPath, statusCallback) {
    this.localPath = localPath;
    this.statusCallback = statusCallback;
    this.syncing = true;

    try {
      // Verify Drive folder is set
      if (!this.driveFolderId) {
        this.sendStatus('Error: No Drive folder selected', 'error');
        throw new Error('Drive folder not set');
      }

      this.sendStatus(`Starting sync to Drive folder ID: ${this.driveFolderId}`, 'info');

      // Initialize file tracker
      this.fileTracker = new FileTracker(localPath);
      await this.fileTracker.load();

      // Initial sync from Drive to local
      await this.syncFromDrive();

      // Watch for local changes
      this.watchLocalChanges();
      
      // Start monitoring Drive changes
      this.startDriveMonitoring();

      this.sendStatus('Sync started successfully', 'success');
    } catch (error) {
      this.syncing = false;
      this.sendStatus(`Failed to start sync: ${error.message}`, 'error');
      throw error;
    }
  }

  startDriveMonitoring() {
    // Poll Drive for changes every 30 seconds
    this.driveMonitorInterval = setInterval(async () => {
      if (!this.syncing) {
        clearInterval(this.driveMonitorInterval);
        return;
      }
      
      try {
        await this.checkDriveChanges();
      } catch (error) {
        console.error('Drive monitoring error:', error);
        // Don't stop monitoring on errors
      }
    }, 30000); // Check every 30 seconds
    
    this.sendStatus('Drive change monitoring started', 'info');
  }

  async checkDriveChanges() {
    try {
      // Get all files from Drive
      const driveFiles = await this.getAllDriveFiles(this.driveFolderId);
      const trackedFiles = await this.fileTracker.getAllTrackedFiles();
      
      let changesDetected = 0;
      
      // Check for new or modified files in Drive
      for (const driveFile of driveFiles) {
        if (driveFile.mimeType.startsWith('application/vnd.google-apps')) {
          continue; // Skip Google Workspace files
        }
        
        const tracked = await this.fileTracker.getTrackedFile(driveFile.path);
        const localFilePath = path.join(this.localPath, driveFile.path);
        
        if (!tracked) {
          // New file in Drive
          this.sendStatus(`New file detected in Drive: ${driveFile.path}`, 'info');
          await this.downloadFile(driveFile.id, localFilePath);
          
          const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
          if (fileInfo) {
            this.fileTracker.trackFile(driveFile.path, driveFile.id, fileInfo);
          }
          changesDetected++;
        } else {
          // Check if Drive version is newer
          const driveModified = new Date(driveFile.modifiedTime);
          const trackedModified = new Date(tracked.modifiedTime);
          
          if (driveModified > trackedModified) {
            // Check if local file also changed (conflict)
            const localExists = await this.fileExists(localFilePath);
            if (localExists) {
              const localInfo = await this.fileTracker.getFileInfo(localFilePath);
              const localModified = new Date(localInfo.modifiedTime);
              
              if (localModified > trackedModified) {
                // Conflict - both changed
                this.sendStatus(`Conflict detected from Drive: ${driveFile.path}`, 'warning');
                await this.resolveConflict(driveFile.path, driveFile, {
                  hasConflict: true,
                  localNewer: localModified > driveModified,
                  driveNewer: driveModified > localModified
                });
              } else {
                // Only Drive changed
                this.sendStatus(`Updating from Drive: ${driveFile.path}`, 'info');
                await this.downloadFile(driveFile.id, localFilePath);
                
                const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
                if (fileInfo) {
                  this.fileTracker.trackFile(driveFile.path, driveFile.id, fileInfo);
                }
              }
            } else {
              // Local file deleted, download from Drive
              this.sendStatus(`Re-downloading deleted file: ${driveFile.path}`, 'info');
              await this.downloadFile(driveFile.id, localFilePath);
              
              const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
              if (fileInfo) {
                this.fileTracker.trackFile(driveFile.path, driveFile.id, fileInfo);
              }
            }
            changesDetected++;
          }
        }
      }
      
      // Check for deleted files in Drive
      for (const trackedPath of trackedFiles) {
        const driveHasFile = driveFiles.some(f => f.path === trackedPath);
        if (!driveHasFile) {
          // File deleted from Drive
          const localFilePath = path.join(this.localPath, trackedPath);
          const localExists = await this.fileExists(localFilePath);
          
          if (localExists) {
            this.sendStatus(`File deleted from Drive: ${trackedPath}`, 'info');
            await require('fs').promises.unlink(localFilePath);
            this.fileTracker.untrackFile(trackedPath);
            changesDetected++;
          }
        }
      }
      
      if (changesDetected > 0) {
        await this.fileTracker.save();
        this.sendStatus(`Drive monitoring: ${changesDetected} change(s) synced`, 'success');
      }
    } catch (error) {
      console.error('Error checking Drive changes:', error);
      // Check if it's an authentication error
      const isAuthError = await this.handleAuthError(error);
      if (!isAuthError) {
        this.sendStatus(`Drive monitoring error: ${error.message}`, 'error');
      }
    }
  }

  async setDriveFolder(folderName) {
    try {
      // Handle nested folder paths like "Projects/ChatApp"
      const folderParts = folderName.split('/').filter(part => part.trim());
      
      if (folderParts.length === 0) {
        return { success: false, error: 'Invalid folder name' };
      }

      let parentId = null;
      let currentPath = '';

      // Create or find each folder in the path
      for (let i = 0; i < folderParts.length; i++) {
        const part = folderParts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        // Search for existing folder
        let query = `name='${part}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
          query += ` and '${parentId}' in parents`;
        } else {
          query += ` and 'root' in parents`;
        }

        const response = await this.drive.files.list({
          q: query,
          fields: 'files(id, name)',
          spaces: 'drive'
        });

        if (response.data.files.length > 0) {
          // Folder exists
          parentId = response.data.files[0].id;
        } else {
          // Create new folder
          const fileMetadata = {
            name: part,
            mimeType: 'application/vnd.google-apps.folder'
          };

          if (parentId) {
            fileMetadata.parents = [parentId];
          }

          const folder = await this.drive.files.create({
            requestBody: fileMetadata,
            fields: 'id'
          });

          parentId = folder.data.id;
        }
      }

      this.driveFolderId = parentId;
      const created = folderParts.length > 1 || currentPath !== folderName;
      return { 
        success: true, 
        folderId: this.driveFolderId, 
        created: created,
        path: folderName 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listDriveFolders() {
    try {
      const response = await this.drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name, parents)',
        spaces: 'drive',
        pageSize: 100
      });

      // Build folder paths
      const folders = response.data.files;
      const folderMap = new Map();
      
      // First pass: create map of all folders
      folders.forEach(folder => {
        folderMap.set(folder.id, {
          id: folder.id,
          name: folder.name,
          parents: folder.parents || []
        });
      });
      
      // Function to build full path
      const buildPath = (folderId, visited = new Set()) => {
        if (visited.has(folderId)) return ''; // Prevent infinite loops
        visited.add(folderId);
        
        const folder = folderMap.get(folderId);
        if (!folder) return '';
        
        if (!folder.parents || folder.parents.length === 0 || folder.parents[0] === 'root') {
          return folder.name;
        }
        
        const parentPath = buildPath(folder.parents[0], visited);
        return parentPath ? `${parentPath}/${folder.name}` : folder.name;
      };
      
      // Build paths for all folders
      const foldersWithPaths = folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        path: buildPath(folder.id)
      }));
      
      // Sort by path
      foldersWithPaths.sort((a, b) => a.path.localeCompare(b.path));

      return { success: true, folders: foldersWithPaths };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  stopSync() {
    this.syncing = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.driveMonitorInterval) {
      clearInterval(this.driveMonitorInterval);
      this.driveMonitorInterval = null;
    }
    if (this.fileTracker) {
      this.fileTracker.save();
    }
    // Clear the sync queue
    this.syncQueue = [];
    this.activeSyncs = 0;
    this.sendStatus('Sync stopped by user', 'info');
  }

  async syncFromDrive() {
    try {
      this.sendStatus('Fetching files from Google Drive...');
      
      // Get all files recursively from Drive folder
      const driveFiles = await this.getAllDriveFiles(this.driveFolderId);
      const localFiles = await this.getLocalFiles();
      
      let stats = { 
        downloaded: 0, 
        uploaded: 0, 
        skipped: 0, 
        conflicts: 0,
        folders: 0 
      };
      
      const totalItems = driveFiles.length + localFiles.length;
      let processed = 0;

      this.sendStatus(`Found ${driveFiles.length} files in Drive, ${localFiles.length} files locally`, 'info');

      // Process Drive files in batches to reduce memory usage
      const BATCH_SIZE = 50;
      for (let i = 0; i < driveFiles.length; i += BATCH_SIZE) {
        const batch = driveFiles.slice(i, i + BATCH_SIZE);
        
        for (const file of batch) {
          processed++;
          
          // Update progress
          this.sendStatus('', 'info', null, {
            current: processed,
            total: totalItems,
            message: 'Syncing from Drive'
          }, file.path);
          
          // Skip Google Workspace files (Docs, Sheets, etc.)
          if (file.mimeType.startsWith('application/vnd.google-apps')) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
              stats.folders++;
            }
            continue;
          }

          const relativePath = file.path;
          const localFilePath = path.join(this.localPath, relativePath);
          
          // Create parent directories if needed
          const parentDir = path.dirname(localFilePath);
          await fs.mkdir(parentDir, { recursive: true });
          
          // Check if file exists locally
          const localExists = await this.fileExists(localFilePath);
          const tracked = await this.fileTracker.getTrackedFile(relativePath);
          
          if (!localExists) {
            // File only in Drive - download it
            this.sendStatus(`Downloading: ${file.path}`, 'info');
            await this.downloadFile(file.id, localFilePath);
            
            const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
            if (fileInfo) {
              this.fileTracker.trackFile(relativePath, file.id, fileInfo);
            }
            
            stats.downloaded++;
            this.sendStatus(`Downloaded: ${file.path}`, 'success');
          } else if (tracked) {
            // File exists both locally and in Drive - check for conflicts
            const conflict = await this.detectConflict(relativePath, file, tracked);
            
            if (conflict.hasConflict) {
              stats.conflicts++;
              await this.resolveConflict(relativePath, file, conflict);
            } else if (conflict.driveNewer) {
              // Drive version is newer
              this.sendStatus(`Updating from Drive: ${file.path}`, 'info');
              await this.downloadFile(file.id, localFilePath);
              
              const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
              if (fileInfo) {
                this.fileTracker.trackFile(relativePath, file.id, fileInfo);
              }
              
              stats.downloaded++;
              this.sendStatus(`Updated: ${file.path}`, 'success');
            } else {
              stats.skipped++;
            }
          } else {
            // File exists locally but not tracked - check if it's the same file
            const localInfo = await this.fileTracker.getFileInfo(localFilePath);
            const driveModified = new Date(file.modifiedTime);
            const localModified = new Date(localInfo.modifiedTime);
            
            // Check if checksums match (same file)
            const checksumsMatch = file.md5Checksum && localInfo.checksum === file.md5Checksum;
            
            if (checksumsMatch) {
              // Same file, just track it without downloading
              this.fileTracker.trackFile(relativePath, file.id, localInfo);
              stats.skipped++;
              this.sendStatus(`Already synced: ${file.path}`, 'info');
            } else if (Math.abs(driveModified - localModified) > 5000) { // 5 second threshold
              // Different files - potential conflict
              stats.conflicts++;
              await this.resolveConflict(relativePath, file, {
                hasConflict: true,
                localNewer: localModified > driveModified,
                driveNewer: driveModified > localModified
              });
            } else {
              // Close enough timestamps, assume same file, just track it
              this.fileTracker.trackFile(relativePath, file.id, localInfo);
              stats.skipped++;
              this.sendStatus(`Tracked existing: ${file.path}`, 'info');
            }
          }
        }
        
        // Save progress after each batch
        await this.fileTracker.save();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // Process local files that aren't in Drive in batches
      for (let i = 0; i < localFiles.length; i += BATCH_SIZE) {
        const batch = localFiles.slice(i, i + BATCH_SIZE);
        
        for (const localFile of batch) {
          processed++;
          
          // Update progress
          this.sendStatus('', 'info', null, {
            current: processed,
            total: totalItems,
            message: 'Syncing to Drive'
          }, localFile);
          
          const tracked = await this.fileTracker.getTrackedFile(localFile);
          const driveHasFile = driveFiles.some(f => f.path === localFile);
          
          if (!driveHasFile && !tracked) {
            // File only exists locally - upload it with folder structure
            const localFilePath = path.join(this.localPath, localFile);
            this.sendStatus(`Uploading: ${localFile}`, 'info');
            
            await this.uploadFileWithPath(localFilePath, localFile);

            stats.uploaded++;
            this.sendStatus(`Uploaded: ${localFile}`, 'success');
          }
        }
        
        // Save progress after each batch
        await this.fileTracker.save();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // If using "local-wins" strategy, delete Drive files that don't exist locally
      if (this.conflictResolution === 'local-wins') {
        for (const driveFile of driveFiles) {
          // Skip Google Workspace files
          if (driveFile.mimeType.startsWith('application/vnd.google-apps')) {
            continue;
          }
          
          const localFilePath = path.join(this.localPath, driveFile.path);
          const localExists = await this.fileExists(localFilePath);
          
          if (!localExists) {
            // File exists in Drive but not locally - delete from Drive
            this.sendStatus(`Deleting from Drive (local-wins): ${driveFile.path}`, 'info');
            try {
              await this.drive.files.delete({ fileId: driveFile.id });
              this.fileTracker.untrackFile(driveFile.path);
              stats.uploaded++; // Count as a sync operation
              this.sendStatus(`Deleted from Drive: ${driveFile.path}`, 'success');
            } catch (error) {
              this.sendStatus(`Failed to delete from Drive: ${driveFile.path}`, 'error');
              console.error('Delete error:', error);
            }
          }
        }
      }

      await this.fileTracker.save();
      this.fileTracker.updateLastSync();
      
      // Clear progress
      this.sendStatus('', 'info', null, { current: 0, total: 0 }, null);
      
      const summary = `Sync complete - Downloaded: ${stats.downloaded}, Uploaded: ${stats.uploaded}, Skipped: ${stats.skipped}, Conflicts: ${stats.conflicts}`;
      this.sendStatus(summary, 'success', stats);
    } catch (error) {
      // Check if it's an authentication error
      const isAuthError = await this.handleAuthError(error);
      if (isAuthError) {
        this.syncing = false;
        throw new Error('Authentication failed. Please sign in again.');
      }
      this.sendStatus(`Sync error: ${error.message}`, 'error');
    }
  }

  async getAllDriveFiles(folderId, parentPath = '') {
    const allFiles = [];
    
    try {
      let query = 'trashed=false';
      if (folderId) {
        query = `'${folderId}' in parents and trashed=false`;
      }

      const response = await this.drive.files.list({
        q: query,
        pageSize: 1000,
        fields: 'files(id, name, mimeType, modifiedTime, md5Checksum, size, parents)'
      });

      for (const file of response.data.files) {
        const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
        
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Recursively get files from subfolder
          const subFiles = await this.getAllDriveFiles(file.id, filePath);
          allFiles.push(...subFiles);
        } else if (!file.mimeType.startsWith('application/vnd.google-apps')) {
          // Regular file
          allFiles.push({
            ...file,
            path: filePath
          });
        }
      }
    } catch (error) {
      console.error('Error getting Drive files:', error);
      // Check if it's an authentication error
      await this.handleAuthError(error);
      throw error;
    }
    
    return allFiles;
  }

  async uploadFileWithPath(localFilePath, relativePath) {
    try {
      const fs = require('fs');
      const stats = await require('fs').promises.stat(localFilePath);
      const fileSize = stats.size;
      const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB
      
      // Split path into folders and filename
      const pathParts = relativePath.split(path.sep);
      const fileName = pathParts.pop();
      
      // Create folder structure in Drive
      let parentId = this.driveFolderId;
      
      for (const folderName of pathParts) {
        if (!folderName) continue;
        
        // Check if folder exists
        const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const response = await this.drive.files.list({
          q: query,
          fields: 'files(id, name)',
          spaces: 'drive'
        });

        if (response.data.files.length > 0) {
          parentId = response.data.files[0].id;
        } else {
          // Create folder
          const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
          };

          const folder = await this.drive.files.create({
            requestBody: folderMetadata,
            fields: 'id'
          });

          parentId = folder.data.id;
        }
      }
      
      // Use resumable upload for large files
      if (fileSize > LARGE_FILE_THRESHOLD) {
        this.sendStatus(`Uploading large file (${(fileSize / 1024 / 1024).toFixed(2)}MB): ${fileName}`, 'info');
        await this.uploadLargeFile(localFilePath, fileName, parentId, relativePath);
      } else {
        // Regular upload for small files
        const fileMetadata = {
          name: fileName,
          parents: [parentId]
        };

        const media = {
          mimeType: 'application/octet-stream',
          body: fs.createReadStream(localFilePath)
        };

        const response = await this.drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id'
        });

        const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
        if (fileInfo) {
          this.fileTracker.trackFile(relativePath, response.data.id, fileInfo);
          await this.fileTracker.save();
        }
      }
    } catch (error) {
      console.error('Error uploading file with path:', error);
      throw error;
    }
  }

  async uploadLargeFile(localFilePath, fileName, parentId, relativePath) {
    const fs = require('fs');
    const stats = await require('fs').promises.stat(localFilePath);
    const fileSize = stats.size;
    
    try {
      const fileMetadata = {
        name: fileName,
        parents: [parentId]
      };

      const media = {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(localFilePath)
      };

      // Use resumable upload
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
        supportsAllDrives: true
      }, {
        // Enable resumable upload
        onUploadProgress: (evt) => {
          const progress = (evt.bytesRead / fileSize) * 100;
          this.sendStatus(`Uploading ${fileName}: ${progress.toFixed(1)}%`, 'info');
        }
      });

      const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
      if (fileInfo) {
        this.fileTracker.trackFile(relativePath, response.data.id, fileInfo);
        await this.fileTracker.save();
      }
      
      this.sendStatus(`Large file uploaded successfully: ${fileName}`, 'success');
    } catch (error) {
      console.error('Error uploading large file:', error);
      throw error;
    }
  }

  async getLocalFiles() {
    const files = [];
    
    async function scanDir(dir, basePath) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        
        // Skip ignored patterns
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'build') {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scanDir(fullPath, basePath);
        } else {
          files.push(relativePath);
        }
      }
    }
    
    try {
      await scanDir(this.localPath, this.localPath);
    } catch (error) {
      console.error('Error scanning local files:', error);
    }
    
    return files;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async detectConflict(relativePath, driveFile, tracked) {
    const localFilePath = path.join(this.localPath, relativePath);
    const localInfo = await this.fileTracker.getFileInfo(localFilePath);
    
    if (!localInfo) {
      return { hasConflict: false, driveNewer: true };
    }

    const driveModified = new Date(driveFile.modifiedTime);
    const localModified = new Date(localInfo.modifiedTime);
    const trackedModified = new Date(tracked.modifiedTime);

    // Check if both local and drive were modified since last sync
    const localChanged = localModified > trackedModified;
    const driveChanged = driveModified > trackedModified;

    if (localChanged && driveChanged) {
      // Both timestamps changed - check content to avoid false conflicts
      
      // Compare checksums to see if content actually changed
      const localContentChanged = localInfo.checksum !== tracked.checksum;
      const driveContentChanged = driveFile.md5Checksum && 
                                   driveFile.md5Checksum !== tracked.checksum;
      
      // If checksums match, no real conflict (just timestamp change)
      if (driveFile.md5Checksum && localInfo.checksum === driveFile.md5Checksum) {
        this.sendStatus(`No content change detected: ${relativePath}`, 'info');
        return {
          hasConflict: false,
          localNewer: false,
          driveNewer: false,
          sameContent: true
        };
      }
      
      // If only one side's content changed, not a conflict
      if (localContentChanged && !driveContentChanged) {
        return {
          hasConflict: false,
          localNewer: true,
          driveNewer: false,
          localModified,
          driveModified
        };
      }
      
      if (driveContentChanged && !localContentChanged) {
        return {
          hasConflict: false,
          localNewer: false,
          driveNewer: true,
          localModified,
          driveModified
        };
      }
      
      // Both content changed - real conflict!
      if (localContentChanged && driveContentChanged) {
        this.sendStatus(`Content conflict detected: ${relativePath}`, 'warning');
        return {
          hasConflict: true,
          localNewer: localModified > driveModified,
          driveNewer: driveModified > localModified,
          localModified,
          driveModified
        };
      }
      
      // Timestamps changed but no content change on either side
      return {
        hasConflict: false,
        localNewer: false,
        driveNewer: false,
        sameContent: true
      };
    }

    return {
      hasConflict: false,
      localNewer: localModified > driveModified,
      driveNewer: driveModified > localModified
    };
  }

  async resolveConflict(relativePath, driveFile, conflict) {
    this.sendStatus(`⚠️ Conflict detected: ${relativePath}`, 'warning');
    
    const localFilePath = path.join(this.localPath, relativePath);
    
    try {
      switch (this.conflictResolution) {
        case 'local-wins':
          // Keep local, upload to Drive (overwrite)
          await this.resolveConflictLocalWins(relativePath, driveFile, localFilePath);
          break;
          
        case 'drive-wins':
          // Keep Drive, download to local (overwrite)
          await this.resolveConflictDriveWins(relativePath, driveFile, localFilePath);
          break;
          
        case 'keep-both':
          // Keep both versions (default behavior)
          await this.resolveConflictKeepBoth(relativePath, driveFile, localFilePath);
          break;
          
        case 'ask':
          // Ask user for each conflict
          await this.resolveConflictAsk(relativePath, driveFile, localFilePath, conflict);
          break;
          
        default:
          await this.resolveConflictKeepBoth(relativePath, driveFile, localFilePath);
      }
    } catch (error) {
      this.sendStatus(`Failed to resolve conflict: ${error.message}`, 'error');
    }
  }

  async resolveConflictAsk(relativePath, driveFile, localFilePath, conflict) {
    this.sendStatus(`Waiting for user decision: ${relativePath}`, 'info');
    
    // Get file info for display
    const localInfo = await this.fileTracker.getFileInfo(localFilePath);
    const driveModified = new Date(driveFile.modifiedTime);
    const localModified = localInfo ? new Date(localInfo.modifiedTime) : new Date();
    
    // Send conflict info to renderer and wait for decision
    const decision = await this.askUserForConflictResolution({
      fileName: relativePath,
      localModified: localModified.toISOString(),
      driveModified: driveModified.toISOString(),
      localSize: localInfo ? localInfo.size : 0,
      driveSize: driveFile.size || 0
    });
    
    // Execute based on user's decision
    switch (decision) {
      case 'local':
        await this.resolveConflictLocalWins(relativePath, driveFile, localFilePath);
        break;
      case 'drive':
        await this.resolveConflictDriveWins(relativePath, driveFile, localFilePath);
        break;
      case 'both':
        await this.resolveConflictKeepBoth(relativePath, driveFile, localFilePath);
        break;
      case 'skip':
        this.sendStatus(`Skipped conflict: ${relativePath}`, 'info');
        break;
      default:
        // Default to keep both if something goes wrong
        await this.resolveConflictKeepBoth(relativePath, driveFile, localFilePath);
    }
  }

  async askUserForConflictResolution(conflictInfo) {
    return new Promise((resolve) => {
      // Store the resolve function so we can call it when user responds
      this.conflictResolveCallback = resolve;
      
      // Send conflict info to renderer
      this.sendStatus('', 'conflict', null, null, null, conflictInfo);
    });
  }

  async resolveConflictLocalWins(relativePath, driveFile, localFilePath) {
    this.sendStatus(`Conflict resolution: Keeping local version of ${relativePath}`, 'info');
    
    // Upload local file to Drive (overwrite)
    const media = {
      mimeType: 'application/octet-stream',
      body: require('fs').createReadStream(localFilePath)
    };

    await this.drive.files.update({
      fileId: driveFile.id,
      media: media
    });

    // Update tracking
    const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
    if (fileInfo) {
      this.fileTracker.trackFile(relativePath, driveFile.id, fileInfo);
      await this.fileTracker.save();
    }

    this.sendStatus(`✓ Conflict resolved: Local version uploaded to Drive`, 'success');
  }

  async resolveConflictDriveWins(relativePath, driveFile, localFilePath) {
    this.sendStatus(`Conflict resolution: Keeping Drive version of ${relativePath}`, 'info');
    
    // Download Drive version (overwrite local)
    await this.downloadFile(driveFile.id, localFilePath);
    
    // Update tracking
    const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
    if (fileInfo) {
      this.fileTracker.trackFile(relativePath, driveFile.id, fileInfo);
      await this.fileTracker.save();
    }

    this.sendStatus(`✓ Conflict resolved: Drive version downloaded`, 'success');
  }

  async resolveConflictKeepBoth(relativePath, driveFile, localFilePath) {
    this.sendStatus(`Conflict resolution: Keeping both versions of ${relativePath}`, 'info');
    
    // Strategy: Keep both versions
    // Rename local file with timestamp, download Drive version
    const ext = path.extname(relativePath);
    const nameWithoutExt = path.basename(relativePath, ext);
    const dir = path.dirname(relativePath);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const conflictName = `${nameWithoutExt}_conflict_${timestamp}${ext}`;
    const conflictPath = path.join(this.localPath, dir, conflictName);
    
    try {
      // Rename local file
      await require('fs').promises.rename(localFilePath, conflictPath);
      this.sendStatus(`Saved local version as: ${conflictName}`, 'info');
      
      // Download Drive version
      await this.downloadFile(driveFile.id, localFilePath);
      this.sendStatus(`Downloaded Drive version: ${relativePath}`, 'info');
      
      // Track both files
      const fileInfo = await this.fileTracker.getFileInfo(localFilePath);
      if (fileInfo) {
        this.fileTracker.trackFile(relativePath, driveFile.id, fileInfo);
      }
      
      // Upload conflict version to Drive (check if file still exists)
      const conflictExists = await this.fileExists(conflictPath);
      if (conflictExists) {
        const conflictRelativePath = path.join(dir, conflictName);
        await this.uploadConflictFile(conflictPath, conflictRelativePath);
      }
      
      this.sendStatus(`✓ Conflict resolved: Kept both versions`, 'success');
    } catch (error) {
      this.sendStatus(`Error resolving conflict: ${error.message}`, 'error');
      console.error('Conflict resolution error:', error);
    }
  }

  async uploadConflictFile(filePath, relativePath) {
    try {
      // Use uploadFileWithPath to preserve folder structure
      await this.uploadFileWithPath(filePath, relativePath);
      this.sendStatus(`Conflict file uploaded successfully`, 'success');
    } catch (error) {
      console.error('Error uploading conflict file:', error);
      this.sendStatus(`Error uploading conflict file: ${error.message}`, 'error');
    }
  }

  async downloadFile(fileId, destPath) {
    return this.retryOperation(async () => {
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      const dest = require('fs').createWriteStream(destPath);
      
      return new Promise((resolve, reject) => {
        let downloadedBytes = 0;
        
        response.data
          .on('data', (chunk) => {
            downloadedBytes += chunk.length;
          })
          .on('end', () => {
            resolve();
          })
          .on('error', reject)
          .pipe(dest);
      });
    }, `Download ${path.basename(destPath)}`);
  }

  watchLocalChanges() {
    this.watcher = chokidar.watch(this.localPath, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/.vscode/**',
        '**/.idea/**',
        '**/target/**',
        '**/__pycache__/**',
        '**/*.pyc',
        '**/venv/**',
        '**/env/**',
        '**/coverage/**',
        '**/.next/**',
        '**/out/**',
        '**/*.log',
        '**/.cache/**',
        '**/tmp/**',
        '**/temp/**'
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      depth: 5, // Reduce depth to avoid too many files
      usePolling: true, // Use polling instead of native watchers
      interval: 1000, // Poll every second
      binaryInterval: 3000,
      ignorePermissionErrors: true,
      atomic: true
    });

    this.watcher
      .on('add', (filePath) => this.queueSync('add', filePath))
      .on('change', (filePath) => this.queueSync('change', filePath))
      .on('unlink', (filePath) => this.queueSync('delete', filePath))
      .on('error', (error) => {
        if (error.code === 'EMFILE') {
          this.sendStatus('Too many files to watch. Consider syncing a smaller folder or adding more ignore patterns.', 'error');
        } else {
          this.sendStatus(`Watcher error: ${error.message}`, 'error');
        }
        console.error('Chokidar error:', error);
      })
      .on('ready', () => {
        this.sendStatus('File watcher ready', 'success');
      });
  }

  queueSync(operation, filePath) {
    // Add to queue
    this.syncQueue.push({ operation, filePath, timestamp: Date.now() });
    this.sendStatus(`Queued: ${path.basename(filePath)} (${this.syncQueue.length} in queue)`, 'info');
    
    // Process queue
    this.processQueue();
  }

  async processQueue() {
    // Check if we should stop processing
    if (!this.syncing) {
      this.syncQueue = [];
      return;
    }
    
    // Check if we can process more
    if (this.activeSyncs >= this.maxConcurrentSyncs || this.syncQueue.length === 0) {
      return;
    }

    // Get next item from queue
    const item = this.syncQueue.shift();
    if (!item) return;

    this.activeSyncs++;
    
    const relativePath = path.relative(this.localPath, item.filePath);
    this.sendStatus(`Processing: ${path.basename(item.filePath)} (${this.activeSyncs} active, ${this.syncQueue.length} queued)`, 'info', null, null, relativePath);

    try {
      switch (item.operation) {
        case 'add':
          await this.handleLocalAdd(item.filePath);
          break;
        case 'change':
          await this.handleLocalChange(item.filePath);
          break;
        case 'delete':
          await this.handleLocalDelete(item.filePath);
          break;
      }
    } catch (error) {
      this.sendStatus(`Error processing ${path.basename(item.filePath)}: ${error.message}`, 'error');
    } finally {
      this.activeSyncs--;
      
      // Clear current file display when done
      if (this.activeSyncs === 0 && this.syncQueue.length === 0) {
        this.sendStatus('', 'info', null, null, null);
      }
      
      // Process next item in queue
      if (this.syncQueue.length > 0 && this.syncing) {
        this.processQueue();
      }
    }
  }

  async handleLocalAdd(filePath) {
    try {
      const relativePath = path.relative(this.localPath, filePath);
      
      // Check if already tracked
      const tracked = await this.fileTracker.getTrackedFile(relativePath);
      if (tracked) {
        // File already exists, treat as change
        await this.handleLocalChange(filePath);
        return;
      }

      this.sendStatus(`Uploading new file: ${relativePath}`);
      
      await this.retryOperation(
        () => this.uploadFileWithPath(filePath, relativePath),
        `Upload ${relativePath}`
      );

      this.sendStatus(`Uploaded: ${relativePath}`, 'success');
    } catch (error) {
      this.sendStatus(`Upload error: ${error.message}`, 'error');
      console.error('Upload error:', error);
    }
  }

  async handleLocalChange(filePath) {
    try {
      const relativePath = path.relative(this.localPath, filePath);
      
      // Check if file actually changed
      const hasChanged = await this.fileTracker.hasChanged(relativePath);
      if (!hasChanged) {
        return; // No actual change
      }

      const tracked = await this.fileTracker.getTrackedFile(relativePath);
      
      if (!tracked) {
        // File not tracked, treat as new
        await this.handleLocalAdd(filePath);
        return;
      }

      this.sendStatus(`Updating file: ${relativePath}`);

      await this.retryOperation(async () => {
        const media = {
          mimeType: 'application/octet-stream',
          body: require('fs').createReadStream(filePath)
        };

        await this.drive.files.update({
          fileId: tracked.driveId,
          media: media
        });
      }, `Update ${relativePath}`);

      // Update tracking
      const fileInfo = await this.fileTracker.getFileInfo(filePath);
      if (fileInfo) {
        this.fileTracker.trackFile(relativePath, tracked.driveId, fileInfo);
        await this.fileTracker.save();
      }

      this.sendStatus(`Updated: ${relativePath}`, 'success');
    } catch (error) {
      this.sendStatus(`Update error: ${error.message}`, 'error');
      console.error('Update error:', error);
    }
  }

  async handleLocalDelete(filePath) {
    try {
      const relativePath = path.relative(this.localPath, filePath);
      const tracked = await this.fileTracker.getTrackedFile(relativePath);
      
      if (!tracked) return;

      this.sendStatus(`Deleting file: ${relativePath}`);

      await this.retryOperation(async () => {
        await this.drive.files.delete({
          fileId: tracked.driveId
        });
      }, `Delete ${relativePath}`);

      this.fileTracker.untrackFile(relativePath);
      await this.fileTracker.save();
      
      this.sendStatus(`Deleted: ${relativePath}`, 'success');
    } catch (error) {
      // If file not found on Drive, just untrack it
      if (error.code === 404) {
        this.fileTracker.untrackFile(relativePath);
        await this.fileTracker.save();
        this.sendStatus(`File already deleted from Drive: ${relativePath}`, 'info');
      } else {
        this.sendStatus(`Delete error: ${error.message}`, 'error');
        console.error('Delete error:', error);
      }
    }
  }

  sendStatus(message, type = 'info', stats = null, progress = null, currentFile = null, conflictInfo = null) {
    if (this.statusCallback) {
      this.statusCallback({ message, type, stats, progress, currentFile, conflictInfo });
    }
  }

  getStatus() {
    return {
      syncing: this.syncing,
      localPath: this.localPath,
      fileCount: this.fileTracker ? Object.keys(this.fileTracker.state.files).length : 0,
      lastSync: this.fileTracker ? this.fileTracker.state.lastSync : null,
      queueLength: this.syncQueue.length,
      activeSyncs: this.activeSyncs,
      maxConcurrent: this.maxConcurrentSyncs
    };
  }

  setMaxConcurrentSyncs(max) {
    this.maxConcurrentSyncs = Math.max(1, Math.min(max, 10)); // Between 1 and 10
    this.sendStatus(`Max concurrent syncs set to ${this.maxConcurrentSyncs}`, 'success');
  }

  setConflictResolution(strategy) {
    const validStrategies = ['keep-both', 'local-wins', 'drive-wins', 'ask'];
    if (validStrategies.includes(strategy)) {
      this.conflictResolution = strategy;
      this.sendStatus(`Conflict resolution set to: ${strategy}`, 'success');
      return { success: true };
    } else {
      return { success: false, error: 'Invalid conflict resolution strategy' };
    }
  }
}

module.exports = SyncManager;
