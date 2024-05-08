import { assertEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { KV } from "./kv.ts";
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

  const kvStore2 = new KV();
  await kvStore2.open(tempFilePrefix);
  assertEquals(
    (await kvStore2.get(["num", 54645645646546345634523452345234545464]))?.data,
    54645645646546345634523452345234545464,
  );
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
});

test("KV: throws on duplicate key insertion", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["name"], "Alice");

  assertRejects(
    async () => await kvStore.set(["name"], "Bob"),
    Error,
    "Duplicate key: Key already exists",
  );
});

test("KV: throws when trying to delete a non-existing key", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await assertRejects(
    async () => await kvStore.delete(["unknownKey"]),
    Error,
  ); // We don't have a specific error type for this yet
});

test("KV: supports multi-level nested keys", async () => {
  const tempFilePrefix = await tempfile();
  const kvStore = new KV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["data", "user", "name"], "Alice");
  await kvStore.set(["data", "system", "version"], 1.2);

  assertEquals((await kvStore.get(["data", "user", "name"]))?.data, "Alice");
  assertEquals((await kvStore.get(["data", "system", "version"]))?.data, 1.2);
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
  const rangeResults = await kvStore.getMany(["data", { from: 7, to: 9 }]);
  assertEquals(rangeResults.length, 3);
  assertEquals(rangeResults[0].data, "Value 7");
  assertEquals(rangeResults[1].data, "Value 8");
  assertEquals(rangeResults[2].data, "Value 9");
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
  const rangeResults = await kvStore.getMany([
    "data",
    { from: 7, to: 9 },
    "doc1",
  ]);
  assertEquals(rangeResults.length, 3);
  assertEquals(rangeResults[0].data, "Value 7 in doc1");
  assertEquals(rangeResults[1].data, "Value 8 in doc1");
  assertEquals(rangeResults[2].data, "Value 9 in doc1");
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
  const rangeResults = await kvStore.getMany(["data", {}, "doc1"]);
  assertEquals(rangeResults.length, 6);
  const rangeResults2 = await kvStore.getMany(["data", {}, "doc2"]);
  assertEquals(rangeResults2.length, 6);
  const rangeResults3 = await kvStore.getMany(["data", {}]);
  assertEquals(rangeResults3.length, 12);
  const rangeResults4 = await kvStore.getMany(["data"]);
  assertEquals(rangeResults4.length, 12);
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
  const rangeResults = await kvStore.getMany(["files", {
    from: "doc_",
    to: "doc_z",
  }]);
  assertEquals(rangeResults.length, 2);
  assertEquals(rangeResults[0].data, "Document A");
});
