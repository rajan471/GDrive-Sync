# GDrive Sync v1.0.0 - Initial Release

## 🎉 Features

### Core Functionality
- **Two-way sync** between local folders and Google Drive
- **Real-time file watching** with automatic sync on file changes
- **Nested folder structure** preservation in both directions
- **OAuth 2.0 authentication** with secure token storage
- **Conflict resolution** with multiple strategies (ask, keep both, local wins, drive wins)

### Performance & Reliability
- **Chunked state storage** for handling large syncs (80-94% memory reduction)
- **Queue-based uploads** with configurable concurrency (1-10 files, default 3)
- **MD5 checksum verification** for accurate conflict detection
- **Memory optimization** with 4GB limit and automatic garbage collection
- **Persistent configuration** with IndexedDB storage

### User Interface
- **Modern UI** with Tailwind CSS
- **Dark mode support**
- **Real-time progress tracking** with percentage and file count
- **Currently syncing section** showing active and recently completed files
- **File type icons** for different file formats (PDF, DOC, images, videos, code, etc.)
- **Auto-start on system boot** option
- **Sync log download** for troubleshooting

### File Management
- **Comprehensive ignore patterns** (.git, node_modules, etc.)
- **File tracking** with modification times and sizes
- **Conflict dialog** with side-by-side comparison
- **Sync history** stored in IndexedDB

## 📋 System Requirements

- **Windows**: Windows 10 or later (64-bit)
- **macOS**: macOS 10.13 or later
- **Linux**: Ubuntu 18.04 or later (or equivalent)
- **Internet connection** required for Google Drive sync
- **Google account** with Drive access

## 🚀 Installation

### Windows
1. Download `GDrive-Sync-Setup-1.0.0.exe`
2. Run the installer
3. Follow the installation wizard
4. Launch GDrive Sync from Start Menu or Desktop

### macOS
1. Download `GDrive-Sync-1.0.0.dmg`
2. Open the DMG file
3. Drag GDrive Sync to Applications folder
4. Launch from Applications

### Linux (Debian/Ubuntu)
1. Download `gdrive-sync_1.0.0_amd64.deb`
2. Install: `sudo dpkg -i gdrive-sync_1.0.0_amd64.deb`
3. Launch from applications menu or run `gdrive-sync`

## 📖 Quick Start

1. **Sign in with Google** - Click "Sign in with Google" and authorize the app
2. **Select local folder** - Choose the folder you want to sync
3. **Select Drive folder** - Choose or create a Google Drive folder
4. **Configure settings** - Set max concurrent uploads and conflict resolution
5. **Start sync** - Click "Start Sync" button

## 🔧 Configuration

- **Max Concurrent Uploads**: 1-10 files (default: 3)
- **Conflict Resolution**: Ask every time, Keep both, Local wins, Drive wins
- **Auto-start**: Enable to start sync automatically on system boot

## 📝 Known Issues

- Large files (>100MB) may take time to sync
- First sync of large folders may require significant memory
- OAuth token expires after 7 days of inactivity (re-authentication required)

## 🐛 Bug Reports

Please report issues on GitHub: https://github.com/rajan471/GDrive-Sync/issues

## 📄 License

MIT License - See LICENSE file for details

## 👨‍💻 Author

Rajan Kumar (rajankumar471@gmail.com)

---

**Note**: This is the initial release. Please backup important files before syncing.
