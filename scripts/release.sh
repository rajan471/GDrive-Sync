#!/bin/bash

# GDrive Sync v1.0.0 Release Script

echo "🚀 GDrive Sync v1.0.0 Release Script"
echo "===================================="
echo ""

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo "❌ Error: Not a git repository"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Uncommitted changes detected"
    echo ""
    git status --short
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Release v1.0.0 - Initial production release"
        echo "✅ Changes committed"
    else
        echo "❌ Aborted: Please commit changes manually"
        exit 1
    fi
fi

# Check if tag already exists
if git rev-parse v1.0.0 >/dev/null 2>&1; then
    echo "⚠️  Tag v1.0.0 already exists"
    read -p "Do you want to delete and recreate it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d v1.0.0
        git push origin :refs/tags/v1.0.0 2>/dev/null
        echo "✅ Old tag deleted"
    else
        echo "❌ Aborted"
        exit 1
    fi
fi

# Create tag
echo "🏷️  Creating tag v1.0.0..."
git tag -a v1.0.0 -m "GDrive Sync v1.0.0 - Initial Release"
echo "✅ Tag created"

# Push to remote
echo ""
echo "📤 Pushing to GitHub..."
git push origin main
git push origin v1.0.0

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "📦 Build file ready:"
    echo "   - dist/gdrive-sync_1.0.0_amd64.deb (70 MB)"
    echo ""
    echo "🎯 Next steps:"
    echo "   1. Go to: https://github.com/rajan471/GDrive-Sync/releases"
    echo "   2. Click 'Draft a new release'"
    echo "   3. Select tag: v1.0.0"
    echo "   4. Upload: dist/gdrive-sync_1.0.0_amd64.deb"
    echo "   5. Copy release notes from: docs/RELEASE_NOTES_v1.0.md"
    echo "   6. Publish release"
    echo ""
    echo "📖 See docs/GITHUB_RELEASE_STEPS.md for detailed instructions"
    echo ""
else
    echo ""
    echo "❌ Failed to push to GitHub"
    echo "Please check your git configuration and try again"
    exit 1
fi
