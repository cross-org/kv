---
title: "Overview"
nav_order: 1
---

# @cross/kv

---

A fast, lightweight, powerful and cross-platform key-value database for Node.js, Deno, and Bun.

[![JSR](https://jsr.io/badges/@cross/kv)](https://jsr.io/@cross/kv)
[![JSR Score](https://jsr.io/badges/@cross/kv/score)](https://jsr.io/@cross/kv)

## Quick Start

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

## Features

- **Cross-Platform & Multi-Process:** Built with pure TypeScript for seamless compatibility across Node.js, Deno, and Bun, with built-in support for concurrent access by multiple processes.
- **Powerful:** Supports hierarchical keys, flexible mid-key range queries, and real-time data change notifications through `.watch()`.
- **Simple and Fast:** Lightweight and performant storage with an in-memory index for efficient data retrieval.
- **Durable:** Ensures data integrity and reliability by storing each database as a single, append-only transaction ledger.
- **Type-Safe:** Leverages TypeScript generics for enhanced type safety when setting and retrieving values.
- **Atomic Transactions:** Guarantees data consistency by grouping multiple operations into indivisible units, which also improves performance.
- **Flexible:** Store any serializable JavaScript object (except functions and WeakMaps), and customize synchronization behavior to optimize for your specific use case.

## What's Next?

- Learn about [Installation](installation)
- Explore the [API Documentation](api)
- Check out [Examples](examples)
- Review [Concurrency](concurrency) features
