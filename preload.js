const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  authenticate: () => ipcRenderer.invoke('authenticate'),
  authenticateWithToken: (tokens) => ipcRenderer.invoke('authenticate-with-token', tokens),
  setDriveFolder: (folderName) => ipcRenderer.invoke('set-drive-folder', folderName),
  listDriveFolders: () => ipcRenderer.invoke('list-drive-folders'),
  startSync: (config) => ipcRenderer.invoke('start-sync', config),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  setMaxConcurrent: (max) => ipcRenderer.invoke('set-max-concurrent', max),
  setConflictResolution: (strategy) => ipcRenderer.invoke('set-conflict-resolution', strategy),
  resolveConflict: (decision) => ipcRenderer.invoke('resolve-conflict', decision),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  onSyncStatus: (callback) => ipcRenderer.on('sync-status', (event, status) => callback(status)),
  onAuthUrl: (callback) => ipcRenderer.on('auth-url', (event, url) => callback(url))
});
