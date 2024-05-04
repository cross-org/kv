import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { CrossKV } from "./kv.ts";

test("CrossKV: set, get and delete (numbers and strings)", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["name"], "Alice");
  await kvStore.set(["age"], 30);

  assertEquals(await kvStore.get(["name"]), "Alice");
  assertEquals(await kvStore.get(["age"]), 30);

  await kvStore.delete(["name"]);

  assertEquals(await kvStore.get(["name"]), null);
  assertEquals(await kvStore.get(["age"]), 30);
});

test("CrossKV: set, get and delete (objects)", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);
  await kvStore.set(["name"], { data: "Alice" });
  await kvStore.set(["age"], { data: 30 });

  assertEquals(await kvStore.get(["name"]), { data: "Alice" });
  assertEquals(await kvStore.get(["age"]), { data: 30 });

  await kvStore.delete(["name"]);

  assertEquals(await kvStore.get(["name"]), null);
  assertEquals(await kvStore.get(["age"]), { data: 30 });
});

test("CrossKV: set, get and delete (dates)", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);
  const date = new Date();
  await kvStore.set(["pointintime"], date);
  assertEquals((await kvStore.get(["pointintime"])).getTime(), date.getTime());
  assertEquals(
    (await kvStore.get(["pointintime"])).toLocaleString(),
    date.toLocaleString(),
  );
  await kvStore.delete(["pointintime"]);
  assertEquals(await kvStore.get(["pointintime"]), null);
});

test("CrossKV: throws on duplicate key insertion", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["name"], "Alice");

  assertRejects(
    async () => await kvStore.set(["name"], "Bob"),
    Error,
    "Duplicate key: name",
  );
});

test("CrossKV: throws when trying to delete a non-existing key", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);

  assertRejects(
    () => kvStore.delete(["unknownKey"]),
    Error,
  ); // We don't have a specific error type for this yet
});

test("CrossKV: supports multi-level nested keys", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["data", "user", "name"], "Alice");
  await kvStore.set(["data", "system", "version"], 1.2);

  assertEquals(await kvStore.get(["data", "user", "name"]), "Alice");
  assertEquals(await kvStore.get(["data", "system", "version"]), 1.2);
});

test("CrossKV: supports multi-level nested keys with numbers", async () => {
  const tempFilePrefix = await Deno.makeTempFile();
  const kvStore = new CrossKV();
  await kvStore.open(tempFilePrefix);

  await kvStore.set(["data", "user", 4], "Alice");
  await kvStore.set(["data", "system", 4], 1.2);

  assertEquals(await kvStore.get(["data", "user", 4]), "Alice");
  assertEquals(await kvStore.get(["data", "system", 4]), 1.2);
  assertNotEquals(await kvStore.get(["data", "system", 5]), 1.2);
});
