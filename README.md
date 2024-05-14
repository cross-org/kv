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
  - `async listAll(query)` - Gets all entries for a key as an array.
  - `delete(key)` - Deletes a key-value pair.
  - `beginTransaction()` - Starts a transaction.
  - `async endTransaction()` - Ends a transaction, returns a list of `Errors` if
    any occurred.
  - `async vacuum()` - Reclaims storage space.
  - `on(eventName, eventData)` - Listen for events such as `sync`,
    `watchdogError` or `closing`.
  - `close()` - Closes the KV store.

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
- **null**

### Queries

Queries are basically keys, but with additional support for ranges, which are
objects like `{ from, to }`. An empty range (`{}`) means any document.

**Example queries**

```
// All users
["users"]       
// Specific user with ID 123          
["users", 123]            
// All products in any category
["products", "category"]  
// Products in category 10 to 20
["products", "category", { from: 10, to: 20 }] 
 // Sub document "specification" of products in category 10 to 20
["products", "category", { from: 10, to: 20 }, "specifications"]
// Sub-document "author" of any book
["products", "book", {}, "author"]
```

## Multi-Process Synchronization

`cross/kv` has a built in mechanism for synchronizing the in-memory index with
the transaction ledger, allowing for multiple processes to work with the same
database simultanously. Due to the append-only design of the ledger, each
process can update it's internal state by reading everything after the last
processed transaction. An internal watchdog actively checks for new transactions
and updates the in-memory index accordingly. The synchnization frequency can be
controlled by the option `syncIntervalMs`, which defaults to `1000` (1 second).

In single process scenarios, the watchdog can be disabled by setting the
`autoSync` option to `false`.

Subscribe to the `sync` event to receive notifications about synchronization
results and potential errors.

```typescript
const kvStore = new KV();
await kvStore.open("./mydatabase/");

// Subscribe to sync events for monitoring
kvStore.on("sync", (eventData) => {
  switch (eventData.result) {
    case "ready":
      console.log("Everything is up to date.");
      break;
    case "blocked":
      console.warn(
        "Synchronization is temporarily blocked (e.g., during vacuum).",
      );
      break;
    case "success":
      console.log(
        "Synchronization completed successfully, new transactions added to the index.",
      );
      break;
    case "ledgerInvalidated":
      console.warn(
        "Ledger invalidated! The database hash been reopened and the index resynchronized to maintain consistency.",
      );
      break;
    case "error":
      // Error Handling
      console.error("Synchronization error:", eventData.error);
      // Log the error, report it, or take appropriate action.
      break;
    default:
      console.warn("Unknown sync result:", eventData.result);
  }
});
```

## **Contributing**

Contributions are welcome! Feel free to open issues or submit pull requests.

## **License**

MIT License
