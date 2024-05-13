import { assertEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { KV, type KVDataEntry } from "./kv.ts";
import { tempfile } from "@cross/fs";

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

test("KV: set, get and delete (big numbers)", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);
  await kvStore.set(
    ["num", 54645645646546345634523452345234545464],
    54645645646546345634523452345234545464,
  );

  assertEquals(
    (await kvStore.get(["num", 54645645646546345634523452345234545464]))?.data,
    54645645646546345634523452345234545464,
  );

  kvStore.close();

  const kvStore2 = new KV();
  await kvStore2.open(tempFilePrefix);
  assertEquals(
    (await kvStore2.get(["num", 54645645646546345634523452345234545464]))?.data,
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

test("KV: throws when trying to delete a non-existing key", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await assertRejects(
    async () => await kvStore.delete(["unknownKey"]),
    Error,
  ); // We don't have a specific error type for this yet

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
  const results: KVDataEntry[] = [];
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
