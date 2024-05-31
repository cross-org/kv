import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { KV, type KVOptions } from "../src/lib/kv.ts";
import { tempfile } from "@cross/fs";
import { SYNC_INTERVAL_MS } from "../src/lib/constants.ts";
import {
  KVOperation,
  type KVTransactionResult,
} from "../src/lib/transaction.ts";
import type { KVQuery } from "../mod.ts";

test("KV: set, get and delete (numbers and strings)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["name"], "Alice");
  await kvStore.set(["age"], 30);

  assertEquals((await kvStore.get(["name"]))?.data, "Alice");
  assertEquals((await kvStore.get(["age"]))?.data, 30);

  await kvStore.delete(["name"]);

  assertEquals(await kvStore.get(["name"]), null);
  assertEquals((await kvStore.get(["age"]))?.data, 30);

  await kvStore.close();
});

test("KV: set, get and delete (numbers and strings, without sync)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);
  const kvStore2 = new KV();
  await kvStore2.open(tempFilePrefix);
  await kvStore.set(["name"], "Alice");
  await kvStore.set(["age"], 30);
  assertEquals((await kvStore2.get(["name"]))?.data, undefined);
  assertEquals((await kvStore2.get(["age"]))?.data, undefined);
  await kvStore.close();
  await kvStore2.close();
});

test("KV: set, get and delete (numbers and strings, with sync)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);
  const kvStore2 = new KV();
  await kvStore2.open(tempFilePrefix);
  await kvStore.set(["name"], "Alice");
  await kvStore.set(["age"], 30);
  await kvStore2.sync();
  assertEquals((await kvStore2.get(["name"]))?.data, "Alice");
  assertEquals((await kvStore2.get(["age"]))?.data, 30);
  await kvStore.close();
  await kvStore2.close();
});

test("KV: set, get and delete (big numbers)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);
  await kvStore.set(
    ["num", 1],
    54645645646546345634523452345234545464,
  );

  assertEquals(
    (await kvStore.get(["num", 1]))?.data,
    54645645646546345634523452345234545464,
  );

  kvStore.close();

  const kvStore2 = new KV({ autoSync: false });
  await kvStore2.open(tempFilePrefix);
  await kvStore2.sync();
  assertEquals(
    (await kvStore2.get(["num", 1]))?.data,
    54645645646546345634523452345234545464,
  );

  kvStore2.close();
});

test("KV: set, get and delete (objects)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["name"], { data: "Alice" });
  await kvStore.set(["age"], { data: 30 });

  assertEquals((await kvStore.get(["name"]))?.data, { data: "Alice" });
  assertEquals((await kvStore.get(["age"]))?.data, { data: 30 });

  await kvStore.delete(["name"]);

  assertEquals(await kvStore.get(["name"]), null);
  assertEquals((await kvStore.get(["age"]))?.data, { data: 30 });

  await kvStore.close();
});

test("KV: set, get and delete (dates)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);
  const date = new Date();
  await kvStore.set(["pointintime"], date);
  assertEquals(
    ((await kvStore.get(["pointintime"]))!.data! as Date).getTime(),
    date.getTime(),
  );
  assertEquals(
    (await kvStore.get(["pointintime"]))?.data?.toLocaleString(),
    date.toLocaleString(),
  );
  await kvStore.delete(["pointintime"]);
  assertEquals(await kvStore.get(["pointintime"]), null);

  await kvStore.close();
});

test("KV: supports multi-level nested keys", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["data", "user", "name"], "Alice");
  await kvStore.set(["data", "system", "version"], 1.2);

  assertEquals((await kvStore.get(["data", "user", "name"]))?.data, "Alice");
  assertEquals((await kvStore.get(["data", "system", "version"]))?.data, 1.2);

  await kvStore.close();
});

test("KV: supports multi-level nested keys with numbers", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["data", "user", 4], "Alice");
  await kvStore.set(["data", "system", 4], 1.2);

  assertEquals((await kvStore.get(["data", "user", 4]))?.data, "Alice");
  assertEquals((await kvStore.get(["data", "system", 4]))?.data, 1.2);
  assertEquals(await kvStore.get(["data", "system", 5]), null);

  await kvStore.close();
});

test("KV: supports numeric key ranges", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Set some values within a range
  for (let i = 5; i <= 10; i++) {
    await kvStore.set(["data", i], `Value ${i}`);
  }

  // Test if the 'get' function returns the expected values
  const rangeGenerator = kvStore.iterate(["data", { from: 7, to: 9 }]);
  const entry1 = await rangeGenerator.next();
  const entry2 = await rangeGenerator.next();
  const entry3 = await rangeGenerator.next();
  const entry4 = await rangeGenerator.next();
  assertEquals(entry4.done, true);
  assertEquals(entry1.value.data, "Value 7");
  assertEquals(entry2.value.data, "Value 8");
  assertEquals(entry3.value.data, "Value 9");
  await kvStore.close();
});

test("KV: supports additional levels after numeric key ranges", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Set some values within a range
  for (let i = 5; i <= 10; i++) {
    await kvStore.set(["data", i, "doc1"], `Value ${i} in doc1`);
    await kvStore.set(["data", i, "doc2"], `Value ${i} in doc2`);
  }

  // Test if the 'get' function returns the expected values
  const rangeGenerator = kvStore.iterate([
    "data",
    { from: 7, to: 9 },
    "doc1",
  ]);
  const entry1 = await rangeGenerator.next();
  const entry2 = await rangeGenerator.next();
  const entry3 = await rangeGenerator.next();
  const entry4 = await rangeGenerator.next();
  assertEquals(entry4.done, true);
  assertEquals(entry1.value.data, "Value 7 in doc1");
  assertEquals(entry2.value.data, "Value 8 in doc1");
  assertEquals(entry3.value.data, "Value 9 in doc1");
  await kvStore.close();
});

test("KV: supports empty numeric key ranges to get all", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Set some values within a range
  for (let i = 5; i <= 10; i++) {
    await kvStore.set(["data", i, "doc1"], `Value ${i} in doc1`);
    await kvStore.set(["data", i, "doc2"], `Value ${i} in doc2`);
  }

  // Test if the 'get' function returns the expected values
  assertEquals(kvStore.count(["data", {}, "doc1"]), 6);
  assertEquals(kvStore.count(["data", {}, "doc2"]), 6);
  assertEquals(kvStore.count(["data", {}]), 12);
  assertEquals(kvStore.count(["data"]), 12);

  await kvStore.close();
});

test("KV: supports string key ranges", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Set some values with string keys
  await kvStore.set(["files", "doc_a"], "Document A");
  await kvStore.set(["files", "doc_b"], "Document B");
  await kvStore.set(["files", "image_1"], "Image 1");

  // Get all values within the "doc_" range
  const query = ["files", {
    from: "doc_",
    to: "doc_z",
  }];
  const rangeGenerator = kvStore.iterate(query);
  assertEquals((await (rangeGenerator.next())).value.data, "Document A");
  assertEquals(kvStore.count(query), 2);

  await kvStore.close();
});

test("KV: transaction with multiple operations", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["user", "address"], "Space");
  kvStore.beginTransaction();
  await kvStore.set(["user", "name"], "Alice");
  await kvStore.set(["user", "age"], 30);
  await kvStore.delete(["user", "address"]); // Assume address was set previously
  await kvStore.endTransaction();

  assertEquals((await kvStore.get(["user", "name"]))?.data, "Alice");
  assertEquals((await kvStore.get(["user", "age"]))?.data, 30);
  assertEquals(await kvStore.get(["user", "address"]), null);

  await kvStore.close();
});

test("KV: iteration with limit", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Set multiple values under the same key
  for (let i = 1; i <= 5; i++) {
    await kvStore.set(["data", i], `Value ${i}`);
  }

  // Iterate with a limit of 3
  const limit = 3;
  const results: KVTransactionResult<unknown>[] = [];
  for await (const entry of kvStore.iterate(["data"], limit)) {
    results.push(entry);
  }

  // Assertions
  assertEquals(results.length, limit, "Should yield only up to the limit");
  assertEquals(results[0].data, "Value 1");
  assertEquals(results[1].data, "Value 2");
  assertEquals(results[2].data, "Value 3");

  await kvStore.close();
});

test("KV: vacuum", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Add some data
  await kvStore.set(["data", 1], "Value 1");
  await kvStore.set(["data", 2], "Value 2");
  await kvStore.set(["data", 3], "Value 3");
  await kvStore.delete(["data", 2]); // Delete one entry

  const dataBeforeVacuum = await kvStore.get(["data", 1]);

  // Perform vacuum
  await kvStore.vacuum();

  const dataAfterVacuum = await kvStore.get(["data", 1]);
  assertEquals(
    dataAfterVacuum?.data,
    dataBeforeVacuum?.data,
    "Remaining data should be the same",
  );

  kvStore.close();
});

test("KV Options: defaults work correctly", () => {
  const kv = new KV(); // No options provided
  assertEquals(kv.autoSync, true);
  assertEquals(kv.syncIntervalMs, SYNC_INTERVAL_MS);
  kv.close();
});

test("KV Options: custom options are applied", () => {
  const options: KVOptions = {
    autoSync: false,
    syncIntervalMs: 5000,
  };
  const kv = new KV(options);
  assertEquals(kv.autoSync, false);
  assertEquals(kv.syncIntervalMs, 5000);
  kv.close();
});

test("KV Options: throws on invalid autoSync type", () => {
  const options: KVOptions = {
    // @ts-expect-error Test
    autoSync: "not a boolean", // Incorrect type
  };
  assertThrows(
    () => new KV(options),
    TypeError,
    "Invalid option: autoSync must be a boolean",
  );
});

test("KV Options: throws on invalid syncIntervalMs type", () => {
  const options: KVOptions = {
    // @ts-expect-error Test
    syncIntervalMs: "not a number", // Incorrect type
  };
  assertThrows(
    () => new KV(options),
    TypeError,
    "Invalid option: syncIntervalMs must be a positive integer",
  );
});

test("KV Options: throws on negative syncIntervalMs", () => {
  const options: KVOptions = {
    syncIntervalMs: -1000, // Negative value
  };
  assertThrows(
    () => new KV(options),
    TypeError,
    "Invalid option: syncIntervalMs must be a positive integer",
  );
});

test("KV Options: throws on zero syncIntervalMs", () => {
  const options: KVOptions = {
    syncIntervalMs: 0, // Zero value
  };
  assertThrows(
    () => new KV(options),
    TypeError,
    "Invalid option: syncIntervalMs must be a positive integer",
  );
});

test("KV: sync event triggers and reflects data changes", async () => {
  const tempFilePrefix = await tempfile();

  // Two KV instances sharing the same file
  const kvStore1 = new KV();
  const kvStore2 = new KV(); // Manual sync for testing
  await kvStore1.open(tempFilePrefix);
  await kvStore2.open(tempFilePrefix);

  let syncedData: KVTransactionResult<unknown>[] = [];

  // Listen for the "sync" event on the second instance
  // @ts-ignore ksStore2 is an EventEmitter
  kvStore2.on("sync", async (result) => {
    if (result.result === "success") {
      syncedData = await kvStore2.listAll(["user"]); // Fetch all data after successful sync
    }
  });

  // Add data using the first instance
  await kvStore1.set(["user", "name"], "Bob");
  await kvStore1.set(["user", "age"], 42);

  // Wait for the watchdog interval to ensure a sync occurs
  await new Promise((resolve) => setTimeout(resolve, SYNC_INTERVAL_MS * 2)); // Autosync should have happened within 2 sec

  // Assert that the second instance has the updated data
  assertEquals(syncedData.length, 2);
  assertEquals(syncedData[0].data, "Bob");
  assertEquals(syncedData[1].data, 42);

  await kvStore1.close();
  await kvStore2.close();
});

test("KV: watch functionality - basic matching", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  const watchedKey = ["user", "profile"];
  let receivedTransaction: KVTransactionResult<unknown> | null = null;

  // Watch for a specific key
  kvStore.watch(watchedKey, (transaction) => {
    receivedTransaction = transaction;
  });

  await kvStore.set(watchedKey, { name: "Alice", age: 30 });
  await kvStore.sync(true); // Manual sync to trigger the watch callback

  assertEquals(receivedTransaction!.key, watchedKey);
  assertEquals(receivedTransaction!.data, { name: "Alice", age: 30 });

  await kvStore.close();
});

test("KV: watch functionality - recursive matching", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  const receivedTransactions: KVTransactionResult<unknown>[] = [];

  const query: KVQuery = ["users"];

  kvStore.watch(query, (transaction) => {
    receivedTransactions.push(transaction);
  }, true);

  await kvStore.set(["users", "user1"], "Alice");
  await kvStore.set(["users", "user2"], "Bob");
  await kvStore.set(["data", "other"], "Not watched");
  await kvStore.sync(true); // Not needed, but trigger to ensure no duplicate calls occurr

  assertEquals(receivedTransactions.length, 2);
  assertEquals(receivedTransactions[0].data, "Alice");
  assertEquals(receivedTransactions[1].data, "Bob");

  await kvStore.close();
});

test("KV: watch functionality - range matching", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  const receivedTransactions: KVTransactionResult<unknown>[] = [];

  kvStore.watch(["scores", { from: 10, to: 20 }], (transaction) => {
    receivedTransactions.push(transaction);
  });

  await kvStore.set(["scores", 5], 5);
  await kvStore.set(["scores", 15], 15);
  await kvStore.set(["scores", 25], 25);

  assertEquals(receivedTransactions.length, 1);
  assertEquals(receivedTransactions[0].data, 15);

  await kvStore.close();
});

test("KV: watch functionality - unwatch", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  let callbackCallCount = 0;
  const callback = () => {
    callbackCallCount++;
  };
  const query = ["test"];
  kvStore.watch(query, callback);
  await kvStore.set(["test"], "Hello");
  assertEquals(callbackCallCount, 1); // Callback should have been called once

  const unwatchResult0 = kvStore.unwatch(["test"], callback); // Same key but different ref
  assertEquals(unwatchResult0, false);
  const unwatchResult = kvStore.unwatch(query, callback); // Correct
  assertEquals(unwatchResult, true);
  const unwatchResult2 = kvStore.unwatch(["nonexistant"], callback); // Other
  assertEquals(unwatchResult2, false);
  await kvStore.set(["test"], "World");
  assertEquals(callbackCallCount, 1);

  await kvStore.close();
});

test("KV: list keys", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["user", "profile", "name"], "Alice");
  await kvStore.set(["user", "profile", "age"], 30);
  await kvStore.set(["user", "settings", "theme"], "dark");
  await kvStore.set(["system", "version"], 1.0);

  assertEquals(kvStore.listKeys(null), ["user", "system"]);
  assertEquals(kvStore.listKeys(["user"]), ["profile", "settings"]);
  assertEquals(kvStore.listKeys(["user", "profile"]), ["name", "age"]);
  assertEquals(kvStore.listKeys(["nonexistent"]), []);

  await kvStore.close();
});

test("KV: watch functionality - no match", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  let callbackCalled = false;
  kvStore.watch(["users"], () => {
    callbackCalled = true;
  });

  // Add data under a different key
  await kvStore.set(["data", "something"], "else");
  await kvStore.sync(true);

  assertEquals(callbackCalled, false, "Callback should not have been called");

  await kvStore.close();
});

test("KV: scan for non-existent key", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  const query = ["nonExistentKey"];

  const scanGenerator = kvStore.scan(query);
  const result = await scanGenerator.next();

  assertEquals(
    result.done,
    true,
    "Generator should have no values for non-existent key",
  );
  assertEquals(result.value, undefined, "Value should be undefined");

  await kvStore.close();
});

test("KV: scan for existing key with multiple transactions", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false });
  await kvStore.open(tempFilePrefix);

  const key = ["existingKey"];

  // Create multiple transactions for the same key
  const expectedTransactions: KVTransactionResult<number>[] = [];
  for (let i = 0; i < 3; i++) {
    const value = i;
    await kvStore.set(key, value);
    expectedTransactions.push(
      await kvStore.get(key) as KVTransactionResult<number>,
    );
  }

  // Perform the scan
  const actualTransactions: KVTransactionResult<number>[] = [];
  for await (const transaction of kvStore.scan(key)) {
    actualTransactions.push(transaction as KVTransactionResult<number>);
  }

  // Assertions
  assertEquals(actualTransactions.length, expectedTransactions.length);
  for (let i = 0; i < actualTransactions.length; i++) {
    assertEquals(actualTransactions[i].operation, KVOperation.SET);
    assertEquals(actualTransactions[i].key, expectedTransactions[i].key);
  }

  await kvStore.close();
});

test("KV: list keys after deletion", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV({ autoSync: false }); // Manual sync for better control
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["user", "profile", "name"], "Alice");
  await kvStore.set(["user", "info"], "Yes");
  await kvStore.set(["system", "version"], 1.0);

  // Before Deletion
  assertEquals(kvStore.listKeys(null), ["user", "system"]);

  await kvStore.delete(["user", "profile", "name"]); // Delete a key

  assertEquals(kvStore.listKeys(null), ["user", "system"]); // Now 'profile' should be gone
  assertEquals(kvStore.listKeys(["user"]), ["info"]); // Info should be left

  await kvStore.delete(["user", "info"]); // Delete a key

  assertEquals(kvStore.listKeys(null), ["system"]); // Now 'user' should be gone

  await kvStore.close();
});

test("KV: iterate in forward order with limit", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  for (let i = 1; i <= 5; i++) {
    await kvStore.set(["data", i], `Value ${i}`);
  }

  const limit = 3;
  const expectedValues = ["Value 1", "Value 2", "Value 3"]; // Expected in reverse order
  const results = [];

  for await (const entry of kvStore.iterate(["data"], limit, false)) { // true for reverse
    results.push(entry.data);
  }

  assertEquals(results, expectedValues); // Check if values match and are in the correct order
  await kvStore.close();
});

test("KV: listAll in forward order with limit", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  for (let i = 1; i <= 5; i++) {
    await kvStore.set(["data", i], `Value ${i}`);
  }

  const limit = 3;
  const expectedValues = ["Value 1", "Value 2", "Value 3"];

  const results = (await kvStore.listAll(["data"], limit, false)).map((entry) =>
    entry.data
  );

  assertEquals(results, expectedValues);
  await kvStore.close();
});

test("KV: iterate in reverse order with limit", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  for (let i = 1; i <= 5; i++) {
    await kvStore.set(["data", i], `Value ${i}`);
  }

  const limit = 3;
  const expectedValues = ["Value 5", "Value 4", "Value 3"]; // Expected in reverse order
  const results = [];

  for await (const entry of kvStore.iterate(["data"], limit, true)) { // true for reverse
    results.push(entry.data);
  }

  assertEquals(results, expectedValues); // Check if values match and are in the correct order
  await kvStore.close();
});

test("KV: listAll in reverse order with limit", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  for (let i = 1; i <= 5; i++) {
    await kvStore.set(["data", i], `Value ${i}`);
  }

  const limit = 3;
  const expectedValues = ["Value 5", "Value 4", "Value 3"];

  const results = (await kvStore.listAll(["data"], limit, true)).map((entry) =>
    entry.data
  );

  assertEquals(results, expectedValues);
  await kvStore.close();
});

test("KV: iterate and listAll respect reverse insertion order with multiple key matches", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  // Inserting items with a common prefix and different suffixes
  await kvStore.set(["data", "d", "b"], "Value A");
  await kvStore.set(["data", "c", "a"], "Value B");
  await kvStore.set(["data", "c", "b"], "Value C");
  await kvStore.set(["data", "a"], "Value D");

  // Iterate in reverse order
  const iterateResults = [];
  for await (const entry of kvStore.iterate(["data"], undefined, true)) {
    iterateResults.push(entry.data);
  }
  assertEquals(iterateResults, ["Value D", "Value C", "Value B", "Value A"]);

  // ListAll in reverse order
  const listAllResults = (await kvStore.listAll(["data"], undefined, true)).map(
    (entry) => entry.data,
  );
  assertEquals(listAllResults, ["Value D", "Value C", "Value B", "Value A"]);

  // ListAll in insertion order
  const listAllResults2 = (await kvStore.listAll(["data"], undefined, false))
    .map(
      (entry) => entry.data,
    );
  assertEquals(listAllResults2, ["Value A", "Value B", "Value C", "Value D"]);

  await kvStore.close();
});
