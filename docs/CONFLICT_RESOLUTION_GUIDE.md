# Conflict Resolution Guide

## Overview

When the same file is modified in both your local folder and Google Drive since the last sync, a conflict occurs. The app provides multiple strategies to handle these conflicts.

## Conflict Resolution Strategies

### 1. Keep Both Files (Default - Recommended)

**What it does:**
- Renames your local file to `filename_conflict_TIMESTAMP.ext`
- Downloads the Drive version as `filename.ext`
- Uploads the conflict version to Drive

**Result:** Both versions are preserved in both locations

**When to use:**
- When you're unsure which version is correct
- When both versions contain important changes
- When you want to manually merge changes later
- **This is the safest option**

**Example:**
```
Before conflict:
Local: document.txt (modified today)
Drive: document.txt (modified today)

After resolution:
Local: document.txt (Drive version)
Local: document_conflict_2026-02-08T16-30-00.txt (your version)
Drive: document.txt (original Drive version)
Drive: document_conflict_2026-02-08T16-30-00.txt (your version)
```

### 2. Local Overwrites Drive

**What it does:**
- Keeps your local file unchanged
- Uploads local file to Drive (overwrites Drive version)
- Drive version is lost

**When to use:**
- When you know your local changes are correct
- When you're the primary editor
- When Drive version is outdated or incorrect

**Warning:** ⚠️ Drive version will be permanently overwritten

**Example:**
```
Before conflict:
Local: report.docx (your latest edits)
Drive: report.docx (older version)

After resolution:
Local: report.docx (unchanged - your version)
Drive: report.docx (overwritten with your version)
```

### 3. Drive Overwrites Local

**What it does:**
- Downloads Drive file (overwrites local version)
- Keeps Drive file unchanged
- Local version is lost

**When to use:**
- When Drive version is the authoritative source
- When collaborating and others made important changes
- When your local changes are experimental/temporary

**Warning:** ⚠️ Local version will be permanently overwritten

**Example:**
```
Before conflict:
Local: presentation.pptx (your draft)
Drive: presentation.pptx (team's final version)

After resolution:
Local: presentation.pptx (overwritten with Drive version)
Drive: presentation.pptx (unchanged - team version)
```

### 4. Ask Me Each Time ✅ IMPLEMENTED!

**What it does:**
- Pauses sync when conflict detected
- Shows dialog with both file details
- Lets you choose resolution for each conflict
- Options: Keep Local, Keep Drive, Keep Both, or Skip

**When to use:**
- When you want full control over each conflict
- When conflicts are rare
- When you need to review each case individually
- When different files need different strategies

**Dialog shows:**
- File name and path
- Local version: modification time and size
- Drive version: modification time and size
- Four resolution options

**Example:**
```
Conflict Detected: documents/report.docx

Local Version:          Drive Version:
Modified: 2:30 PM       Modified: 2:45 PM
Size: 45 KB             Size: 48 KB

Options:
[Keep Local] [Keep Drive] [Keep Both] [Skip]
```

**Status:** ✅ Fully functional!

## How to Configure

### In the UI:

1. Open the app
2. Go to "Configure Sync" section
3. Find "Conflict Resolution" dropdown
4. Select your preferred strategy:
   - **Keep Both Files (Recommended)** ← Default
   - Local Overwrites Drive
   - Drive Overwrites Local
   - Ask Me Each Time (Coming Soon)

### Configuration Persistence:

Your conflict resolution choice is saved and will be used for all future conflicts until you change it.

## Conflict Detection

The app detects conflicts by comparing:

1. **Modification timestamps** - When each version was last changed
2. **Last sync timestamp** - When the file was last synced
3. **MD5 checksums** - File content hash

**A conflict occurs when:**
- File exists in both locations
- Both versions modified since last sync
- Timestamps differ by more than 5 seconds
- Checksums don't match

## Best Practices

### For Solo Users:
- Use **"Keep Both Files"** (default) - safest option
- Review conflict files periodically
- Delete conflict files after manual merge

### For Teams:
- Use **"Drive Overwrites Local"** if Drive is authoritative
- Use **"Keep Both Files"** if you need to review changes
- Communicate with team about who's editing what

### For Backup Use:
- Use **"Local Overwrites Drive"** if local is primary
- Use **"Keep Both Files"** for extra safety

## Conflict File Naming

Conflict files are named with timestamp:
```
original_name_conflict_YYYY-MM-DDTHH-MM-SS.ext
```

Example:
```
document.txt → document_conflict_2026-02-08T16-30-45.txt
```

This ensures:
- Unique names (no overwrites)
- Chronological sorting
- Easy identification

## Viewing Conflicts

Check the sync log for conflict messages:
```
⚠️ Conflict detected: documents/report.docx
Conflict resolution: Keeping both versions
Saved local version as: report_conflict_2026-02-08T16-30-45.docx
Downloaded Drive version: report.docx
✓ Conflict resolved: Kept both versions
```

## Preventing Conflicts

### Tips to minimize conflicts:

1. **Sync frequently** - Reduces chance of simultaneous edits
2. **Use Drive monitoring** - Detects Drive changes every 30 seconds
3. **Coordinate with team** - Communicate who's editing what
4. **Use file locking** - For critical files, edit one at a time
5. **Review before editing** - Check if file was recently modified

## Troubleshooting

### Too many conflicts?

**Problem:** Getting conflicts on every sync

**Solutions:**
- Check if timestamps are accurate on both systems
- Verify time zones are set correctly
- Ensure Drive monitoring is running (checks every 30s)
- Consider using "Local Overwrites Drive" or "Drive Overwrites Local"

### Conflict files piling up?

**Problem:** Many `_conflict_` files accumulating

**Solutions:**
- Review and merge conflict files manually
- Delete resolved conflict files
- Use "Local Overwrites Drive" or "Drive Overwrites Local" to prevent
- Set up periodic cleanup of old conflict files

### Lost changes?

**Problem:** Changes disappeared after conflict

**Solutions:**
- Check for `_conflict_` files - your changes might be there
- Check Drive for conflict files
- Use "Keep Both Files" strategy to prevent data loss
- Enable file versioning in Google Drive settings

## Examples

### Example 1: Document Editing

**Scenario:** You edited a document offline, someone else edited it in Drive

**Recommended:** Keep Both Files
- Review both versions
- Manually merge important changes
- Delete conflict file after merge

### Example 2: Code Development

**Scenario:** Working on code, teammate pushed changes to Drive

**Recommended:** Keep Both Files or Drive Overwrites Local
- If teammate's changes are critical: Drive Overwrites Local
- If you need to review: Keep Both Files
- Use version control (git) for better conflict resolution

### Example 3: Photo Backup

**Scenario:** Edited photo locally, also edited in Drive

**Recommended:** Keep Both Files
- Compare both versions
- Keep the better edit
- Delete the other

### Example 4: Configuration Files

**Scenario:** Config file changed in both locations

**Recommended:** Keep Both Files
- Critical to not lose either version
- Manually merge configurations
- Test before deleting conflict file

## Summary

| Strategy | Safety | Data Loss Risk | Use Case |
|----------|--------|----------------|----------|
| Keep Both Files | ✅ Safest | None | Default, unsure which is correct |
| Local Overwrites Drive | ⚠️ Medium | Drive version lost | Local is authoritative |
| Drive Overwrites Local | ⚠️ Medium | Local version lost | Drive is authoritative |
| Ask Me Each Time | ✅ Safe | None (you decide) | Full control needed |

**Recommendation:** Start with "Keep Both Files" (default) until you understand your workflow, then adjust if needed.

---

For more information, see:
- [README.md](README.md) - General documentation
- [SYNC_BEHAVIOR.md](SYNC_BEHAVIOR.md) - Detailed sync logic
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
