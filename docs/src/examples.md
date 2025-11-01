---
title: "Examples"
nav_order: 4
---

# Examples

---

## Basic Usage

### Creating and Opening a Database

```typescript
import { KV } from "@cross/kv";

const db = new KV();
await db.open("data/mydatabase.db");
```

### Setting and Getting Values

```typescript
// Store a simple value
await db.set(["users", 1], { name: "Alice", email: "alice@example.com" });

// Retrieve the value
const user = await db.get(["users", 1]);
console.log(user); // { name: "Alice", email: "alice@example.com" }
```

### Deleting Values

```typescript
await db.delete(["users", 1]);
const user = await db.get(["users", 1]);
console.log(user); // null
```

## Hierarchical Keys

### Storing Nested Data

```typescript
// Store user profile
await db.set(["users", 1, "profile"], {
  name: "Bob",
  age: 30,
});

// Store user settings
await db.set(["users", 1, "settings"], {
  theme: "dark",
  notifications: true,
});

// Store user contacts
await db.set(["users", 1, "contacts"], {
  phone: "+1234567890",
  address: "123 Main St",
});
```

### Querying by Prefix

```typescript
// Get all data for user 1
const userData = await db.listAll(["users", 1]);
console.log(userData);
```

## Range Queries

### Querying with Ranges

```typescript
// Store products
await db.set(["products", 1], { name: "Widget", price: 10 });
await db.set(["products", 2], { name: "Gadget", price: 20 });
await db.set(["products", 3], { name: "Doohickey", price: 30 });
await db.set(["products", 4], { name: "Thingamajig", price: 40 });

// Get products with IDs from 2 to 3
const products = await db.listAll(["products", { from: 2, to: 3 }]);
console.log(products);
// [
//   { key: ["products", 2], value: { name: "Gadget", price: 20 } },
//   { key: ["products", 3], value: { name: "Doohickey", price: 30 } }
// ]
```

### Mid-Key Range Queries

```typescript
// Store category-based products
await db.set(["products", "electronics", 1], { name: "Laptop" });
await db.set(["products", "electronics", 2], { name: "Phone" });
await db.set(["products", "books", 1], { name: "Novel" });
await db.set(["products", "books", 2], { name: "Textbook" });

// Get all electronics
const electronics = await db.listAll(["products", "electronics"]);

// Get electronics with ID range
const someElectronics = await db.listAll([
  "products",
  "electronics",
  { from: 1, to: 1 },
]);
```

## Watching for Changes

### Basic Watch

```typescript
// Watch for any changes to user 1's interests
db.watch(["users", 1, "interests"], (entry) => {
  console.log("User 1 interests updated:", entry.value);
});

// This will trigger the watch callback
await db.set(["users", 1, "interests"], ["coding", "gaming"]);
```

### Pattern Matching with Wildcards

```typescript
// Watch for any user's interests using empty range {}
db.watch(["users", {}, "interests"], (entry) => {
  const userId = entry.key[1];
  console.log(`User ${userId} interests updated:`, entry.value);
});

// Both of these will trigger the watch callback
await db.set(["users", 1, "interests"], ["coding"]);
await db.set(["users", 2, "interests"], ["sports"]);
```

### Unwatching

```typescript
const callback = (entry) => {
  console.log("Changed:", entry);
};

db.watch(["users"], callback);

// Later, stop watching
db.unwatch(["users"], callback);
```

## Iteration

### Iterating Over Entries

```typescript
// Store multiple users
for (let i = 1; i <= 10; i++) {
  await db.set(["users", i], { id: i, name: `User ${i}` });
}

// Iterate over all users
for await (const entry of db.iterate(["users"])) {
  console.log(entry.key, entry.value);
}
```

### Limited Iteration

```typescript
// Get only the first 5 users
for await (const entry of db.iterate(["users"], 5)) {
  console.log(entry.key, entry.value);
}
```

### Reverse Iteration

```typescript
// Iterate in reverse order
for await (const entry of db.iterate(["users"], undefined, true)) {
  console.log(entry.key, entry.value);
}
```

## Transactions

### Atomic Operations

```typescript
// Start a transaction
db.beginTransaction();

try {
  // Multiple operations in a transaction
  await db.set(["accounts", "checking", "balance"], 1000);
  await db.set(["accounts", "savings", "balance"], 5000);
  await db.set(["accounts", "metadata", "lastUpdated"], new Date());

  // Commit the transaction
  await db.endTransaction();
  console.log("Transaction committed successfully");
} catch (error) {
  console.error("Transaction failed:", error);
  // Transaction is automatically rolled back on error
}
```

### Transfer Example

```typescript
async function transfer(from: string, to: string, amount: number) {
  db.beginTransaction();

  try {
    const fromBalance = (await db.get(["accounts", from, "balance"])) as number;
    const toBalance = (await db.get(["accounts", to, "balance"])) as number;

    if (fromBalance < amount) {
      throw new Error("Insufficient funds");
    }

    await db.set(["accounts", from, "balance"], fromBalance - amount);
    await db.set(["accounts", to, "balance"], toBalance + amount);

    await db.endTransaction();
    console.log(`Transferred ${amount} from ${from} to ${to}`);
  } catch (error) {
    console.error("Transfer failed:", error);
  }
}

await transfer("checking", "savings", 100);
```

## Event Handling

### Monitoring Sync Events

```typescript
const db = new KV();
await db.open("data/mydatabase.db");

db.on("sync", (eventData) => {
  switch (eventData.result) {
    case "ready":
      console.log("No new updates");
      break;
    case "success":
      console.log("Synchronization successful, new transactions added");
      break;
    case "ledgerInvalidated":
      console.log(
        "Ledger recreated, database reopened and index resynchronized",
      );
      break;
    case "error":
      console.error(
        "An error occurred during synchronization:",
        eventData.error,
      );
      break;
  }
});
```

## Advanced Usage

### Custom Synchronization

```typescript
// Disable auto-sync for manual control
const db = new KV({
  autoSync: false,
});

await db.open("data/mydatabase.db");

// Manually sync before reading
await db.sync();
const data = await db.get(["my", "key"]);
```

### Optimizing Storage

```typescript
// Vacuum the database to remove old transaction history
await db.vacuum();
console.log("Database optimized");
```

### Working with Different Value Types

```typescript
// String
await db.set(["config", "name"], "MyApp");

// Number
await db.set(["config", "version"], 1);

// Boolean
await db.set(["config", "enabled"], true);

// Array
await db.set(["config", "tags"], ["tag1", "tag2", "tag3"]);

// Date
await db.set(["config", "created"], new Date());

// Map
await db.set(
  ["config", "mapping"],
  new Map([["key1", "value1"], ["key2", "value2"]]),
);

// Set
await db.set(["config", "unique"], new Set([1, 2, 3]));

// Complex nested object
await db.set(["config", "settings"], {
  ui: {
    theme: "dark",
    fontSize: 14,
  },
  features: {
    experimental: true,
    beta: ["feature1", "feature2"],
  },
});
```

## Next Steps

- Learn about [Concurrency](concurrency) features
- Review the complete [API Documentation](api)
