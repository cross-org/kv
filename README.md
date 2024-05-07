**cross/kv**

A cross-platform, hierarchical Key/Value database for JavaScript and TypeScript,
designed to work in all major runtimes (Node.js, Deno, and Bun).

### **Features**

- **Simple Key/Value Storage:** Store and retrieve data easily using
  hierarchical keys.
- **Cross-Runtime Compatibility:** Works in Node.js, Deno and Bun.
- **Flexible Data Types:** Support for strings, numbers, objects, dates, maps,
  sets and more.
- **Hierarchical Structure:** Organize data with multi-level keys for a logical
  structure.
- **Key Ranges:** Retrieve ranges of data efficiently using key ranges.
- **Indexed:** In-memory index to provide faster lookups of large datasets.

### **Installation**

Full installation instructions available at <https://jsr.io/@cross/kv>

```bash
# Using npm
npx jsr add @cross/kv

# Using Deno
deno add @cross/kv

# Using bun
bunx jsr add @cross/kv
```

### **Simple Usage**

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

### **Advanced Usage**

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
console.log(
  "Users 2-4:",
  await kvStore.getMany(["users", "by_id", { from: 2, to: 4 }]),
);
// ... will output the objects of Alice, Ben and Lisa

// Use a plain JavaScript filter (less performant) to find a user named ben
const ben = (await kvStore.getMany(["users"])).filter((user) =>
  user.name === "Ben"
);
console.log("Ben: ", ben); // Outputs the object of Ben

// Make sure the in-memory database is in sync with storage
await kvStore.close();
```

### **API Documentation**

- `KV` class
  - `open(filepath)`
  - `set(key, value, overwrite?)`
  - `get(key)`
  - `getMany(key)`
  - `delete(key)`
  - `beginTransaction()`
  - `endTransaction()`
  - `close()`
- `KVKey` class (Detail the constructor and methods)
- `KVKeyRange` interface

### **Contributing**

Contributions are welcome! Feel free to open issues or submit pull requests.

### **License**

MIT License

**Work in Progress Disclaimer**

Please note that `cross/kv` is still under development. The API and features
might be subject to change.
