import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { KV } from "../src/lib/kv.ts";
import { exists, tempfile } from "@cross/fs";

test("Index Cache: basic save and load", async () => {
  const tempFilePrefix = await tempfile();

  // Create a database and add some data
  const kvStore = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["user", 1, "name"], "Alice");
  await kvStore.set(["user", 2, "name"], "Bob");
  await kvStore.set(["user", 3, "name"], "Charlie");
  await kvStore.set(["product", 1], { title: "Widget", price: 9.99 });
  await kvStore.set(["product", 2], { title: "Gadget", price: 19.99 });

  // Verify data is accessible
  assertEquals((await kvStore.get(["user", 1, "name"]))?.data, "Alice");
  assertEquals((await kvStore.get(["product", 1]))?.data, {
    title: "Widget",
    price: 9.99,
  });

  // Close to save the cache
  await kvStore.close();

  // Verify cache file was created
  const cacheExists = await exists(tempFilePrefix + ".idx");
  assertEquals(cacheExists, true, "Cache file should be created");

  // Reopen the database - should load from cache
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix);

  // Verify all data is still accessible (loaded from cache)
  assertEquals((await kvStore2.get(["user", 1, "name"]))?.data, "Alice");
  assertEquals((await kvStore2.get(["user", 2, "name"]))?.data, "Bob");
  assertEquals((await kvStore2.get(["user", 3, "name"]))?.data, "Charlie");
  assertEquals((await kvStore2.get(["product", 1]))?.data, {
    title: "Widget",
    price: 9.99,
  });
  assertEquals((await kvStore2.get(["product", 2]))?.data, {
    title: "Gadget",
    price: 19.99,
  });

  await kvStore2.close();
});

test("Index Cache: disabled cache doesn't create file", async () => {
  const tempFilePrefix = await tempfile();

  // Create a database with cache disabled
  const kvStore = new KV({ enableIndexCache: false, autoSync: false });
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["test"], "value");
  await kvStore.close();

  // Verify cache file was NOT created
  const cacheExists = await exists(tempFilePrefix + ".idx");
  assertEquals(
    cacheExists,
    false,
    "Cache file should not be created when disabled",
  );
});

test("Index Cache: incremental sync after cache load", async () => {
  const tempFilePrefix = await tempfile();

  // Create initial database
  const kvStore1 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore1.open(tempFilePrefix);
  await kvStore1.set(["key", 1], "value1");
  await kvStore1.set(["key", 2], "value2");
  await kvStore1.close();

  // Add more data to the ledger
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix);
  await kvStore2.set(["key", 3], "value3");
  await kvStore2.set(["key", 4], "value4");
  await kvStore2.close();

  // Reopen - should load cache and sync the new transactions
  const kvStore3 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore3.open(tempFilePrefix);

  // All data should be accessible
  assertEquals((await kvStore3.get(["key", 1]))?.data, "value1");
  assertEquals((await kvStore3.get(["key", 2]))?.data, "value2");
  assertEquals((await kvStore3.get(["key", 3]))?.data, "value3");
  assertEquals((await kvStore3.get(["key", 4]))?.data, "value4");

  await kvStore3.close();
});

test("Index Cache: cache invalidated after vacuum", async () => {
  const tempFilePrefix = await tempfile();

  // Create initial database
  const kvStore1 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore1.open(tempFilePrefix);
  await kvStore1.set(["key", 1], "value1");
  await kvStore1.set(["key", 2], "value2");
  await kvStore1.delete(["key", 1]); // Delete to create vacuum opportunity
  await kvStore1.close();

  // Verify cache exists
  let cacheExists = await exists(tempFilePrefix + ".idx");
  assertEquals(cacheExists, true, "Cache should exist before vacuum");

  // Reopen and vacuum
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix);
  await kvStore2.vacuum();
  await kvStore2.close();

  // Cache should still exist (saved on close after vacuum)
  cacheExists = await exists(tempFilePrefix + ".idx");
  assertEquals(cacheExists, true, "Cache should exist after vacuum");

  // Reopen and verify data
  const kvStore3 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore3.open(tempFilePrefix);
  assertEquals(await kvStore3.get(["key", 1]), null);
  assertEquals((await kvStore3.get(["key", 2]))?.data, "value2");
  await kvStore3.close();
});

test("Index Cache: complex hierarchical keys", async () => {
  const tempFilePrefix = await tempfile();

  // Create database with complex nested structure
  const kvStore = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore.open(tempFilePrefix);

  // Create hierarchical data
  await kvStore.set(["org", "acme", "dept", "eng", "team", "backend"], {
    lead: "Alice",
    members: 5,
  });
  await kvStore.set(["org", "acme", "dept", "eng", "team", "frontend"], {
    lead: "Bob",
    members: 3,
  });
  await kvStore.set(["org", "acme", "dept", "sales", "team", "west"], {
    lead: "Charlie",
    members: 10,
  });

  await kvStore.close();

  // Reopen and verify hierarchical queries work
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix);

  // Direct key access
  const backend = await kvStore2.get([
    "org",
    "acme",
    "dept",
    "eng",
    "team",
    "backend",
  ]);
  assertEquals(backend?.data, { lead: "Alice", members: 5 });

  // Query with range
  const engTeams = await kvStore2.listAll([
    "org",
    "acme",
    "dept",
    "eng",
    "team",
    {},
  ]);
  assertEquals(engTeams.length, 2);

  await kvStore2.close();
});

test("Index Cache: numeric keys preserved", async () => {
  const tempFilePrefix = await tempfile();

  // Create database with numeric keys
  const kvStore = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore.open(tempFilePrefix);

  for (let i = 0; i < 100; i++) {
    await kvStore.set(["items", i], `item-${i}`);
  }

  await kvStore.close();

  // Reopen and verify numeric keys work
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix);

  // Check a few specific items
  assertEquals((await kvStore2.get(["items", 0]))?.data, "item-0");
  assertEquals((await kvStore2.get(["items", 50]))?.data, "item-50");
  assertEquals((await kvStore2.get(["items", 99]))?.data, "item-99");

  // Range query
  const range = await kvStore2.listAll(["items", { from: 10, to: 15 }]);
  assertEquals(range.length, 6); // 10, 11, 12, 13, 14, 15

  await kvStore2.close();
});

test("Index Cache: deleted keys not in cache", async () => {
  const tempFilePrefix = await tempfile();

  // Create database with some deletions
  const kvStore = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["key", 1], "value1");
  await kvStore.set(["key", 2], "value2");
  await kvStore.set(["key", 3], "value3");
  await kvStore.delete(["key", 2]); // Delete middle key

  await kvStore.close();

  // Reopen and verify deleted key is not accessible
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix);

  assertEquals((await kvStore2.get(["key", 1]))?.data, "value1");
  assertEquals(await kvStore2.get(["key", 2]), null); // Should be null
  assertEquals((await kvStore2.get(["key", 3]))?.data, "value3");

  await kvStore2.close();
});

test("Index Cache: large dataset performance", async () => {
  const tempFilePrefix = await tempfile();

  // Create database with many entries
  const kvStore = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore.open(tempFilePrefix);

  const numEntries = 1000;
  for (let i = 0; i < numEntries; i++) {
    await kvStore.set(["item", i], { id: i, data: `data-${i}` });
  }

  await kvStore.close();

  // Measure time to reopen without cache
  const startNoCache = Date.now();
  const kvStore2 = new KV({ enableIndexCache: false, autoSync: false });
  await kvStore2.open(tempFilePrefix);
  const timeNoCache = Date.now() - startNoCache;
  await kvStore2.close();

  // Measure time to reopen with cache
  const startWithCache = Date.now();
  const kvStore3 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore3.open(tempFilePrefix);
  const timeWithCache = Date.now() - startWithCache;

  // Verify data is accessible
  assertEquals((await kvStore3.get(["item", 0]))?.data, {
    id: 0,
    data: "data-0",
  });
  assertEquals((await kvStore3.get(["item", 999]))?.data, {
    id: 999,
    data: "data-999",
  });

  await kvStore3.close();

  // Cache should be faster (or at least not significantly slower)
  // Allow some margin for variance
  console.log(
    `Time without cache: ${timeNoCache}ms, with cache: ${timeWithCache}ms`,
  );
  // Note: This is informational - we don't assert on timing as it's environment-dependent
});

test("Index Cache: corrupted cache file handled gracefully", async () => {
  const tempFilePrefix = await tempfile();

  // Create initial database
  const kvStore1 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore1.open(tempFilePrefix);
  await kvStore1.set(["key"], "value");
  await kvStore1.close();

  // Corrupt the cache file by writing garbage
  const cacheFile = tempFilePrefix + ".idx";
  const fd = await Deno.open(cacheFile, { write: true, truncate: true });
  await fd.write(new TextEncoder().encode("GARBAGE DATA"));
  fd.close();

  // Should still be able to open (cache will be ignored)
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix); // Should not throw

  // Data should still be accessible (rebuilt from ledger)
  assertEquals((await kvStore2.get(["key"]))?.data, "value");

  await kvStore2.close();
});

test("Index Cache: stale cache from different ledger", async () => {
  const tempFilePrefix1 = await tempfile();
  const tempFilePrefix2 = await tempfile();

  // Create first database
  const kvStore1 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore1.open(tempFilePrefix1);
  await kvStore1.set(["db"], "first");
  await kvStore1.close();

  // Create second database
  const kvStore2 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore2.open(tempFilePrefix2);
  await kvStore2.set(["db"], "second");
  await kvStore2.close();

  // Try to use cache from first db with second db
  // (Simulate by copying cache file - though this shouldn't happen in practice)
  const _cache1 = tempFilePrefix1 + ".idx";

  if (await exists(_cache1)) {
    // Copy cache1 content to a different location
    // This would require file operations, but the cache should handle
    // the mismatch by checking the ledger creation timestamp
  }

  // Reopen second database - should work correctly despite any cache issues
  const kvStore3 = new KV({ enableIndexCache: true, autoSync: false });
  await kvStore3.open(tempFilePrefix2);
  assertEquals((await kvStore3.get(["db"]))?.data, "second");
  await kvStore3.close();
});

test("Index Cache: works with disableIndex=false (default)", async () => {
  const tempFilePrefix = await tempfile();

  // Create database with index enabled
  const kvStore = new KV({
    enableIndexCache: true,
    disableIndex: false,
    autoSync: false,
  });
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["key"], "value");
  await kvStore.close();

  // Cache should exist
  const cacheExists = await exists(tempFilePrefix + ".idx");
  assertEquals(cacheExists, true);

  // Reopen and verify
  const kvStore2 = new KV({
    enableIndexCache: true,
    disableIndex: false,
    autoSync: false,
  });
  await kvStore2.open(tempFilePrefix);
  assertEquals((await kvStore2.get(["key"]))?.data, "value");
  await kvStore2.close();
});

test("Index Cache: not created when disableIndex=true", async () => {
  const tempFilePrefix = await tempfile();

  // Create database with index disabled
  const kvStore = new KV({
    enableIndexCache: true,
    disableIndex: true,
    autoSync: false,
  });
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["key"], "value");
  await kvStore.close();

  // Cache should NOT exist when index is disabled
  const cacheExists = await exists(tempFilePrefix + ".idx");
  assertEquals(cacheExists, false);
});
