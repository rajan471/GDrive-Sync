# Build Instructions for GDrive Sync v1.0

## Prerequisites

1. **Node.js** (v18 or later)
2. **npm** or **yarn**
3. **Git**

## Building for Your Platform

### 1. Install Dependencies
```bash
npm install
```

### 2. Build for Your Platform

#### Windows (on Windows machine)
```bash
npm run build:win
```
Output: `dist/GDrive-Sync-Setup-1.0.0.exe`

#### macOS (on Mac machine)
```bash
npm run build:mac
```
Output: `dist/GDrive-Sync-1.0.0.dmg`

#### Linux (on Linux machine)
```bash
npm run build:linux
```
Output: `dist/gdrive-sync_1.0.0_amd64.deb`

### 3. Build for All Platforms (requires platform-specific tools)
```bash
npm run build
```

## Build Output

All builds will be created in the `dist/` directory:
- Windows: `.exe` installer
- macOS: `.dmg` disk image
- Linux: `.deb` package

## Creating GitHub Release

### 1. Commit and Tag
```bash
git add .
git commit -m "Release v1.0.0"
git tag -a v1.0.0 -m "Version 1.0.0 - Initial Release"
git push origin main
git push origin v1.0.0
```

### 2. Create Release on GitHub
1. Go to https://github.com/rajan471/GDrive-Sync/releases
2. Click "Draft a new release"
3. Choose tag: `v1.0.0`
4. Release title: `GDrive Sync v1.0.0`
5. Copy content from `RELEASE_NOTES_v1.0.md`
6. Upload build files from `dist/` directory
7. Click "Publish release"

## Build Sizes (Approximate)

- Windows: ~150-200 MB
- macOS: ~150-200 MB
- Linux: ~150-200 MB

## Troubleshooting

### Build Fails on Windows
- Install Windows Build Tools: `npm install --global windows-build-tools`
- Run as Administrator

### Build Fails on macOS
- Install Xcode Command Line Tools: `xcode-select --install`
- Accept Xcode license: `sudo xcodebuild -license accept`

### Build Fails on Linux
- Install required packages:
  ```bash
  sudo apt-get install -y build-essential libssl-dev
  ```

## Code Signing (Optional)

For production releases, you should sign your builds:

### Windows
- Get a code signing certificate
- Set environment variables:
  ```
  CSC_LINK=path/to/certificate.pfx
  CSC_KEY_PASSWORD=your_password
  ```

### macOS
- Get an Apple Developer certificate
- Set environment variables:
  ```
  CSC_LINK=path/to/certificate.p12
  CSC_KEY_PASSWORD=your_password
  ```

## Auto-Update Setup (Future)

To enable auto-updates, configure electron-updater in package.json:
```json
"publish": {
  "provider": "github",
  "owner": "rajan471",
  "repo": "GDrive-Sync"
}
```

Then users will automatically receive update notifications.
