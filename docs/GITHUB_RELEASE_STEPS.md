# Steps to Create GitHub Release v1.0.0

## ✅ Pre-Release Checklist

- [x] Version updated to 1.0.0 in package.json
- [x] Linux build created (gdrive-sync_1.0.0_amd64.deb - 70MB)
- [x] Release notes prepared
- [x] Build instructions documented

## 📦 Build Files Ready

Current build available:
- **Linux (Debian/Ubuntu)**: `dist/gdrive-sync_1.0.0_amd64.deb` (70 MB)

## 🚀 Steps to Create Release

### 1. Commit Current Changes
```bash
git add .
git commit -m "Release v1.0.0 - Initial production release"
```

### 2. Create and Push Tag
```bash
git tag -a v1.0.0 -m "GDrive Sync v1.0.0 - Initial Release"
git push origin main
git push origin v1.0.0
```

### 3. Create GitHub Release

1. **Go to GitHub Releases**
   - Navigate to: https://github.com/rajan471/GDrive-Sync/releases
   - Click "Draft a new release"

2. **Fill Release Information**
   - **Tag**: Select `v1.0.0` (or create new tag)
   - **Release title**: `GDrive Sync v1.0.0 - Initial Release`
   - **Description**: Copy content from `RELEASE_NOTES_v1.0.md`

3. **Upload Build Files**
   - Drag and drop: `dist/gdrive-sync_1.0.0_amd64.deb`
   - Optionally add: `dist/latest-linux.yml` (for auto-updates)

4. **Additional Files to Upload** (optional)
   - `RELEASE_NOTES_v1.0.md`
   - `BUILD_INSTRUCTIONS.md`
   - Screenshots of the app

5. **Release Options**
   - [ ] Set as pre-release (uncheck for stable release)
   - [x] Set as latest release (check this)
   - [ ] Create discussion for this release (optional)

6. **Publish**
   - Click "Publish release"

## 📝 Release Description Template

Copy this into the GitHub release description:

```markdown
# 🎉 GDrive Sync v1.0.0 - Initial Release

A modern desktop application for syncing files between your local computer and Google Drive.

## ✨ Key Features

- ✅ Two-way sync with real-time file watching
- ✅ Modern UI with dark mode support
- ✅ Configurable concurrent uploads (1-10 files)
- ✅ Smart conflict resolution
- ✅ Memory optimized for large syncs
- ✅ Auto-start on system boot
- ✅ Comprehensive file type support

## 📥 Downloads

### Linux (Debian/Ubuntu)
- **File**: `gdrive-sync_1.0.0_amd64.deb` (70 MB)
- **Install**: `sudo dpkg -i gdrive-sync_1.0.0_amd64.deb`
- **Requirements**: Ubuntu 18.04+ or equivalent

### Windows & macOS
Builds for Windows and macOS will be added soon. You can build from source using the instructions in `BUILD_INSTRUCTIONS.md`.

## 🚀 Quick Start

1. Download and install the package for your platform
2. Launch GDrive Sync
3. Sign in with your Google account
4. Select local folder and Drive destination
5. Click "Start Sync"

## 📖 Documentation

- [Release Notes](./RELEASE_NOTES_v1.0.md)
- [Build Instructions](./BUILD_INSTRUCTIONS.md)
- [README](./README.md)

## 🐛 Known Issues

- OAuth token expires after 7 days of inactivity
- Large files (>100MB) may take time to sync
- First sync of large folders requires significant memory

## 💬 Feedback

Please report issues or suggestions on the [Issues page](https://github.com/rajan471/GDrive-Sync/issues).

## 📄 License

MIT License - Free and open source

---

**⚠️ Note**: This is the initial release. Please backup important files before syncing.
```

## 🎯 Post-Release Tasks

After publishing the release:

1. **Announce the Release**
   - Share on social media
   - Post in relevant communities
   - Update project website (if any)

2. **Monitor Issues**
   - Watch for bug reports
   - Respond to user questions
   - Plan for v1.1 improvements

3. **Update Documentation**
   - Add installation instructions to README
   - Create user guide
   - Add screenshots/GIFs

## 🔄 Building for Other Platforms

### Windows Build (requires Windows machine)
```bash
npm run build:win
```
Upload: `dist/GDrive-Sync-Setup-1.0.0.exe`

### macOS Build (requires Mac machine)
```bash
npm run build:mac
```
Upload: `dist/GDrive-Sync-1.0.0.dmg`

## 📊 Release Metrics to Track

- Download count per platform
- GitHub stars
- Issues opened
- User feedback
- Feature requests

## 🎉 Congratulations!

Your app is now ready for public release! 🚀
