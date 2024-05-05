Here's an extended README that builds upon your initial draft, providing a more
comprehensive overview of your `cross/kv` project.

**cross/kv**

## Efficient cross-runtime Key/Value database for JavaScript and TypeScript

### **Features**

- **Simple Key/Value Storage:** Store and retrieve data easily using
  hierarchical keys.
- **Cross-Runtime Compatibility:** Works in Node.js, Deno, browser environments,
  and potentially other JavaScript runtimes.
- **Flexible Data Types:** Support for strings, numbers, objects, dates, and
  more.
- **Hierarchical Structure:** Organize data with multi-level keys for a logical
  structure.
- **Key Ranges:** Retrieve ranges of data efficiently using `KVKeyRange`
  objects.
- **Indexed:** Data is indexed to provide faster lookups (detail how your
  indexing works).

### **Installation**

```bash
# Using npm
npm install cross/kv

# Using Deno
deno install --unstable -A https://deno.land/x/cross/kv@<version>/mod.ts
```

Replace `<version>` with the desired version of the package.

### **Simple Usage**

```typescript
import { CrossKV } from "@cross/kv";

const kvStore = new CrossKV();
await kvStore.open("./mydatabase/"); // Path where data files will be stored

// Set a value
await kvStore.set(["data", "username"], "Alice");

// Get a value
const username = await kvStore.get(["data", "username"]);
console.log(username); // Output: 'Alice'

// Delete a key
await kvStore.delete(["data", "username"]);

// Close the database
await kvStore.close();
```

### **Advanced Usage**

```typescript
import { CrossKV } from "@cross/kv";

// Create an instance
const kvStore = new CrossKV();

// Open the database
await kvStore.open("./lab/db19");

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

- `CrossKV` class
  - `open(filepath)`
  - `set(key, value)`
  - `get(key)`
  - `getMany(key)`
  - `delete(key)`
  - `sync()`
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
