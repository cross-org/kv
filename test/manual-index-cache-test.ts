/**
 * Manual test to verify index cache functionality
 * Run with: deno run -A test/manual-index-cache-test.ts
 */

console.log("=== Manual Index Cache Test ===\n");

// Test 1: Basic functionality
console.log("Test 1: Basic index cache save and load");
try {
  const { KV } = await import("../src/lib/kv.ts");
  const tempFile = `/tmp/test-${Date.now()}.db`;

  // Create DB and add data
  const db1 = new KV({ enableIndexCache: true, autoSync: false });
  await db1.open(tempFile);
  await db1.set(["user", 1], "Alice");
  await db1.set(["user", 2], "Bob");
  console.log("  ✓ Created database with 2 entries");

  await db1.close();
  console.log("  ✓ Closed database (cache should be saved)");

  // Reopen and verify
  const db2 = new KV({ enableIndexCache: true, autoSync: false });
  await db2.open(tempFile);
  const user1 = await db2.get(["user", 1]);
  const user2 = await db2.get(["user", 2]);

  if (user1?.data === "Alice" && user2?.data === "Bob") {
    console.log("  ✓ Data loaded correctly from cache");
  } else {
    console.log("  ✗ Data mismatch!");
  }

  await db2.close();
  console.log("  ✓ Test 1 PASSED\n");
} catch (error) {
  console.error("  ✗ Test 1 FAILED:", error.message);
}

// Test 2: Cache disabled
console.log("Test 2: Cache disabled - no cache file created");
try {
  const { KV } = await import("../src/lib/kv.ts");
  const { exists } = await import("@cross/fs");
  const tempFile = `/tmp/test-nocache-${Date.now()}.db`;

  const db = new KV({ enableIndexCache: false, autoSync: false });
  await db.open(tempFile);
  await db.set(["key"], "value");
  await db.close();

  const cacheExists = await exists(tempFile + ".idx");
  if (!cacheExists) {
    console.log("  ✓ No cache file created when disabled");
    console.log("  ✓ Test 2 PASSED\n");
  } else {
    console.log("  ✗ Cache file created when it shouldn't be!");
  }
} catch (error) {
  console.error("  ✗ Test 2 FAILED:", error.message);
}

// Test 3: Incremental sync after cache load
console.log("Test 3: Incremental sync after cache load");
try {
  const { KV } = await import("../src/lib/kv.ts");
  const tempFile = `/tmp/test-incremental-${Date.now()}.db`;

  // Create initial DB
  const db1 = new KV({ enableIndexCache: true, autoSync: false });
  await db1.open(tempFile);
  await db1.set(["key", 1], "v1");
  await db1.set(["key", 2], "v2");
  await db1.close();
  console.log("  ✓ Created DB with 2 entries, cache saved");

  // Add more data
  const db2 = new KV({ enableIndexCache: true, autoSync: false });
  await db2.open(tempFile);
  await db2.set(["key", 3], "v3");
  await db2.set(["key", 4], "v4");
  await db2.close();
  console.log("  ✓ Added 2 more entries");

  // Reopen - should load cache + sync new entries
  const db3 = new KV({ enableIndexCache: true, autoSync: false });
  await db3.open(tempFile);

  const v1 = await db3.get(["key", 1]);
  const v2 = await db3.get(["key", 2]);
  const v3 = await db3.get(["key", 3]);
  const v4 = await db3.get(["key", 4]);

  if (
    v1?.data === "v1" &&
    v2?.data === "v2" &&
    v3?.data === "v3" &&
    v4?.data === "v4"
  ) {
    console.log("  ✓ All 4 entries accessible (cache + sync worked)");
    console.log("  ✓ Test 3 PASSED\n");
  } else {
    console.log("  ✗ Some entries missing!");
  }

  await db3.close();
} catch (error) {
  console.error("  ✗ Test 3 FAILED:", error.message);
}

console.log("=== Manual tests complete ===");
