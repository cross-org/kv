# cross/kv: A Fast Key/Value Database for Node, Deno and Bun.

A cross-platform, in-memory indexed and file based Key/Value database for
JavaScript and TypeScript, designed for seamless multi-process access and
compatibility across Node.js, Deno, and Bun.

_Please note that `cross/kv` is currently in **beta**. The API and features are
starting to stabilize, but are still subject to change._

## Features

- **Indexed Key/Value Storage**: Store and retrieve data easily using
  hierarchical keys, with an in-memory index to provide fast lookups of large
  datasets.
- **Transaction-Based Storage:** Uses a single append-only transaction ledger to
  store data, ensuring durability and recoverability.
- **Vacuuming:** Supports vacuuming the ledger to reclaim disk space used by
  deletion transactions and deleted documents.
- **Multi-Process Support**: Multiple processes can safely access and modify the
  same database concurrently, index updates are distributed automatically.
- **Cross-Runtime Compatibility:** Works in Node.js, Deno and Bun.
- **Flexible Data Types**: Store any JavaScript object, including complex types
  like Maps and Sets.
- **Key Ranges:** Retrieve ranges of data efficiently directly from the index
  using key ranges.

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

## Simple Usage

```typescript
import { KV } from "@cross/kv";

const kvStore = new KV();

await kvStore.open("./mydatabase/"); // Path where data files will be stored

// Set a value
await kvStore.set(["data", "username"], "Alice");

// Get a value
const username = await kvStore.get(["data", "username"]);
console.log(username); // Output: { ts: <numeric timestamp>, data "Alice" }

// Delete a key
await kvStore.delete(["data", "username"]);

// Close the database
await kvStore.close();
```

## Advanced Usage

```typescript
import { KV } from "@cross/kv";

// Create an instance
const kvStore = new KV();

// Open the database
await kvStore.open("./mydatabase/");

// Store some values/documents indexed by users.by_id.<id>
await kvStore.set(["users", "by_id", 1], {
  name: "Bob",
  created: new Date(),
  interests: new Set(["fishing", "hunting"]),
});
await kvStore.set(["users", "by_id", 2], {
  name: "Alice",
  created: new Date(),
  interests: new Set(["singing", "hunting"]),
});
await kvStore.set(["users", "by_id", 3], {
  name: "Ben",
  created: new Date(),
  interests: new Set(["singing", "fishing"]),
});
await kvStore.set(["users", "by_id", 4], {
  name: "Lisa",
  created: new Date(),
  interests: new Set(["reading", "fighting"]),
});
await kvStore.set(["users", "by_id", 5], {
  name: "Jan",
  created: new Date(),
  interests: new Set(["cooking", "fighting"]),
});

// Use the index to select users between 2 and 4
const query = ["users", "by_id", { from: 2, to: 4 }];
// ... will display Document count: 3
console.log("Document count: " + kvStore.count(query));
// ... will output the objects of Alice, Ben and Lisa
for await (const entry of kvStore.iterate(query)) {
  console.log(entry);
}

// Use a plain JavaScript filter (less performant) to find a user named ben
const ben = (await kvStore.listAll(["users"])).filter((user) =>
  user.data.name === "Ben"
);
console.log("Ben: ", ben); // Outputs the object of Ben

// Make sure the in-memory database is in sync with storage
await kvStore.close();
```

## API Documentation

### Methods

- `KV(options)` - Main class. Options such as `autoSync` and `syncIntervalMs`
  are optional.
  - `async open(filepath)` - Opens the KV store.
  - `async set(key, value)` - Stores a value.
  - `async get(key)` - Retrieves a value.
  - `async *iterate(query)` - Iterates over entries for a key.
  - `listKeys(query)` - List all keys under <query>.
  - `async listAll(query)` - Gets all entries for a key as an array.
  - `async delete(key)` - Deletes a key-value pair.
  - `async sync()` - Synchronizez the ledger with disk.
  - `beginTransaction()` - Starts a transaction.
  - `async endTransaction()` - Ends a transaction, returns a list of `Errors` if
    any occurred.
  - `async vacuum()` - Reclaims storage space.
  - `on(eventName, eventData)` - Listen for events such as `sync`,
    `watchdogError` or `closing`.
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
await kvStore.open("./mydatabase/");

kvStore.on("sync", (eventData) => {
  switch (eventData.result) {
    case "ready": // No new updates
    case "blocked": // Synchronization temporarily blocked (e.g., during vacuum)
    case "success": // Synchronization successful, new transactions added
    case "ledgerInvalidated": // Ledger recreated, database reopened and index resynchronized
    case "error": // An error occurred during synchronization
  }
});
```

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

The task `deno task check` runs all tests, and is a good pre-commit check.
`deno task check-coverage` do require `genhtml` available through the `lcov`
package in most distributions.

## **License**

MIT License
