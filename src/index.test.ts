import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { tempfile, unlink } from "@cross/fs";
import { KVIndex } from "./index.ts";
import { KVKey } from "./key.ts";

test("KVIndex: Save, load, has and delete", async () => {
  const tempFilePath = await tempfile();

  const index = new KVIndex(tempFilePath);

  index.add(new KVKey(["key1"]), 20);
  index.add(new KVKey(["key2"]), 500);

  await index.saveIndex();

  await index.loadIndex();

  assertEquals(index.get(new KVKey(["key1"])), [20]);
  assertEquals(index.get(new KVKey(["key2"])), [500]);

  index.delete(new KVKey(["key1"]));

  await index.saveIndex();
  await index.loadIndex();

  assertEquals(index.get(new KVKey(["key1"])), []);
  assertEquals(index.get(new KVKey(["key2"])), [500]);

  await unlink(tempFilePath);
});
