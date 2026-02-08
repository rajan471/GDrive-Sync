let syncPath = '';
let driveFolderId = null;
let currentConfigId = null;
let dbManager = null;

// Initialize DB
async function initDB() {
  dbManager = new DBManager();
  await dbManager.init();
  console.log('IndexedDB initialized');
  
  // Load saved configs
  await loadSavedConfigs();
}

async function loadSavedConfigs() {
  const configs = await dbManager.getSyncConfigs();
  if (configs.length > 0) {
    addLog(`Found ${configs.length} saved sync configuration(s)`, 'info');
  }
  
  // Load the last used configuration
  const lastConfig = await dbManager.getLastSyncConfig();
  if (lastConfig) {
    addLog('Restoring last sync configuration...', 'info');
    
    // Restore local folder
    if (lastConfig.localPath) {
      syncPath = lastConfig.localPath;
      syncPathInput.value = lastConfig.localPath;
      addLog(`Restored local folder: ${lastConfig.localPath}`, 'success');
    }
    
    // Restore Drive folder
    if (lastConfig.driveFolderId) {
      driveFolderId = lastConfig.driveFolderId;
      
      // Try to find and select it in the dropdown
      for (let i = 0; i < driveFolderSelect.options.length; i++) {
        if (driveFolderSelect.options[i].value === lastConfig.driveFolderId) {
          driveFolderSelect.selectedIndex = i;
          break;
        }
      }
      
      showStatus(driveFolderStatus, `Restored Drive folder: ${lastConfig.driveFolderName}`, 'success');
      addLog(`Restored Drive folder: ${lastConfig.driveFolderName}`, 'success');
    }
    
    // Restore max concurrent setting
    if (lastConfig.maxConcurrent) {
      maxConcurrentSelect.value = lastConfig.maxConcurrent;
    }
    
    // Restore conflict resolution setting
    if (lastConfig.conflictResolution) {
      conflictResolutionSelect.value = lastConfig.conflictResolution;
    }
    
    // Enable start button if both folders are set
    checkCanStartSync();
    
    // Store the config ID for updates
    currentConfigId = lastConfig.id;
  }
}

// DOM Elements
const authBtn = document.getElementById('authBtn');
const authStatus = document.getElementById('authStatus');
const syncSection = document.getElementById('sync-section');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const syncPathInput = document.getElementById('syncPath');
const driveFolderSelect = document.getElementById('driveFolderSelect');
const loadDriveFoldersBtn = document.getElementById('loadDriveFoldersBtn');
const driveFolderNameInput = document.getElementById('driveFolderName');
const createDriveFolderBtn = document.getElementById('createDriveFolderBtn');
const driveFolderStatus = document.getElementById('driveFolderStatus');
const maxConcurrentSelect = document.getElementById('maxConcurrent');
const conflictResolutionSelect = document.getElementById('conflictResolution');
const syncToggleBtn = document.getElementById('syncToggleBtn');
const syncStatusDiv = document.getElementById('syncStatus');
const syncLog = document.getElementById('syncLog');
const autoStartCheckbox = document.getElementById('autoStartCheckbox');
const downloadLogBtn = document.getElementById('downloadLogBtn');

// Set up listeners first
// Listen for auth URL
window.electronAPI.onAuthUrl((url) => {
  console.log('Received auth URL:', url);
  const authUrlBox = document.getElementById('authUrlBox');
  const authUrlLink = document.getElementById('authUrlLink');
  
  authUrlLink.href = url;
  authUrlLink.textContent = url;
  authUrlBox.style.display = 'block';
  
  addLog('Authentication URL generated - click the link if browser did not open', 'info');
});

// Listen for sync status updates
window.electronAPI.onSyncStatus((status) => {
  // Handle conflict dialog
  if (status.type === 'conflict' && status.conflictInfo) {
    showConflictDialog(status.conflictInfo);
    return;
  }
  
  // Map error type to warning for conflicts
  const logType = status.message.includes('Conflict') ? 'warning' : (status.type || 'info');
  addLog(status.message, logType);
  
  if (status.stats) {
    let statusText = `Files: ${status.stats.downloaded || 0} downloaded, ${status.stats.uploaded || 0} uploaded`;
    if (status.stats.conflicts > 0) {
      statusText += `, ${status.stats.conflicts} conflicts resolved`;
    }
    updateSyncStatus(statusText);
    
    // Save sync history to IndexedDB
    if (currentConfigId && status.type === 'success') {
      dbManager.addSyncHistory(currentConfigId, status.stats);
    }
  }
  
  // Update progress bar
  if (status.progress) {
    updateProgress(status.progress);
  }
  
  // Update current file
  if (status.currentFile !== undefined) {
    updateCurrentFile(status.currentFile);
    
    // Save synced file to IndexedDB (only if there's an actual file)
    if (currentConfigId && status.currentFile) {
      dbManager.saveSyncedFile(currentConfigId, {
        relativePath: status.currentFile,
        syncedAt: new Date().toISOString()
      });
    }
  }
});

// Check for existing authentication on load
window.addEventListener('DOMContentLoaded', async () => {
  // Initialize IndexedDB first
  await initDB();
  
  // Load auto-start setting
  const autoStartResult = await window.electronAPI.getAutoStart();
  if (autoStartResult.success) {
    autoStartCheckbox.checked = autoStartResult.enabled;
  }
  
  addLog('Checking for existing authentication...', 'info');
  
  // Try to load token from IndexedDB
  const savedToken = await dbManager.getToken();
  
  if (savedToken) {
    addLog('Found saved token, authenticating...', 'info');
    // Use saved token for authentication
    const result = await window.electronAPI.authenticateWithToken(savedToken);
    
    if (result.success) {
      showStatus(authStatus, 'Authenticated with saved token!', 'success');
      authBtn.style.display = 'none';
      syncSection.style.display = 'block';
      addLog('Authenticated with saved credentials', 'success');
      await loadDriveFolders();
      return;
    } else {
      // Token invalid, remove it
      await dbManager.deleteToken();
      addLog('Saved token expired, please sign in again', 'info');
    }
  }
  
  // Try regular authentication
  const result = await window.electronAPI.authenticate();
  
  if (result.success && result.hadTokens) {
    showStatus(authStatus, 'Already authenticated!', 'success');
    authBtn.style.display = 'none';
    syncSection.style.display = 'block';
    addLog('Authenticated with saved credentials', 'success');
    await loadDriveFolders();
  } else if (result.success && !result.hadTokens) {
    showStatus(authStatus, 'Authentication successful!', 'success');
    authBtn.style.display = 'none';
    syncSection.style.display = 'block';
    addLog('Authentication completed', 'success');
    await loadDriveFolders();
  } else if (!result.success) {
    addLog('No valid authentication found', 'info');
  }
});

// Auto-start checkbox handler
autoStartCheckbox.addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  const result = await window.electronAPI.setAutoStart(enabled);
  
  if (result.success) {
    addLog(`Auto-start ${enabled ? 'enabled' : 'disabled'}`, 'success');
  } else {
    addLog(`Failed to ${enabled ? 'enable' : 'disable'} auto-start: ${result.error}`, 'error');
    // Revert checkbox on error
    autoStartCheckbox.checked = !enabled;
  }
});

// Authentication
authBtn.addEventListener('click', async () => {
  authBtn.disabled = true;
  authBtn.textContent = 'Authenticating...';
  showStatus(authStatus, 'Opening browser for authentication...', 'info');
  
  const result = await window.electronAPI.authenticate();
  
  if (result.success) {
    const message = result.hadTokens 
      ? 'Already authenticated!' 
      : 'Authentication successful!';
    showStatus(authStatus, message, 'success');
    document.getElementById('authUrlBox').style.display = 'none';
    authBtn.style.display = 'none';
    syncSection.style.display = 'block';
    
    // Save token to IndexedDB
    if (result.tokens) {
      await dbManager.saveToken(result.tokens);
      addLog('Token saved to IndexedDB', 'success');
    }
    
    // Load Drive folders
    await loadDriveFolders();
  } else {
    showStatus(authStatus, `Authentication failed: ${result.error}`, 'error');
  }
  
  authBtn.disabled = false;
  authBtn.textContent = 'Sign in with Google';
});

// Load Drive Folders
async function loadDriveFolders() {
  loadDriveFoldersBtn.disabled = true;
  loadDriveFoldersBtn.textContent = 'Loading...';
  addLog('Loading Drive folders...', 'info');
  
  const result = await window.electronAPI.listDriveFolders();
  
  if (result.success) {
    // Clear existing options except the first one
    driveFolderSelect.innerHTML = '<option value="">-- Select existing or create new --</option>';
    
    if (result.folders.length === 0) {
      addLog('No folders found in Drive', 'info');
    } else {
      result.folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        // Show full path in dropdown
        option.textContent = folder.path || folder.name;
        // Store name as data attribute for later use
        option.setAttribute('data-name', folder.name);
        option.setAttribute('data-path', folder.path || folder.name);
        driveFolderSelect.appendChild(option);
      });
      addLog(`Loaded ${result.folders.length} folders from Drive`, 'success');
      
      // Restore previously selected folder if available
      const lastConfig = await dbManager.getLastSyncConfig();
      if (lastConfig && lastConfig.driveFolderId) {
        for (let i = 0; i < driveFolderSelect.options.length; i++) {
          if (driveFolderSelect.options[i].value === lastConfig.driveFolderId) {
            driveFolderSelect.selectedIndex = i;
            driveFolderId = lastConfig.driveFolderId;
            const folderPath = driveFolderSelect.options[i].getAttribute('data-path') || lastConfig.driveFolderName;
            showStatus(driveFolderStatus, `Restored: ${folderPath}`, 'success');
            checkCanStartSync();
            break;
          }
        }
      }
    }
  } else {
    addLog(`Failed to load folders: ${result.error}`, 'error');
  }
  
  loadDriveFoldersBtn.disabled = false;
  loadDriveFoldersBtn.textContent = 'Refresh';
}

loadDriveFoldersBtn.addEventListener('click', loadDriveFolders);

// Select existing Drive folder
driveFolderSelect.addEventListener('change', (e) => {
  const selectedId = e.target.value;
  const selectedOption = e.target.options[e.target.selectedIndex];
  const selectedPath = selectedOption.getAttribute('data-path') || selectedOption.text;
  
  if (selectedId) {
    driveFolderId = selectedId;
    showStatus(driveFolderStatus, `Selected folder: ${selectedPath}`, 'success');
    checkCanStartSync();
    addLog(`Selected Drive folder: ${selectedPath}`, 'success');
  }
});

// Folder Selection
selectFolderBtn.addEventListener('click', async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    syncPath = folder;
    syncPathInput.value = folder;
    checkCanStartSync();
  }
});

// Drive Folder Setup
createDriveFolderBtn.addEventListener('click', async () => {
  const folderName = driveFolderNameInput.value.trim();
  
  if (!folderName) {
    showStatus(driveFolderStatus, 'Please enter a folder name', 'error');
    return;
  }
  
  createDriveFolderBtn.disabled = true;
  createDriveFolderBtn.textContent = 'Creating...';
  
  const result = await window.electronAPI.setDriveFolder(folderName);
  
  if (result.success) {
    driveFolderId = result.folderId;
    const message = result.created 
      ? `Created folder path: ${result.path || folderName}` 
      : `Using existing folder: ${folderName}`;
    showStatus(driveFolderStatus, message, 'success');
    checkCanStartSync();
    // Refresh the dropdown
    await loadDriveFolders();
    // Select the newly created folder
    driveFolderSelect.value = result.folderId;
    addLog(message, 'success');
  } else {
    showStatus(driveFolderStatus, `Error: ${result.error}`, 'error');
  }
  
  createDriveFolderBtn.disabled = false;
  createDriveFolderBtn.textContent = 'Create';
});

function checkCanStartSync() {
  syncToggleBtn.disabled = !(syncPath && driveFolderId);
}

// Toggle Sync (Start/Stop)
let isSyncing = false;

syncToggleBtn.addEventListener('click', async () => {
  if (isSyncing) {
    // Stop sync
    syncToggleBtn.disabled = true;
    syncToggleBtn.textContent = 'Stopping...';
    
    await window.electronAPI.stopSync();
    
    isSyncing = false;
    syncToggleBtn.disabled = false;
    syncToggleBtn.textContent = 'Start Sync';
    syncToggleBtn.className = 'btn btn-success';
    maxConcurrentSelect.disabled = false;
    conflictResolutionSelect.disabled = false;
    selectFolderBtn.disabled = false;
    driveFolderSelect.disabled = false;
    createDriveFolderBtn.disabled = false;
    loadDriveFoldersBtn.disabled = false;
    updateSyncStatus('Sync stopped');
    addLog('Sync stopped', 'success');
  } else {
    // Start sync
    // Validate inputs
    if (!syncPath) {
      addLog('Please select a folder first', 'error');
      showStatus(driveFolderStatus, 'Please select a local folder', 'error');
      return;
    }
    
    if (!driveFolderId) {
      addLog('Please select or create a Drive folder first', 'error');
      showStatus(driveFolderStatus, 'Please select or create a Drive folder', 'error');
      return;
    }
    
    syncToggleBtn.disabled = true;
    syncToggleBtn.textContent = 'Starting...';
    
    try {
      // Set max concurrent uploads
      const maxConcurrent = parseInt(maxConcurrentSelect.value);
      const maxConcurrentResult = await window.electronAPI.setMaxConcurrent(maxConcurrent);
      
      if (!maxConcurrentResult.success) {
        throw new Error(`Failed to set max concurrent: ${maxConcurrentResult.error}`);
      }
      
      addLog(`Max concurrent uploads set to ${maxConcurrent}`, 'info');
      
      // Set conflict resolution strategy
      const conflictResolution = conflictResolutionSelect.value;
      const conflictResult = await window.electronAPI.setConflictResolution(conflictResolution);
      
      if (!conflictResult.success) {
        throw new Error(`Failed to set conflict resolution: ${conflictResult.error}`);
      }
      
      addLog(`Conflict resolution set to: ${conflictResolution}`, 'info');
      
      // Save/update sync configuration to IndexedDB
      const config = {
        id: currentConfigId, // Include ID if updating existing config
        localPath: syncPath,
        driveFolderId: driveFolderId,
        driveFolderName: driveFolderSelect.options[driveFolderSelect.selectedIndex]?.getAttribute('data-path') || 
                         driveFolderSelect.options[driveFolderSelect.selectedIndex]?.text || 
                         driveFolderNameInput.value || 
                         'Unknown',
        maxConcurrent: maxConcurrent,
        conflictResolution: conflictResolution,
        createdAt: currentConfigId ? undefined : new Date().toISOString() // Only set on new configs
      };
      
      currentConfigId = await dbManager.saveSyncConfig(config);
      addLog('Sync configuration saved', 'success');
      addLog(`Syncing to Drive folder: ${config.driveFolderName} (ID: ${driveFolderId})`, 'info');
      
      const result = await window.electronAPI.startSync(config);
      
      if (result.success) {
        isSyncing = true;
        syncToggleBtn.disabled = false;
        syncToggleBtn.textContent = 'Stop Sync';
        syncToggleBtn.className = 'btn btn-danger';
        maxConcurrentSelect.disabled = true;
        conflictResolutionSelect.disabled = true;
        selectFolderBtn.disabled = true;
        driveFolderSelect.disabled = true;
        createDriveFolderBtn.disabled = true;
        loadDriveFoldersBtn.disabled = true;
        updateSyncStatus('Syncing...');
        addLog('Sync started successfully', 'success');
      } else {
        throw new Error(result.error || 'Unknown error starting sync');
      }
    } catch (error) {
      console.error('Start sync error:', error);
      addLog(`Error starting sync: ${error.message}`, 'error');
      showStatus(driveFolderStatus, `Error: ${error.message}`, 'error');
      syncToggleBtn.disabled = false;
      syncToggleBtn.textContent = 'Start Sync';
      syncToggleBtn.className = 'btn btn-success';
    }
  }
});

// Download Log
downloadLogBtn.addEventListener('click', () => {
  try {
    // Get all log entries
    const logEntries = Array.from(syncLog.children).map(entry => entry.textContent);
    
    if (logEntries.length === 0) {
      addLog('No log entries to download', 'info');
      return;
    }
    
    // Create log content
    const logContent = [
      '='.repeat(80),
      'Google Drive Sync - Log Export',
      `Generated: ${new Date().toISOString()}`,
      `Total Entries: ${logEntries.length}`,
      '='.repeat(80),
      '',
      ...logEntries,
      '',
      '='.repeat(80),
      'End of Log',
      '='.repeat(80)
    ].join('\n');
    
    // Create blob and download
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gdrive-sync-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog('Log downloaded successfully', 'success');
  } catch (error) {
    console.error('Download log error:', error);
    addLog(`Failed to download log: ${error.message}`, 'error');
  }
});

// Helper Functions
function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;
  element.style.display = 'block';
}

function updateSyncStatus(message) {
  syncStatusDiv.innerHTML = `<p>${message}</p>`;
}

function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  syncLog.appendChild(entry);
  syncLog.scrollTop = syncLog.scrollHeight;
  
  // Keep only last 100 entries
  while (syncLog.children.length > 100) {
    syncLog.removeChild(syncLog.firstChild);
  }
}

function updateProgress(progress) {
  const progressSection = document.getElementById('progressSection');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressCount = document.getElementById('progressCount');
  
  if (progress.total > 0) {
    progressSection.style.display = 'block';
    const percentage = Math.round((progress.current / progress.total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = progress.message || 'Syncing files...';
    progressCount.textContent = `${progress.current} / ${progress.total}`;
  } else {
    progressSection.style.display = 'none';
  }
}

function updateCurrentFile(fileName) {
  const currentFileSection = document.getElementById('currentFileSection');
  const currentFileName = document.getElementById('currentFileName');
  
  if (fileName && fileName.trim()) {
    currentFileSection.style.display = 'block';
    currentFileName.textContent = fileName;
  } else {
    currentFileSection.style.display = 'none';
    currentFileName.textContent = '';
  }
}

// Conflict Dialog Functions
function showConflictDialog(conflictInfo) {
  const dialog = document.getElementById('conflictDialog');
  const fileName = document.getElementById('conflictFileName');
  const localTime = document.getElementById('conflictLocalTime');
  const driveTime = document.getElementById('conflictDriveTime');
  const localSize = document.getElementById('conflictLocalSize');
  const driveSize = document.getElementById('conflictDriveSize');
  
  // Populate dialog
  fileName.textContent = conflictInfo.fileName;
  localTime.textContent = new Date(conflictInfo.localModified).toLocaleString();
  driveTime.textContent = new Date(conflictInfo.driveModified).toLocaleString();
  localSize.textContent = formatFileSize(conflictInfo.localSize);
  driveSize.textContent = formatFileSize(conflictInfo.driveSize);
  
  // Show dialog
  dialog.style.display = 'flex';
  
  addLog(`⚠️ Conflict: ${conflictInfo.fileName} - Waiting for your decision`, 'warning');
}

function hideConflictDialog() {
  const dialog = document.getElementById('conflictDialog');
  dialog.style.display = 'none';
}

async function resolveConflict(decision) {
  hideConflictDialog();
  
  const decisionText = {
    'local': 'Keep Local',
    'drive': 'Keep Drive',
    'both': 'Keep Both',
    'skip': 'Skip'
  }[decision] || decision;
  
  addLog(`User chose: ${decisionText}`, 'info');
  
  await window.electronAPI.resolveConflict(decision);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Conflict dialog button handlers
document.getElementById('conflictBtnLocal').addEventListener('click', () => resolveConflict('local'));
document.getElementById('conflictBtnDrive').addEventListener('click', () => resolveConflict('drive'));
document.getElementById('conflictBtnBoth').addEventListener('click', () => resolveConflict('both'));
document.getElementById('conflictBtnSkip').addEventListener('click', () => resolveConflict('skip'));
