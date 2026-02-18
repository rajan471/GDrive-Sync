# Production Release Guide

## Pre-Release Checklist

### 1. Update Package Metadata

Edit `package.json`:

```json
{
  "name": "gdrive-sync",
  "version": "1.0.0",  // Update version
  "author": {
    "name": "Your Name",  // Update with your name
    "email": "your.email@example.com"  // Update with your email
  },
  "homepage": "https://github.com/yourusername/gdrive-sync",  // Update URL
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/gdrive-sync.git"
  }
}
```

### 2. Update Linux Maintainer

In `package.json` under `build.linux`:

```json
"linux": {
  "maintainer": "your.email@example.com"  // Update with your email
}
```

### 3. Test the Application

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Test all features:
# - Authentication
# - Folder selection
# - Drive folder creation
# - File sync (upload/download)
# - Conflict resolution
# - Auto-start toggle
# - Stop/Start sync
```

### 4. Run Security Audit

```bash
# Check for vulnerabilities
npm audit

# Fix automatically if possible
npm audit fix

# Review and fix manually if needed
```

### 5. Build for Your Platform

**Windows:**
```bash
npm run build:win
```
Output: `dist/Google Drive Sync Setup 1.0.0.exe`

**macOS:**
```bash
npm run build:mac
```
Output: `dist/Google Drive Sync-1.0.0.dmg`

**Linux:**
```bash
npm run build:linux
```
Output: 
- `dist/google-drive-sync-1.0.0.AppImage`
- `dist/google-drive-sync_1.0.0_amd64.deb`

### 6. Test the Installer

1. Install the built application
2. Verify desktop shortcut was created (Windows/Linux DEB)
3. Test all features in the installed version
4. Check auto-start functionality
5. Verify uninstaller works (Windows)

## Code Signing (Recommended for Production)

### Windows Code Signing

1. Obtain a code signing certificate (.pfx file)
2. Add to `package.json`:

```json
"win": {
  "certificateFile": "path/to/cert.pfx",
  "certificatePassword": "your_password",
  "signingHashAlgorithms": ["sha256"]
}
```

Or use environment variables:
```bash
export CSC_LINK=/path/to/cert.pfx
export CSC_KEY_PASSWORD=your_password
npm run build:win
```

### macOS Code Signing

1. Obtain Apple Developer ID
2. Add to `package.json`:

```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

Or use environment variables:
```bash
export APPLE_ID=your@email.com
export APPLE_ID_PASSWORD=app-specific-password
npm run build:mac
```

## Environment Variables for Production

For CI/CD or production builds, use environment variables instead of config.json:

```bash
export GOOGLE_CLIENT_ID=your_client_id
export GOOGLE_CLIENT_SECRET=your_client_secret
npm run build
```

## Distribution

### GitHub Release

1. Create a new release on GitHub
2. Tag version (e.g., `v1.0.0`)
3. Upload installer files from `dist/` folder
4. Write release notes

### Release Notes Template

```markdown
## Google Drive Sync v1.0.0

### Features
- Two-way sync between local folders and Google Drive
- Real-time file watching with automatic sync
- Conflict resolution (keeps both versions)
- Nested folder structure preservation
- Configurable concurrent uploads (1-10)
- Auto-start on system startup
- Cross-platform support (Windows, macOS, Linux)

### Installation

**Windows:**
Download and run `Google Drive Sync Setup 1.0.0.exe`

**macOS:**
Download `Google Drive Sync-1.0.0.dmg`, open and drag to Applications

**Linux:**
- Ubuntu/Debian: Download and install `google-drive-sync_1.0.0_amd64.deb`
- Other distros: Download and run `google-drive-sync-1.0.0.AppImage`

### Setup
See [SETUP_GUIDE.md](SETUP_GUIDE.md) for Google OAuth setup instructions.

### Known Issues
- Token refresh not implemented (re-authentication required after expiration)
- Large files (>100MB) may cause memory issues

### System Requirements
- Windows 10/11, macOS 10.13+, or Linux (Ubuntu 18.04+)
- 100MB free disk space
- Internet connection
- Google account
```

## Post-Release

### 1. Monitor Issues

- Watch for bug reports
- Check logs in user data directory:
  - Windows: `%APPDATA%/Google Drive Sync/logs/`
  - macOS: `~/Library/Application Support/Google Drive Sync/logs/`
  - Linux: `~/.config/Google Drive Sync/logs/`

### 2. Plan Updates

Create issues for:
- Token refresh mechanism
- Large file streaming
- Real-time Drive monitoring
- Selective sync
- Multiple sync pairs

### 3. Update Documentation

- Keep README.md current
- Update TROUBLESHOOTING.md with new issues
- Add FAQ if needed

## Quick Release Commands

```bash
# 1. Update version in package.json
# 2. Commit changes
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags

# 3. Build
npm run build:win   # or your platform
npm run build:mac
npm run build:linux

# 4. Test installer

# 5. Create GitHub release and upload files from dist/
```

## Troubleshooting Build Issues

### "Please specify author email"
Update `author.email` in package.json

### "Please specify homepage"
Update `homepage` in package.json

### "Linux maintainer required"
Update `build.linux.maintainer` in package.json

### "Code signing failed"
- Windows: Check certificate path and password
- macOS: Verify Developer ID and credentials
- Or disable signing for testing: `export CSC_IDENTITY_AUTO_DISCOVERY=false`

### "Build failed: ENOENT AppLogo.png"
Ensure `AppLogo.png` exists in project root

### "Module not found"
Run `npm install` and `npm run postinstall`

## Security Best Practices

1. **Never commit config.json** - Already in .gitignore ✅
2. **Use environment variables** - For CI/CD builds
3. **Enable code signing** - Prevents security warnings
4. **Regular updates** - Keep dependencies current
5. **Audit regularly** - Run `npm audit` before releases

## Support

For issues or questions:
- GitHub Issues: [your-repo-url]/issues
- Email: your.email@example.com
- Documentation: See README.md and guides

---

**Ready to release?** Follow the checklist above and you're good to go! 🚀
