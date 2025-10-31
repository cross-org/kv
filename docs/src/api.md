---
title: "API Documentation"
nav_order: 3
---

# API Documentation

---

## KV Class

The main class for interacting with the key-value database.

### Constructor

```typescript
const db = new KV(options?)
```

### Options

You can customize the behavior of the KV store using the following options:

```typescript
const db = new KV({
  autoSync: true, // Enable/disable automatic synchronization (default: true)
  syncIntervalMs: 1000, // Synchronization interval in milliseconds (default: 1000)
  ledgerCacheSize: 100, // Ledger cache size in megabytes (default: 100)
  disableIndex: false, // Disable in-memory index (default: false)
});
```

#### Option Details

- **autoSync** (boolean): 
  - `true` (default): The in-memory index is automatically synchronized with the on-disk ledger in the background. This is recommended for multi-process scenarios.
  - `false`: Automatic synchronization is disabled. You'll need to call `db.sync()` manually to keep the index up-to-date with other processes.

- **syncIntervalMs** (number): Specifies the interval (in milliseconds) between automatic synchronization operations if autoSync is enabled. A shorter interval provides more up-to-date data but may introduce more overhead.

- **ledgerCacheSize** (number): Sets the maximum amount of ledger data (in megabytes) to cache in memory. A larger cache can improve read performance but consumes more memory. (Default `100`).

- **disableIndex** (boolean):
  - `false` (default): The in-memory index is enabled, allowing for efficient data retrieval and complex queries.
  - `true`: The in-memory index is disabled, resulting in faster loading times but preventing the use of get, iterate, scan, and list.

## Methods

### open()

Opens the KV store at the specified file path.

```typescript
async open(filepath: string, createIfMissing = true, ignoreReadErrors = false): Promise<void>
```

**Parameters:**
- `filepath`: Path to the database file
- `createIfMissing`: Create the file if it doesn't exist (default: true)
- `ignoreReadErrors`: Ignore read errors during initialization (default: false)

### set()

Stores a value associated with the given key.

```typescript
async set<T>(key: Key, value: T): Promise<void>
```

**Parameters:**
- `key`: Array of strings or numbers representing the key
- `value`: Any serializable JavaScript value

**Example:**
```typescript
await db.set(["users", 1, "profile"], { name: "Alice", age: 30 });
```

### get()

Retrieves the value associated with the specified key.

```typescript
async get<T>(key: Key): Promise<T | null>
```

**Returns:** The value associated with the key, or `null` if the key does not exist.

**Example:**
```typescript
const profile = await db.get(["users", 1, "profile"]);
```

### delete()

Removes the key-value pair identified by the key.

```typescript
async delete(key: Key): Promise<void>
```

**Example:**
```typescript
await db.delete(["users", 1, "profile"]);
```

### iterate()

Asynchronously iterates over the latest values matching the query.

```typescript
async *iterate<T>(query: Query, limit?: number, reverse?: boolean): AsyncIterableIterator<KVEntry<T>>
```

**Parameters:**
- `query`: Query pattern to match keys
- `limit`: Maximum number of entries to return (optional)
- `reverse`: Iterate in reverse order (optional)

**Example:**
```typescript
for await (const entry of db.iterate(["users"])) {
  console.log(entry.key, entry.value);
}
```

### listAll()

Retrieves all latest values matching the query as an array.

```typescript
async listAll<T>(query: Query, limit?: number, reverse?: boolean): Promise<KVEntry<T>[]>
```

**Example:**
```typescript
const users = await db.listAll(["users", { to: 10 }]);
```

### scan()

Asynchronously iterates over the transaction history for keys matching the query.

```typescript
async *scan<T>(query: Query, limit?: number, reverse?: boolean, ignoreReadErrors = false): AsyncIterableIterator<KVEntry<T>>
```

**Parameters:**
- `query`: Query pattern to match keys
- `limit`: Maximum number of entries to return (optional)
- `reverse`: Iterate in reverse order (optional)
- `ignoreReadErrors`: Ignore read errors during scanning (optional)

### listKeys()

Returns an array of all keys matching the given query.

```typescript
listKeys(query: Query): Key[]
```

**Example:**
```typescript
const keys = db.listKeys(["users"]);
```

### watch()

Registers a callback to be invoked whenever a matching transaction is added.

```typescript
watch<T>(query: Query, callback: WatchCallback<T>, recursive?: boolean): void
```

**Example:**
```typescript
db.watch(["users", {}, "interests"], (entry) => {
  console.log("New interest:", entry);
});
```

### unwatch()

Unregisters a previously registered watch handler.

```typescript
unwatch<T>(query: Query, callback: WatchCallback<T>): void
```

### beginTransaction()

Starts an atomic transaction.

```typescript
beginTransaction(): void
```

**Example:**
```typescript
db.beginTransaction();
try {
  await db.set(["key1"], "value1");
  await db.set(["key2"], "value2");
  await db.endTransaction(); // Commit
} catch (error) {
  // Transaction automatically rolled back on error
}
```

### endTransaction()

Commits all changes made within the transaction, or rolls back if errors occur.

```typescript
async endTransaction(): Promise<void>
```

### sync()

Manually synchronizes the in-memory index with the on-disk data store.

```typescript
async sync(ignoreReadErrors = false): Promise<void>
```

### vacuum()

Optimizes storage by removing redundant transaction history.

```typescript
async vacuum(ignoreReadErrors = false): Promise<void>
```

### on()

Subscribes to events like `sync`, `watchdogError`, or `closing`.

```typescript
on(eventName: string, callback: Function): void
```

**Example:**
```typescript
db.on("sync", (eventData) => {
  console.log("Sync result:", eventData.result);
});
```

### isOpen()

Returns true if the database is open and ready for operations.

```typescript
isOpen(): boolean
```

### defer()

Defers the resolution or rejection of a Promise until `.close()`.

```typescript
defer(promiseToHandle: Promise<any>, errorHandler?: Function, timeoutMs?: number): void
```

### close()

Closes the KV store, ensuring resources are released.

```typescript
async close(): Promise<void>
```

## Keys

Keys are arrays of strings or numbers:

- First element in a key must be a string
- Strings must only contain alphanumeric characters, hyphens, underscores or "@"

**Example Keys:**
```typescript
["users", 123]
["products", "category", { from: 10, to: 20 }]
```

## Values

Values (or documents) can be any JavaScript primitive or complex object containing CBOR-serializable types:

- Numbers: `12345`
- Strings: `"Hello, world!"`
- Booleans: `true`
- Arrays: `[1, 2, 3]`
- Objects: `{ "name": "Alice", "age": 30 }`
- Maps: `new Map([["key1", "value1"]])`
- Sets: `new Set([1, 2, 3])`
- Dates: `new Date()`
- `null`

## Queries

Queries are similar to keys but with additional support for ranges:

```typescript
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

## Next Steps

- See [Examples](examples) for practical usage patterns
- Learn about [Concurrency](concurrency) features
