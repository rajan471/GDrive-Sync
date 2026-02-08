# Google Drive Sync Desktop App

An Electron desktop application for syncing Google Drive files with your local filesystem.

## Features

- ✅ Two-way sync between Google Drive and local folder
- ✅ Real-time file watching for local changes
- ✅ **Real-time Drive monitoring** (checks every 30 seconds)
- ✅ **Automatic token refresh** (no re-authentication needed)
- ✅ **Resumable uploads for large files** (>5MB with progress)
- ✅ Automatic conflict resolution (keeps both versions)
- ✅ Nested folder structure preservation
- ✅ Progress tracking with UI feedback
- ✅ Queue-based upload system (configurable concurrency)
- ✅ **Retry logic with exponential backoff**
- ✅ **File-based logging system**
- ✅ Auto-start on system startup
- ✅ Persistent configuration (remembers settings)
- ✅ IndexedDB storage for tokens and sync history
- ✅ Clean, modern UI
- ✅ Cross-platform support (Windows, macOS, Linux)

## Installation & Building

### Development

```bash
npm install
npm start
```

### Building Installers

The app uses `electron-builder` to create installers with automatic desktop shortcuts.

**Windows:**

```bash
npm run build:win
```

Creates NSIS installer with desktop and Start Menu shortcuts.

**macOS:**

```bash
npm run build:mac
```

Creates DMG installer.

**Linux:**

```bash
npm run build:linux
```

Creates AppImage and DEB packages. DEB package automatically creates desktop shortcuts.

**All Platforms:**

```bash
npm run build
```


### Installer Features

- ✅ Automatic desktop shortcut creation (Windows, Linux DEB)
- ✅ Start Menu shortcut (Windows)
- ✅ Application menu entry (Linux)
- ✅ Custom app icon (`AppLogo.png`)
- ✅ Uninstaller included
- ✅ Choose installation directory (Windows)

## Setup

Quick steps:

1. Create a Google Cloud project
2. Enable Google Drive API
3. Create OAuth 2.0 credentials (Web application type)
4. Add redirect URI: `http://127.0.0.1:9001/oauth2callback` (use 127.0.0.1, not localhost)
5. Create `config.json` with your credentials:
   ```json
   {
     "google": {
       "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
       "clientSecret": "YOUR_CLIENT_SECRET"
     }
   }
   ```
6. Run the app:
   ```bash
   npm start
   ```

## Usage

1. **Authenticate**: Click "Sign in with Google" - your browser will open for OAuth authentication
2. **Select Local Folder**: Choose a local folder to sync
3. **Select/Create Drive Folder**:
   - Choose existing folder from dropdown, OR
   - Type new folder name (supports nested paths like `Folder/SubFolder`)
4. **Configure Settings**:
   - Set max concurrent uploads (1-10, default: 3)
   - Enable "Launch app on system startup" if desired
5. **Start Sync**: Click "Start Sync" to begin syncing

The authentication token and configuration are saved, so you won't need to sign in again unless you revoke access.

### Real-Time Sync

Once sync is started:

- **File watcher monitors local changes** continuously
- **Drive monitoring checks for remote changes** every 30 seconds
- **New files added** → Automatically queued and uploaded
- **Files modified** → Automatically detected and synced (both directions)
- **Files deleted** → Automatically removed from Drive/local
- **Large files (>5MB)** → Resumable upload with progress tracking
- **Queue system** → Shows "X in queue, Y active" in status
- **Token auto-refresh** → No re-authentication needed

Changes made during sync are detected and added to the queue automatically!

## Sync Behavior

### Two-Way Sync

- Files only in Drive → Downloaded to local
- Files only locally → Uploaded to Drive
- Files in both locations → Syncs the newer version
- Both changed since last sync → **Conflict!** (keeps both versions)

### Conflict Resolution

When the same file is modified in both locations, you can choose how to handle it:

**1. Keep Both Files (Recommended - Default)**
- Renames local file → `filename_conflict_TIMESTAMP.ext`
- Downloads Drive version → `filename.ext`
- Uploads conflict version to Drive
- Both versions are preserved!

**2. Local Overwrites Drive**
- Keeps your local version
- Uploads local file to Drive (overwrites Drive version)
- Use when local changes are more important

**3. Drive Overwrites Local**
- Keeps the Drive version
- Downloads Drive file (overwrites local version)
- Use when Drive changes are more important

**4. Ask Me Each Time** ✅ NEW!
- Pauses sync when conflict detected
- Shows dialog with file details
- Let you choose resolution per conflict
- Options: Keep Local, Keep Drive, Keep Both, or Skip

**Configure in UI:** Settings → Conflict Resolution dropdown

See [SYNC_BEHAVIOR.md](SYNC_BEHAVIOR.md) for detailed documentation.


## Project Structure

```
├── main.js              # Main Electron process
├── preload.js           # Preload script for IPC
├── index.html           # UI layout
├── styles.css           # Styling
├── renderer.js          # Renderer process logic
├── AppLogo.png          # App icon/logo
├── config.json          # Google OAuth credentials (create this)
└── src/
    ├── authServer.js    # OAuth server
    ├── syncManager.js   # Core sync logic
    ├── fileTracker.js   # File version tracking
    └── dbManager.js     # IndexedDB management
```

## Configuration

### Max Concurrent Uploads

Control how many files upload simultaneously (default: 3):

- **1** - Slowest but most stable (for slow connections)
- **3** - Recommended default (good balance)
- **5** - Faster (if you have good bandwidth)
- **10** - Fastest (may cause issues with many files)

Adjustable in the UI during sync.

### Ignored Patterns

The following are automatically excluded from sync:

- `node_modules/`, `dist/`, `build/`, `out/`, `target/`
- `.git/`, `.vscode/`, `.idea/`, `.cache/`
- `__pycache__/`, `*.pyc`, `venv/`, `env/`
- `.next/`, `coverage/`
- Hidden files (starting with `.`)
- Log files (`*.log`)
- Temporary files (`tmp/`, `temp/`)

### File Watching

- **Polling mode** enabled to avoid "too many open files" errors
- **Poll interval**: 1 second for regular files, 3 seconds for binary files
- **Max depth**: 5 levels of nested folders
- **Stabilization**: Waits 2 seconds after file changes before syncing

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

### Download Sync Log

Click the "📥 Download Sync Log" button in the UI to save the current sync log to a text file. This is useful for:
- Troubleshooting sync issues
- Sharing logs with support
- Keeping records of sync operations
- Debugging conflicts

The log includes all sync operations with timestamps, error messages, and configuration changes.

## Performance Tips

1. **Sync specific folders** - Don't sync entire project directories with dependencies
2. **Use .syncignore patterns** - Add custom ignore patterns
3. **Limit depth** - The app limits recursion to 5 levels deep
4. **Monitor file count** - Keep synced files under 10,000 for best performance
5. **Adjust concurrency** - Lower concurrent uploads if experiencing issues

## Data Storage

- **Tokens**: Stored in IndexedDB (browser storage) in renderer process
- **Sync State**: `.gdrive-sync-state.json` in local folder (tracks file versions)
- **Configuration**: IndexedDB (remembers last used local folder, Drive folder, settings)
- **Sync History**: IndexedDB (tracks all sync operations)
- **File Tracking**: MD5 checksums, modification times, file sizes, Drive IDs

## Security

- OAuth tokens stored locally in IndexedDB
- No passwords stored
- Secure OAuth 2.0 flow
- Context isolation enabled
- Content Security Policy enforced

## License

MIT

## Notes

This is a production-ready implementation with the following features:

- ✅ Complete OAuth 2.0 flow with **automatic token refresh**
- ✅ Two-way sync with conflict resolution
- ✅ **Real-time monitoring** (local file watcher + Drive polling every 30s)
- ✅ **Resumable uploads** for large files (>5MB) with progress
- ✅ **Retry logic** with exponential backoff (3 attempts)
- ✅ **File-based logging** with rotation (5MB, keeps 3 files)
- ✅ Progress indicators and status updates
- ✅ Nested folder structure preservation
- ✅ Persistent configuration and auto-start
- ✅ Cross-platform installer with desktop shortcuts

### Optional Future Enhancements

- Bandwidth throttling options
- File metadata preservation (permissions, timestamps)
- Selective sync (exclude specific folders)
- Multiple sync folder pairs
- Webhook-based Drive monitoring (instead of polling)
