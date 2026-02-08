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
const driveFolderDropdownBtn = document.getElementById('driveFolderDropdownBtn');
const driveFolderDropdownMenu = document.getElementById('driveFolderDropdownMenu');
const driveFolderChevron = document.getElementById('driveFolderChevron');
const driveFolderSelectedText = document.getElementById('driveFolderSelectedText');
const driveFolderOptions = document.getElementById('driveFolderOptions');
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

// Custom Dropdown Toggle
if (driveFolderDropdownBtn) {
  driveFolderDropdownBtn.addEventListener('click', () => {
    const isHidden = driveFolderDropdownMenu.classList.contains('hidden');
    if (isHidden) {
      driveFolderDropdownMenu.classList.remove('hidden');
      driveFolderChevron.style.transform = 'rotate(180deg)';
    } else {
      driveFolderDropdownMenu.classList.add('hidden');
      driveFolderChevron.style.transform = 'rotate(0deg)';
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!driveFolderDropdownBtn.contains(e.target) && !driveFolderDropdownMenu.contains(e.target)) {
      driveFolderDropdownMenu.classList.add('hidden');
      driveFolderChevron.style.transform = 'rotate(0deg)';
    }
  });
}

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
    addLog('Authenticated with saved credentials', 'success');
    await loadDriveFolders();
  } else if (result.success && !result.hadTokens) {
    showStatus(authStatus, 'Authentication successful!', 'success');
    authBtn.style.display = 'none';
    addLog('Authentication completed', 'success');
    await loadDriveFolders();
  } else if (!result.success) {
    addLog('No valid authentication found', 'info');
  }
});

// Auto-start checkbox handler
autoStartCheckbox.addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  const statusSpan = document.getElementById('autoStartStatus');
  const result = await window.electronAPI.setAutoStart(enabled);
  
  if (result.success) {
    addLog(`Auto-start ${enabled ? 'enabled' : 'disabled'}`, 'success');
    statusSpan.textContent = enabled ? 'On' : 'Off';
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
    // Clear existing options
    driveFolderSelect.innerHTML = '<option value="">-- Select existing or create new --</option>';
    driveFolderOptions.innerHTML = '';
    
    if (result.folders.length === 0) {
      addLog('No folders found in Drive', 'info');
      driveFolderOptions.innerHTML = '<div class="px-4 py-2 text-sm text-gray-500">No folders found</div>';
    } else {
      result.folders.forEach(folder => {
        // Add to hidden select for compatibility
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.path || folder.name;
        option.setAttribute('data-name', folder.name);
        option.setAttribute('data-path', folder.path || folder.name);
        driveFolderSelect.appendChild(option);
        
        // Add to custom dropdown
        const dropdownOption = document.createElement('div');
        dropdownOption.className = 'px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex items-center gap-2';
        dropdownOption.innerHTML = `
          <svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
          </svg>
          <span class="truncate">${folder.path || folder.name}</span>
        `;
        dropdownOption.addEventListener('click', () => {
          driveFolderId = folder.id;
          driveFolderSelectedText.textContent = folder.path || folder.name;
          driveFolderSelect.value = folder.id;
          driveFolderDropdownMenu.classList.add('hidden');
          driveFolderChevron.style.transform = 'rotate(0deg)';
          showStatus(driveFolderStatus, `Selected folder: ${folder.path || folder.name}`, 'success');
          checkCanStartSync();
          addLog(`Selected Drive folder: ${folder.path || folder.name}`, 'success');
        });
        driveFolderOptions.appendChild(dropdownOption);
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
            driveFolderSelectedText.textContent = folderPath;
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
  loadDriveFoldersBtn.textContent = '↻ Refresh';
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
    syncToggleBtn.className = 'bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
    maxConcurrentSelect.disabled = false;
    conflictResolutionSelect.disabled = false;
    selectFolderBtn.disabled = false;
    driveFolderSelect.disabled = false;
    createDriveFolderBtn.disabled = false;
    loadDriveFoldersBtn.disabled = false;
    updateSyncStatus(false);
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
        syncToggleBtn.className = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
        maxConcurrentSelect.disabled = true;
        conflictResolutionSelect.disabled = true;
        selectFolderBtn.disabled = true;
        driveFolderSelect.disabled = true;
        createDriveFolderBtn.disabled = true;
        loadDriveFoldersBtn.disabled = true;
        updateSyncStatus(true);
        
        // Show progress section
        const progressSection = document.getElementById('progressSection');
        if (progressSection) {
          progressSection.style.display = 'block';
        }
        
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
      syncToggleBtn.className = 'bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
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
  const colors = {
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
  };
  
  element.textContent = message;
  element.className = `mt-3 p-3 rounded-lg text-sm ${colors[type] || colors.info}`;
  element.style.display = 'block';
}

function updateSyncStatus(isSyncing) {
  const badge = document.getElementById('syncStatusBadge');
  const currentlySyncingSection = document.getElementById('currentlySyncingSection');
  
  if (isSyncing) {
    badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-semibold border border-green-200 dark:border-green-800/50';
    badge.innerHTML = `
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
      </span>
      Live Syncing
    `;
    if (currentlySyncingSection) {
      currentlySyncingSection.style.display = 'block';
    }
  } else {
    badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded-full text-sm font-semibold';
    badge.innerHTML = `
      <span class="relative flex h-2.5 w-2.5">
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-400"></span>
      </span>
      Idle
    `;
    // Keep section visible, just mark all files as completed
    if (currentlySyncingSection && currentlySyncingFiles.size > 0) {
      currentlySyncingSection.style.display = 'block';
    }
  }
}

function addLog(message, type = 'info') {
  const syncLog = document.getElementById('syncLog');
  const entry = document.createElement('div');
  const colors = {
    info: 'text-gray-600 dark:text-gray-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400'
  };
  
  entry.className = `py-1 ${colors[type] || colors.info}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  syncLog.appendChild(entry);
  
  // Keep only last 100 entries
  while (syncLog.children.length > 100) {
    syncLog.removeChild(syncLog.firstChild);
  }
  
  // Also log to console for debugging
  console.log(`[${type.toUpperCase()}] ${message}`);
}

function updateProgress(progress) {
  const progressSection = document.getElementById('progressSection');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressPercentage = document.getElementById('progressPercentage');
  
  if (progress.total > 0) {
    progressSection.style.display = 'block';
    const percentage = Math.round((progress.current / progress.total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressPercentage.textContent = `${percentage}%`;
    progressText.innerHTML = `
      <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      <span>Syncing (${percentage}%) - ${progress.current} of ${progress.total} files</span>
    `;
  } else {
    progressSection.style.display = 'none';
  }
}

// Track currently syncing files
let currentlySyncingFiles = new Map();
const MAX_DISPLAYED_FILES = 10; // Show last 10 files

function updateCurrentFile(fileName) {
  const currentlySyncingSection = document.getElementById('currentlySyncingSection');
  const currentFilesList = document.getElementById('currentFilesList');
  
  if (fileName && fileName.trim()) {
    // Always show the section once syncing starts
    currentlySyncingSection.style.display = 'block';
    
    // Mark previous files as completed
    currentlySyncingFiles.forEach((fileInfo, name) => {
      if (fileInfo.status === 'uploading') {
        fileInfo.status = 'completed';
      }
    });
    
    // Add new file as uploading
    currentlySyncingFiles.set(fileName, { status: 'uploading', size: 0, completedAt: null });
    
    // Keep only last MAX_DISPLAYED_FILES
    if (currentlySyncingFiles.size > MAX_DISPLAYED_FILES) {
      const firstKey = currentlySyncingFiles.keys().next().value;
      currentlySyncingFiles.delete(firstKey);
    }
    
    renderCurrentFilesList();
  } else if (fileName === null || fileName === '') {
    // Mark all as completed when sync finishes
    currentlySyncingFiles.forEach((fileInfo) => {
      if (fileInfo.status === 'uploading') {
        fileInfo.status = 'completed';
        fileInfo.completedAt = Date.now();
      }
    });
    renderCurrentFilesList();
  }
}

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const iconMap = {
    // Documents
    'pdf': { icon: '📄', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
    'doc': { icon: '📘', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    'docx': { icon: '📘', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    'txt': { icon: '📝', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
    'rtf': { icon: '📝', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
    
    // Spreadsheets
    'xls': { icon: '📊', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
    'xlsx': { icon: '📊', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
    'csv': { icon: '📊', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
    
    // Presentations
    'ppt': { icon: '📽️', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
    'pptx': { icon: '📽️', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
    
    // Images
    'jpg': { icon: '🖼️', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    'jpeg': { icon: '🖼️', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    'png': { icon: '🖼️', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    'gif': { icon: '🖼️', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    'svg': { icon: '🖼️', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    
    // Videos
    'mp4': { icon: '🎬', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400' },
    'avi': { icon: '🎬', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400' },
    'mov': { icon: '🎬', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400' },
    
    // Audio
    'mp3': { icon: '🎵', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
    'wav': { icon: '🎵', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
    
    // Archives
    'zip': { icon: '📦', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' },
    'rar': { icon: '📦', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' },
    '7z': { icon: '📦', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' },
    
    // Code
    'js': { icon: '💻', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' },
    'py': { icon: '💻', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    'java': { icon: '💻', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
    'html': { icon: '💻', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
    'css': { icon: '💻', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    'json': { icon: '💻', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
  };
  
  return iconMap[ext] || { icon: '📄', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' };
}

function renderCurrentFilesList() {
  const currentFilesList = document.getElementById('currentFilesList');
  
  if (currentlySyncingFiles.size === 0) {
    currentFilesList.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No files synced yet</div>';
    return;
  }
  
  const filesHTML = Array.from(currentlySyncingFiles.entries()).map(([fileName, fileInfo], index) => {
    const fileIcon = getFileIcon(fileName);
    const isUploading = fileInfo.status === 'uploading';
    const isCompleted = fileInfo.status === 'completed';
    
    // Different styling for uploading vs completed
    const cardOpacity = isCompleted ? 'opacity-50' : 'opacity-100';
    const statusIcon = isUploading 
      ? '<svg class="w-5 h-5 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>'
      : '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
    
    const statusText = isUploading ? 'Uploading...' : 'Completed';
    const statusColor = isUploading ? 'text-gray-600 dark:text-gray-400' : 'text-green-600 dark:text-green-400';
    
    return `
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between hover:shadow-md transition-all ${cardOpacity}">
        <div class="flex items-center gap-4 flex-1 min-w-0">
          <div class="w-12 h-12 rounded-lg ${fileIcon.color} flex items-center justify-center flex-shrink-0 text-2xl">
            ${fileIcon.icon}
          </div>
          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-semibold text-gray-900 dark:text-white truncate">${fileName}</span>
            <span class="text-sm ${statusColor}">${fileInfo.size ? formatFileSize(fileInfo.size) + ' • ' : ''}${statusText}</span>
          </div>
        </div>
        <div class="flex-shrink-0 ml-4">
          ${statusIcon}
        </div>
      </div>
    `;
  }).join('');
  
  currentFilesList.innerHTML = filesHTML;
}

// Conflict Dialog Functions
function showConflictDialog(conflictInfo) {
  const dialog = document.getElementById('conflictDialog');
  const fileNameLocal = document.getElementById('conflictFileNameLocal');
  const fileNameDrive = document.getElementById('conflictFileNameDrive');
  const localTime = document.getElementById('conflictLocalTime');
  const driveTime = document.getElementById('conflictDriveTime');
  const localSize = document.getElementById('conflictLocalSize');
  const driveSize = document.getElementById('conflictDriveSize');
  
  // Populate dialog
  fileNameLocal.textContent = conflictInfo.fileName;
  fileNameDrive.textContent = conflictInfo.fileName;
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
