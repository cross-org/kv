# Index Cache Implementation

## Overview

The index cache feature provides a persistent caching mechanism for the
in-memory index, dramatically improving cold start performance for large
databases. When a database is opened, instead of rebuilding the entire index
from the ledger, the cached index is loaded from disk and only new transactions
are synced.

## Problem Statement

Before this implementation:

1. Every time a database is opened, the entire index must be rebuilt
2. The index is built by reading and processing every transaction in the ledger
3. For large databases with thousands of entries, this can take several seconds
4. This creates a poor user experience for applications with frequent restarts

## Solution

The index cache implementation provides:

1. Persistent storage of the index structure to a `.idx` file
2. Fast loading of the cached index on startup
3. Incremental synchronization of new transactions since cache creation
4. Automatic validation and invalidation when needed

## Architecture

### File Structure

```
database.db       # Main ledger file (contains all transactions)
database.db.idx   # Index cache file (optional, created when enableIndexCache: true)
```

### Cache File Format

The `.idx` file has a simple binary format:

```
| Header (32 bytes)                                      | Index Data (variable) |
|--------------------------------------------------------|----------------------|
| Magic (4) | Version (4) | Created (8) | Offset (8) | Length (8) | JSON Data        |
```

- **Magic**: "CKVI" (Cross/KV Index) - identifies the file type
- **Version**: "V001" - cache format version
- **Created**: Ledger creation timestamp (for validation)
- **Offset**: Ledger offset up to which this index was built
- **Length**: Length of the JSON index data
- **JSON Data**: Serialized index structure

### Index Serialization

The index is a tree structure with Maps. Serialization converts it to plain
objects:

```typescript
// Original structure
Map {
  "user" => {
    children: Map {
      1 => { reference: 100, children: Map {...} }
    }
  }
}

// Serialized structure
{
  "user": {
    children: {
      "1": { ref: 100, children: {...} }
    }
  }
}
```

Key handling:

- Numeric keys are preserved (detected via regex during deserialization)
- String keys remain strings
- Reference offsets are stored as `ref` field

## Integration Points

### Open Flow

```
KV.open()
  ├─> Ledger.open()
  ├─> IndexCache.load() [if enabled]
  │   ├─> Validate cache (magic, version, timestamp)
  │   ├─> Load index structure
  │   └─> Return index + offset
  ├─> sync() [syncs new transactions since cache offset]
  └─> Ready
```

### Close Flow

```
KV.close()
  ├─> Wait for pending promises
  ├─> Save index cache [if enabled]
  │   ├─> Serialize index structure
  │   ├─> Write header + data
  │   └─> Done
  └─> Cleanup resources
```

### Vacuum Flow

```
KV.vacuum()
  ├─> Ledger.vacuum() [creates new ledger]
  ├─> IndexCache.delete() [invalidate old cache]
  └─> KV.open() [rebuild index, create new cache]
```

## Validation and Error Handling

The cache implementation includes multiple validation layers:

1. **File existence check**: If cache doesn't exist, fall back to full rebuild
2. **Magic bytes verification**: Ensures file is a valid cache file
3. **Version check**: Ensures cache format is supported
4. **Timestamp validation**: Ensures cache matches current ledger
5. **JSON parsing**: Validates structure integrity

All validation failures result in:

- Warning message to console
- Graceful fallback to full index rebuild
- No application errors or data corruption

## Performance Characteristics

### Without Cache

- Time complexity: O(n) where n = number of transactions
- Startup time: Proportional to database size
- Example: ~2000ms for 5000 entries

### With Cache

- Time complexity: O(m) where m = new transactions since cache
- Startup time: Nearly constant for stable databases
- Example: ~50ms for 5000 cached + 0 new entries

### Cache Overhead

- File size: ~1-2x the in-memory index size
- Save time: ~10-50ms depending on index size
- No runtime performance impact (only affects startup/shutdown)

## Configuration

```typescript
const db = new KV({
  enableIndexCache: true, // Enable/disable cache (default: true)
  disableIndex: false, // Must be false for cache to work
});
```

The cache is automatically enabled by default. Users can disable it if:

- They want to minimize disk usage
- They have very small databases (where cache overhead > rebuild time)
- They're concerned about .idx files

## Edge Cases and Limitations

### Handled Edge Cases

1. **Corrupted cache file**: Falls back to full rebuild
2. **Version mismatch**: Ignores cache, rebuilds index
3. **Ledger recreated**: Cache invalidated by timestamp check
4. **Multiple processes**: Each process maintains its own cache view
5. **Deleted keys**: Properly excluded from cached index

### Known Limitations

1. Cache is not shared between processes (by design)
2. Cache file grows with index size (proportional to key count)
3. Cache save happens on close (not incrementally)
4. No compression (for simplicity and speed)

## Testing

The implementation includes comprehensive tests:

1. **Basic functionality**: Save and load
2. **Incremental sync**: Cache + new transactions
3. **Cache invalidation**: After vacuum
4. **Complex keys**: Hierarchical and numeric keys
5. **Error handling**: Corrupted cache, version mismatch
6. **Integration**: With disableIndex option
7. **Performance**: Benchmark showing improvement

Run tests with:

```bash
deno test --allow-read --allow-write test/index-cache.test.ts
```

## Future Improvements

Potential enhancements (not implemented):

1. **Compression**: Use CBOR or gzip for smaller cache files
2. **Incremental save**: Update cache during operation, not just on close
3. **Cache sharing**: Single cache file for multiple processes (with locking)
4. **Automatic cache cleanup**: Remove stale cache files
5. **Cache statistics**: Track hit rate, load time, etc.

## Security Considerations

1. Cache files are treated as untrusted input
2. All deserialization includes validation
3. Cache failures never cause application errors
4. No sensitive data stored in cache (just structure + offsets)
5. Cache files should have same permissions as database files

## Conclusion

The index cache implementation provides a significant performance improvement
for large databases with minimal complexity and excellent error handling. It's
enabled by default and degrades gracefully in all failure scenarios.
