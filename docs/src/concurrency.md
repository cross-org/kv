---
title: "Concurrency"
nav_order: 5
---

# Concurrency

---

`@cross/kv` has a built-in mechanism for synchronizing the in-memory index with
the transaction ledger, allowing multiple processes to work with the same
database simultaneously.

Due to the append-only design of the ledger, each process can update its
internal state by reading all new transactions appended since the last processed
transaction.

## Single-Process Synchronization

In single-process scenarios, explicit synchronization is often unnecessary. You
can disable automatic synchronization by setting the `autoSync` option to
`false`, eliminating automated `.sync()` calls. This can potentially improve
performance when only one process accesses the database.

```typescript
import { KV } from "@cross/kv";

const db = new KV({
  autoSync: false, // Disable automatic synchronization
});

await db.open("data/mydatabase.db");

// Perform operations without automatic syncing
await db.set(["key"], "value");
```

## Multi-Process Synchronization

In multi-process scenarios, synchronization is essential for maintaining data
consistency. `@cross/kv` offers automatic index synchronization upon each data
insertion and at a configurable interval (default: 1000ms).

### Automatic Synchronization

By default, `@cross/kv` automatically synchronizes the index:

```typescript
const db = new KV({
  autoSync: true, // Enabled by default
  syncIntervalMs: 1000, // Sync every 1000ms
});

await db.open("data/mydatabase.db");
```

### Custom Sync Interval

You can customize the synchronization interval to balance consistency and
performance:

```typescript
const db = new KV({
  autoSync: true,
  syncIntervalMs: 500, // Sync every 500ms for tighter consistency
});

await db.open("data/mydatabase.db");
```

### Manual Synchronization

For strict consistency guarantees, you can manually call `.sync()` before
reading data:

```typescript
const db = new KV({
  autoSync: true,
  syncIntervalMs: 5000, // Less frequent automatic syncs
});

await db.open("data/mydatabase.db");

// Ensure the most up-to-date data before reading
await db.sync();
const result = await db.get(["my", "key"]);
```

## Monitoring Synchronization Events

You can subscribe to the `sync` event to receive notifications about
synchronization results and potential errors:

```typescript
const db = new KV();
await db.open("data/mydatabase.db");

db.on("sync", (eventData) => {
  switch (eventData.result) {
    case "ready":
      // No new updates
      console.log("Database is up-to-date");
      break;

    case "success":
      // Synchronization successful, new transactions added
      console.log("New transactions synchronized");
      break;

    case "ledgerInvalidated":
      // Ledger recreated, database reopened and index resynchronized
      console.log("Database ledger was invalidated and resynchronized");
      break;

    case "error":
      // An error occurred during synchronization
      console.error("Synchronization error:", eventData.error);
      break;

    default:
      // Handle unexpected eventData.result values if needed
      console.warn("Unexpected sync result:", eventData.result);
  }
});
```

## Multi-Process Example

Here's a complete example demonstrating multi-process usage:

### Process 1 (Writer)

```typescript
import { KV } from "@cross/kv";

const db = new KV({
  autoSync: true,
  syncIntervalMs: 1000,
});

await db.open("shared/database.db");

// Write data continuously
setInterval(async () => {
  const timestamp = new Date();
  await db.set(["data", "timestamp"], timestamp);
  console.log("Written:", timestamp);
}, 2000);
```

### Process 2 (Reader)

```typescript
import { KV } from "@cross/kv";

const db = new KV({
  autoSync: true,
  syncIntervalMs: 1000,
});

await db.open("shared/database.db");

// Monitor sync events
db.on("sync", (eventData) => {
  if (eventData.result === "success") {
    console.log("New data synchronized");
  }
});

// Read data continuously
setInterval(async () => {
  await db.sync(); // Force sync for latest data
  const timestamp = await db.get(["data", "timestamp"]);
  console.log("Read:", timestamp);
}, 1500);
```

### Process 3 (Watcher)

```typescript
import { KV } from "@cross/kv";

const db = new KV({
  autoSync: true,
  syncIntervalMs: 1000,
});

await db.open("shared/database.db");

// Watch for changes
db.watch(["data"], (entry) => {
  console.log("Data changed:", entry.key, "->", entry.value);
});

console.log("Watching for changes...");
```

## Best Practices

### For Single-Process Applications

1. **Disable Auto-Sync**: Set `autoSync: false` to reduce overhead
2. **Manual Sync When Needed**: Only call `.sync()` if you need to reload the
   database from disk

```typescript
const db = new KV({ autoSync: false });
await db.open("data/single-process.db");
```

### For Multi-Process Applications

1. **Enable Auto-Sync**: Keep `autoSync: true` (the default)
2. **Tune Sync Interval**: Adjust `syncIntervalMs` based on your consistency
   requirements
3. **Manual Sync for Critical Reads**: Call `.sync()` before reading if you need
   guaranteed up-to-date data
4. **Monitor Sync Events**: Subscribe to sync events to detect issues early

```typescript
const db = new KV({
  autoSync: true,
  syncIntervalMs: 1000, // Adjust based on your needs
});

await db.open("data/multi-process.db");

db.on("sync", (eventData) => {
  if (eventData.result === "error") {
    console.error("Sync error:", eventData.error);
    // Handle the error appropriately
  }
});
```

### For High-Consistency Requirements

1. **Shorter Sync Intervals**: Use a smaller `syncIntervalMs` value (e.g.,
   200-500ms)
2. **Manual Sync Before Critical Operations**: Always sync before important
   reads

```typescript
const db = new KV({
  autoSync: true,
  syncIntervalMs: 200, // Very frequent syncing
});

await db.open("data/high-consistency.db");

// Before critical read
await db.sync();
const criticalData = await db.get(["critical", "data"]);
```

### For High-Performance Requirements

1. **Longer Sync Intervals**: Use a larger `syncIntervalMs` value (e.g.,
   2000-5000ms)
2. **Batch Operations**: Use transactions to group multiple operations

```typescript
const db = new KV({
  autoSync: true,
  syncIntervalMs: 5000, // Less frequent syncing
});

await db.open("data/high-performance.db");

// Use transactions for batching
db.beginTransaction();
for (let i = 0; i < 1000; i++) {
  await db.set(["items", i], { value: i });
}
await db.endTransaction();
```

## Next Steps

- Review the [API Documentation](api) for detailed method references
- Explore [Examples](examples) for practical usage patterns
