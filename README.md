# cross/kv: A Fast Key/Value Database for Node, Deno and Bun.

[![JSR](https://jsr.io/badges/@cross/kv)](https://jsr.io/@cross/kv)
[![JSR Score](https://jsr.io/badges/@<scope>/@cross/kv)](https://jsr.io/@cross/kv)

An in-memory indexed and file based Key/Value database for JavaScript and
TypeScript, designed for seamless multi-process access and compatibility across
Node.js, Deno, and Bun.

```typescript
import { KV } from "@cross/kv";

// Create an instance
const db = new KV();
await db.open("data/mydatabase.db");

// Listen for new interests
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

// Display all contact information connected to users with id < 10
console.log(await db.listAll(["users", { to: 10 }, "contact"]));

db.close();
```

## Features

- **Efficient Key-Value Storage:** Rapid storage and retrieval using
  hierarchical keys and a high-performance in-memory index.
- **Durable Transactions:** Ensure data integrity and recoverability through an
  append-only transaction ledger.
- **Atomic Transactions:** Guarantee data consistency by grouping multiple
  operations into a single, indivisible unit.
- **Optimized Storage:** Reclaim disk space and maintain performance through
  vacuuming operations.
- **Cross-Platform & Multi-Process:** Built in pure TypeScript, working
  seamlessly across Node.js, Deno, and Bun, supporting concurrent access by
  multiple processes.
- **Flexible & Customizable:** Store any JavaScript object, subscribe to data
  changes, and fine-tune synchronization behavior.

## Installation

Full installation instructions available at <https://jsr.io/@cross/kv>

```bash
# Using npm
npx jsr add @cross/kv

# Using Deno
deno add @cross/kv

# Using bun
bunx jsr add @cross/kv
```

## API Documentation

### Methods

- `KV(options)` - Main class. Options such as `autoSync` and `syncIntervalMs`
  are optional.
  - `async open(filepath, createIfMissing)` - Opens the KV store.
    `createIfMissing` defaults to true.
  - `async set(key, value)` - Stores a value.
  - `async get(key)` - Retrieves a value.
  - `async *iterate(query)` - Iterates over entries for a key.
  - `listKeys(query)` - List all keys under <query>.
  - `async listAll(query)` - Gets all entries for a key as an array.
  - `async delete(key)` - Deletes a key-value pair.
  - `async sync()` - Synchronizez the ledger with disk.
  - `watch(query, callback, recursive): void` - Registers a callback to be
    called whenever a new transaction matching the given query is added to the
    database.
  - `unwatch(query, callback): void` - Unregisters a previously registered watch
    handler.
  - `beginTransaction()` - Starts an atomic transaction.
  - `async endTransaction()` - Ends an atomic transaction, returns a list of
    `Errors` if any occurred.
  - `async vacuum()` - Reclaims storage space.
  - `on(eventName, eventData)` - Listen for events such as `sync`,
    `watchdogError` or `closing`.
  - `isOpen()` - Returns true if the database is open and ready for
    transactions.
  - `async close()` - Closes the KV store.

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

Queries are basically keys, but with additional support for ranges, which are
objects like `{ from: 5, to: 20 }` or `{ from: "a", to: "l" }`. An empty range
(`{}`) means any document.

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

## Concurrency

`cross/kv` has a built-in mechanism for synchronizing the in-memory index with
the transaction ledger, allowing multiple processes to work with the same
database simultaneously.

Due to the append-only design of the ledger, each process can update its
internal state by reading all new transactions appended since the last processed
transaction.

### Single-Process Synchronization

In single-process scenarios, explicit synchronization is unnecessary. You can
disable automatic synchronization by setting the `autoSync` option to false, and
do not have to care about running `.sync()`. This can improve performance when
only one process is accessing the database.

### Multi-Process Synchronisation

In multi-process scenarios, synchronization is crucial to ensure data
consistency across different processes. `cross/kv` manages synchronization in
the following ways:

- **Automatic Index Synchronization:** The index is automatically synchronized
  at a set interval (default: 1000ms), ensuring that changes made by other
  processes are reflected in all instances within a maximum of `syncIntervalMs`
  milliseconds. You can adjust this interval using the `syncIntervalMs` option.

- **Manual Synchronization for Reads:** When reading data, you have two options:

  - **Accept Potential Inconsistency:** By default, reads do not trigger an
    immediate synchronization, which can lead to a small window of inconsistency
    if another process has recently written to the database. This is generally
    acceptable for most use cases.

  - **Force Synchronization:** For strict consistency, you can manually trigger
    synchronization before reading using the `.sync()` method:

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
    case "blocked": // Synchronization temporarily blocked (e.g., during vacuum)
    case "success": // Synchronization successful, new transactions added
    case "ledgerInvalidated": // Ledger recreated, database reopened and index resynchronized
    case "error": // An error occurred during synchronization
    default:
      // Handle unexpected eventData.result values if needed
  }
});

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

The task `deno task check` runs all tests, and is a good pre-commit check.
`deno task check-coverage` do require `genhtml` available through the `lcov`
package in most distributions.

## **License**

MIT License
```
