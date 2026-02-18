#!/bin/bash

# GDrive Sync v1.0.0 - Create GitHub Release with Assets

VERSION="v1.0.1"
REPO="rajan471/GDrive-Sync"
DEB_FILE="../dist/gdrive-sync_1.0.0_amd64.deb"

echo "🚀 Creating GitHub Release $VERSION"
echo "===================================="
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo ""
    echo "Install it with:"
    echo "  sudo apt install gh"
    echo ""
    echo "Or follow manual steps in GITHUB_RELEASE_STEPS.md"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 Please login to GitHub first:"
    gh auth login
fi

# Check if .deb file exists
if [ ! -f "$DEB_FILE" ]; then
    echo "❌ Build file not found: $DEB_FILE"
    echo "Run: npm run build:linux"
    exit 1
fi

# Check if tag exists locally
if ! git rev-parse $VERSION >/dev/null 2>&1; then
    echo "📝 Creating tag $VERSION..."
    git tag -a $VERSION -m "GDrive Sync $VERSION - Initial Release"
fi

# Push tag to GitHub
echo "📤 Pushing tag to GitHub..."
git push origin $VERSION 2>/dev/null || echo "Tag already exists on remote"

# Create release
echo ""
echo "🎉 Creating GitHub release..."
gh release create $VERSION \
  "$DEB_FILE" \
  --repo "$REPO" \
  --title "GDrive Sync $VERSION - Initial Release" \
  --notes-file ../docs/RELEASE_NOTES_v1.0.md

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Release created successfully!"
    echo ""
    echo "📦 Uploaded assets:"
    echo "   - gdrive-sync_1.0.0_amd64.deb (70 MB)"
    echo ""
    echo "🔗 View release at:"
    echo "   https://github.com/$REPO/releases/tag/$VERSION"
    echo ""
else
    echo ""
    echo "❌ Failed to create release"
    echo ""
    echo "You can create it manually:"
    echo "1. Go to: https://github.com/$REPO/releases/new"
    echo "2. Select tag: $VERSION"
    echo "3. Upload: $DEB_FILE"
    echo "4. Copy notes from: docs/RELEASE_NOTES_v1.0.md"
    exit 1
fi
