# @cross/kv

A fast, lightweight, powerful and cross-platform key-value database for Node.js,
Deno, and Bun.

[![JSR](https://jsr.io/badges/@cross/kv)](https://jsr.io/@cross/kv)
[![JSR Score](https://jsr.io/badges/@cross/kv/score)](https://jsr.io/@cross/kv)

Library usage:

```typescript
import { KV } from "@cross/kv";

// Create an instance
const db = new KV();
await db.open("data/mydatabase.db");

// Listen for new interests of any user
db.watch(["users", {}, "interests"], (data) => {
  console.log(data);
});

// Store some values/documents indexed by users.<id>.<category>
await db.set(["users", 1, "contact"], {
  name: "Bob",
});
await db.set(["users", 1, "interests"], {
  description: "Fishing",
});

// Display all contact information connected to users with id <= 10
console.log(await db.listAll(["users", { to: 10 }, "contact"]));

db.close();
```

Command line client `ckv`:

```bash
# Install
# deno install -frgA --name ckv jsr:@cross/kv/cli

# Run without installing
deno run -A jsr:@cross/kv/cli

> open my.db
Success [10.30 ms]

> set:json my.key {"hello":"kv"}
Success [31.70 ms]

> get my.key

Key:             ["my","key"]
Operation:       SET (1)
Timestamp:       2024-05-26T19:49:49.471Z
Hash:            abdf6eb7a3fe04af920f31a599ce0cc069d29041

{ hello: "kv" }

Success [7.74 ms]
```

## Features

- **Cross-Platform & Multi-Process:** Built with pure TypeScript for seamless
  compatibility across Node.js, Deno, and Bun, with built-in support for
  concurrent access by multiple processes.
- **Powerful:** Supports hierarchical keys, flexible mid-key range queries, and
  real-time data change notifications through `.watch()`.
- **Simple and Fast:** Lightweight and performant storage with an in-memory
  index for efficient data retrieval.
- **Durable:** Ensures data integrity and reliability by storing each database
  as a single, append-only transaction ledger.
- **Type-Safe:** Leverages TypeScript generics for enhanced type safety when
  setting and retrieving values.
- **Atomic Transactions:** Guarantees data consistency by grouping multiple
  operations into indivisible units, which also improves performance.
- **Flexible:** Store any serializable JavaScript object (except functions and
  WeakMaps), and customize synchronization behavior to optimize for your
  specific use case.

## Installation

Library:

```bash
# Using npm
npx jsr add @cross/kv

# Using Deno
deno add @cross/kv

# Using bun
bunx jsr add @cross/kv
```

Command line client `ckv`:

```bash
# Using Deno
deno install -frA --name ckv jsr:@cross/kv/cli
```

## API Documentation

### Methods

- `KV(options)` - Main class. Options are optional.
  - `async open(filepath, createIfMissing = true, ignoreReadErrors = false)` -
    Opens the KV store at the specified file path, creating it if it doesn't
    exist (default behavior).
  - `async set<T>(key, value)` - Stores a value associated with the given key.
  - `async delete(key)` - Removes the key-value pair identified by the key.
  - `async get<T>(key)` - Retrieves the value associated with the specified key.
    Returns null if the key does not exist.
  - `async *iterate<T>(query, limit, reverse)` - Asynchronously iterates over
    the latest values matching the query
  - `async listAll<T>(query, limit, reverse)` - Retrieves all latest values
    matching the query as an array.
  - `async *scan<T>(query, limit, reverse, ignoreReadErrors = false)` -
    Asynchronously iterates over the transaction history (all set and delete
    operations) for keys matching the query. Optionally recurses into subkeys
    and fetches the associated data.
  - `listKeys(query)` - Returns an array of all keys matching the given query.
  - `async sync(ignoreReadErrors = false)` - Manually synchronizes the in-memory
    index with the on-disk data store.
  - `watch<T>(query, callback, recursive): void` - Registers a callback to be
    invoked whenever a matching transaction (set or delete) is added.
  - `unwatch<T>(query, callback): void` - Unregisters a previously registered
    watch handler.
  - `beginTransaction()` - Starts an atomic transaction, ensuring data
    consistency for multiple operations.
  - `async endTransaction()` - Commits all changes made within the transaction,
    or rolls back if errors occur.
  - `async vacuum(ignoreReadErrors = false)` - Optimizes storage by removing
    redundant transaction history, retaining only the latest value for each key.
  - `on(eventName, eventData)` - Subscribes to events like `sync`,
    `watchdogError`, or `closing` to get notified of specific occurrences.
  - `isOpen()` - Returns true if the database is open and ready for operations.
  - `defer(promiseToHandle, [errorHandler], [timeoutMs])` - Defers the
    resolution or rejection of a Promise until `.close()`
  - `async close()` - Closes the KV store, ensuring resources are released.

### Keys

- Arrays of strings or numbers
- First element in a key must be a string.
- Strings must only contain alphanumeric characters, hyphens, underscores or
  "@".

**Examples keys**

```
["users", 123]
["products", "category", { from: 10, to: 20 }]
```

### Values

Values (or documents) are the data you store in the database. They can be any
JavaScript primitive or a complex object containing CBOR-serializable types,
including:

- **Numbers:** (e.g., `12345`)
- **Strings:** (e.g., `"Hello, world!"`)
- **Booleans:** (e.g., `true`)
- **Arrays:** (e.g., `[1, 2, 3]`)
- **Objects:** (e.g., `{ "name": "Alice", "age": 30 }`)
- **Maps:** (e.g., `new Map([["key1", "value1"], ["key2", "value2"]])`)
- **Sets:** (e.g., `new Set([1, 2, 3])`)
- **Dates:** (e.g., `new Date()`)
- **null**

### Queries

Queries are similar to keys but with additional support for ranges, specified as
objects like `{ from: 5, to: 20 }` or `{ from: "a", to: "l" }`. An empty range
(`{}`) matches any document.

**Example queries**

```
// All users
["users"]       
// Specific user with ID 123          
["users", 123]            
// All products in any category
["products", "category"]  
// Products in category with an id up to 20
["products", "category", { to: 20 }] 
 // Sub document "specification" of products in category 10 to 20
["products", "category", { from: 10, to: 20 }, "specifications"]
// Sub-document "author" of any book
["products", "book", {}, "author"]
```

### Options

You can customize the behavior of the KV store using the following options when
creating a new KV instance:

```typescript
const db = new KV({
  autoSync: true, // Enable/disable automatic synchronization (default: true)
  syncIntervalMs: 1000, // Synchronization interval in milliseconds (default: 1000)
  ledgerCacheSize: 100, // Ledger cache size in megabytes (default: 100)
  disableIndex: false, // Disable in-memory index for faster loading but limited functionality (default: false)
  enableIndexCache: true, // Enable persistent index caching for faster cold starts (default: true)
});
```

Explanations:

- **autoSync** (boolean):
  - `true` (default): The in-memory index is automatically synchronized with the
    on-disk ledger in the background. This is recommended for multi-process
    scenarios.
  - `false`: Automatic synchronization is disabled. You'll need to call
    db.sync() manually to keep the index up-to-date with other processes. This
    might be suitable for single-process scenarios, or where you fine grained
    control over performance.
- **syncIntervalMs** (number): Specifies the interval (in milliseconds) between
  automatic synchronization operations if autoSync is enabled. A shorter
  interval provides more up-to-date data but may introduce more overhead.
- **ledgerCacheSize** (number): Sets the maximum amount of ledger data (in
  megabytes) to cache in memory. A larger cache can improve read performance but
  consumes more memory. (Default `100`).
- **disableIndex** (boolean):
  - `false` (default): The in-memory index is enabled, allowing for efficient
    data retrieval and complex queries.
  - `true`: The in-memory index is disabled, resulting in faster loading times
    but preventing the use of get, iterate, scan, and list. This is suitable
    only when you need to append data to the ledger and don't require efficient
    querying.
- **enableIndexCache** (boolean):
  - `true` (default): Enables persistent caching of the in-memory index to a
    separate `.idx` file alongside the database. On startup, the cached index is
    loaded from disk instead of rebuilding it from scratch, significantly
    improving cold start performance for large databases. The cache is
    automatically invalidated when the ledger is recreated (e.g., after vacuum
    operations) and includes validation checks to ensure consistency.
  - `false`: Index caching is disabled. The index is rebuilt from the ledger on
    every startup, which may be slower for large databases but eliminates the
    `.idx` cache file.

## Concurrency

`cross/kv` has a built-in mechanism for synchronizing the in-memory index with
the transaction ledger, allowing multiple processes to work with the same
database simultaneously.

Due to the append-only design of the ledger, each process can update its
internal state by reading all new transactions appended since the last processed
transaction.

### Single-Process Synchronization

In single-process scenarios, explicit synchronization is often unnecessary. You
can disable automatic synchronization by setting the `autoSync` option to
`false`, eliminating automated `.sync()` calls. This can potentially improve
performance when only one process accesses the database.

### Multi-Process Synchronisation

In multi-process scenarios, synchronization is essential for maintaining data
consistency. `cross/kv` offers automatic index synchronization upon each data
insertion and at a configurable interval (default: 1000ms). Customizing this
interval providing fine-grained control over the trade-off between consistency
and performance. For strict consistency guarantees, you can manually call
`.sync()` before reading data.

```ts
await kv.sync(); // Ensure the most up-to-date data
const result = await kv.get(["my", "key"]); // Now read with confidence
```

### Monitoring Synchronization Events

You can subscribe to the `sync` event to receive notifications about
synchronization results and potential errors:

```typescript
const kvStore = new KV();
await kvStore.open("db/mydatabase.db");

kvStore.on("sync", (eventData) => {
  switch (eventData.result) {
    case "ready": // No new updates
    case "success": // Synchronization successful, new transactions added
    case "ledgerInvalidated": // Ledger recreated, database reopened and index resynchronized
    case "error": // An error occurred during synchronization
    default:
      // Handle unexpected eventData.result values if needed
  }
});
```

## Changelog

See the full changelog in the docs site source:
[docs/src/changelog.md](./docs/src/changelog.md).

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

The task `deno task check` runs all tests, and is a good pre-commit check.
`deno task check-coverage` do require `genhtml` available through the `lcov`
package in most distributions.

For a detailed code coverage analysis, see [COVERAGE.md](./COVERAGE.md).

## **License**

MIT License
