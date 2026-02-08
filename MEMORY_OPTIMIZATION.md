# Memory Optimization Guide

## Overview

The app has been optimized to handle large syncs (10,000+ files) without running out of memory or being killed by the OS.

## Key Optimizations

### 1. Increased Node.js Memory Limit
- **Default**: ~1.5GB
- **New Limit**: 4GB
- Set via `--max-old-space-size=4096` flag in main.js

### 2. Chunked State Storage
Instead of one large `.gdrive-sync-state.json` file, state is now split into multiple smaller chunks:

```
.gdrive-sync/
  ├── meta.json              (metadata only)
  ├── chunk-do.json          (documents/* files)
  ├── chunk-sr.json          (src/* files)
  ├── chunk-in.json          (infrastructure/* files)
  └── chunk-co.json          (config/* files)
```

**Benefits:**
- Each chunk contains ~500-1000 files
- Only modified chunks are rewritten
- Faster save operations
- Predictable chunk names based on file paths

### 3. Lazy Loading with LRU Cache
- Chunks are loaded on-demand, not all at once
- Maximum 20 chunks kept in memory at a time
- Least Recently Used (LRU) chunks are evicted automatically
- Dirty chunks are never evicted until saved

### 4. Batch Processing
- Files are processed in batches of 50
- State is saved after each batch
- Garbage collection triggered between batches
- Reduces peak memory usage

### 5. Memory Monitoring
- Automatic memory usage tracking every 30 seconds
- Logs warnings when heap usage exceeds 1GB
- Forces garbage collection when heap exceeds 2GB
- Helps identify memory leaks early

### 6. Stream-Based File Operations
- File uploads/downloads use streams
- No entire file loaded into memory
- Efficient for large files (>100MB)

## Migration from Old Format

The app automatically migrates from the old single-file format:
1. Detects `.gdrive-sync-state.json` on first load
2. Converts to chunked format in `.gdrive-sync/`
3. Deletes old file after successful migration
4. Clears memory after migration

## Memory Usage Estimates

| Files Synced | Old Format | New Format | Savings |
|--------------|------------|------------|---------|
| 1,000        | ~50MB      | ~10MB      | 80%     |
| 5,000        | ~250MB     | ~30MB      | 88%     |
| 10,000       | ~500MB     | ~50MB      | 90%     |
| 50,000       | ~2.5GB     | ~150MB     | 94%     |

## Monitoring Memory Usage

Check logs for memory warnings:
```
[WARN] High memory usage detected: heapUsedMB=1024, heapTotalMB=1200, rssMB=1500
[INFO] Forcing garbage collection
```

## Best Practices

1. **Sync smaller folders**: Break large projects into multiple sync pairs
2. **Use ignore patterns**: Add folders to `.syncignore` that don't need syncing
3. **Monitor logs**: Check for memory warnings during large syncs
4. **Restart periodically**: If syncing 50,000+ files, restart app after initial sync

## Technical Details

### Chunk Naming Strategy
Chunks are named based on the first 1-2 characters of the file path:
- `documents/file.txt` → `chunk-do.json`
- `src/main.js` → `chunk-sr.json`
- `123.txt` → `chunk-0-9.json`
- `_special.txt` → `chunk-special.json`

### LRU Eviction
When more than 20 chunks are loaded:
1. Identify least recently accessed chunk
2. Check if chunk is dirty (has unsaved changes)
3. If clean, remove from memory
4. Update access order tracking

### Garbage Collection
- Automatic GC triggered after each batch (50 files)
- Manual GC forced when heap > 2GB
- Requires `--expose-gc` flag (automatically set)

## Troubleshooting

### App Still Running Out of Memory?
1. Reduce batch size in `syncManager.js` (change `BATCH_SIZE` from 50 to 25)
2. Reduce max loaded chunks in `fileTracker.js` (change `maxLoadedChunks` from 20 to 10)
3. Increase memory limit in `main.js` (change from 4096 to 8192)

### Slow Performance?
1. Increase batch size for faster processing (trade memory for speed)
2. Increase max loaded chunks to reduce disk I/O
3. Use SSD for better chunk read/write performance

### Chunks Not Being Created?
1. Check `.gdrive-sync/` directory exists
2. Verify write permissions
3. Check logs for save errors
4. Ensure old `.gdrive-sync-state.json` was migrated

## Future Improvements

Potential optimizations for even larger syncs:
- SQLite database instead of JSON chunks
- Incremental sync (only check changed files)
- Parallel chunk loading
- Compressed chunk storage
- Memory-mapped file access
