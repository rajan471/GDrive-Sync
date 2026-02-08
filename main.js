const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const SyncManager = require('./src/syncManager');
const AuthServer = require('./src/authServer');
const { getLogger } = require('./src/logger');

const logger = getLogger();

let mainWindow;
let syncManager;
let authServer;

// Memory management: Increase Node.js memory limit for large syncs
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096'); // 4GB limit

// Log app start
logger.info('Application starting', { 
  version: app.getVersion(), 
  platform: process.platform,
  arch: process.arch,
  memoryLimit: '4GB'
});

// Memory monitoring
let memoryCheckInterval;

function startMemoryMonitoring() {
  memoryCheckInterval = setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    // Log if memory usage is high
    if (heapUsedMB > 1024) { // Over 1GB
      logger.warn('High memory usage detected', { 
        heapUsedMB, 
        heapTotalMB, 
        rssMB 
      });
    }
    
    // Force garbage collection if available and memory is high
    if (global.gc && heapUsedMB > 2048) { // Over 2GB
      logger.info('Forcing garbage collection');
      global.gc();
    }
  }, 30000); // Check every 30 seconds
}

function stopMemoryMonitoring() {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: String(reason), promise: String(promise) });
  console.error('Unhandled rejection:', reason);
});

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'GDrive Sync',
  path: app.getPath('exe')
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(__dirname, 'AppLogo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  startMemoryMonitoring();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMemoryMonitoring();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopMemoryMonitoring();
});

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('authenticate', async () => {
  try {
    logger.info('Authentication requested');
    
    if (!authServer) {
      authServer = new AuthServer();
    }
    
    const result = await authServer.getAuthUrl();
    
    // If we have existing tokens, use them
    if (result.hasTokens) {
      try {
        syncManager = new SyncManager(result.tokens);
        await syncManager.authenticate();
        logger.info('Authenticated with existing tokens');
        return { success: true, hadTokens: true, tokens: result.tokens };
      } catch (error) {
        // Token authentication failed, remove invalid token
        logger.error('Token authentication failed', { error: error.message });
        await authServer.removeTokens();
        // Retry authentication with browser
        return await ipcMain.emit('authenticate-retry');
      }
    }
    
    const authUrl = result.authUrl;
    logger.debug('Opening browser with auth URL');
    
    // Send URL to renderer to display
    mainWindow.webContents.send('auth-url', authUrl);
    
    // Try to open browser
    try {
      await shell.openExternal(authUrl);
    } catch (err) {
      logger.error('Failed to open browser', { error: err.message });
    }
    
    // Wait for OAuth callback
    const authResult = await authServer.waitForAuth();
    
    if (authResult.error) {
      logger.error('Authentication failed', { error: authResult.error });
      throw new Error(authResult.error);
    }
    
    // Initialize sync manager with tokens
    syncManager = new SyncManager(authResult.tokens);
    await syncManager.authenticate();
    
    logger.info('Authentication successful');
    return { success: true, hadTokens: false, tokens: authResult.tokens };
  } catch (error) {
    logger.error('Authentication error', { error: error.message, stack: error.stack });
    // Clean up invalid tokens
    if (authServer) {
      await authServer.removeTokens();
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('authenticate-with-token', async (event, tokens) => {
  try {
    syncManager = new SyncManager(tokens);
    await syncManager.authenticate();
    return { success: true };
  } catch (error) {
    console.error('Token authentication failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-sync', async (event, config) => {
  try {
    logger.info('Starting sync', { localPath: config.localPath, driveFolderId: config.driveFolderId });
    
    if (!syncManager) {
      throw new Error('Not authenticated');
    }
    
    // Set the drive folder ID before starting sync
    if (config.driveFolderId) {
      syncManager.driveFolderId = config.driveFolderId;
    }
    
    await syncManager.startSync(config.localPath, (status) => {
      mainWindow.webContents.send('sync-status', status);
    });
    
    logger.info('Sync started successfully');
    return { success: true };
  } catch (error) {
    logger.error('Failed to start sync', { error: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-max-concurrent', async (event, max) => {
  try {
    if (!syncManager) {
      throw new Error('Not authenticated');
    }
    syncManager.setMaxConcurrentSyncs(max);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-conflict-resolution', async (event, strategy) => {
  try {
    if (!syncManager) {
      throw new Error('Not authenticated');
    }
    return syncManager.setConflictResolution(strategy);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resolve-conflict', async (event, decision) => {
  try {
    if (!syncManager || !syncManager.conflictResolveCallback) {
      throw new Error('No pending conflict');
    }
    // Call the stored callback with user's decision
    syncManager.conflictResolveCallback(decision);
    syncManager.conflictResolveCallback = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-drive-folder', async (event, folderName) => {
  try {
    if (!syncManager) {
      throw new Error('Not authenticated');
    }
    return await syncManager.setDriveFolder(folderName);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-drive-folders', async () => {
  try {
    if (!syncManager) {
      throw new Error('Not authenticated');
    }
    return await syncManager.listDriveFolders();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-sync', async () => {
  if (syncManager) {
    syncManager.stopSync();
  }
  return { success: true };
});

ipcMain.handle('get-sync-status', async () => {
  if (!syncManager) {
    return { syncing: false };
  }
  return syncManager.getStatus();
});

// Auto-start handlers
ipcMain.handle('get-auto-start', async () => {
  try {
    const isEnabled = await autoLauncher.isEnabled();
    return { success: true, enabled: isEnabled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-auto-start', async (event, enabled) => {
  try {
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
