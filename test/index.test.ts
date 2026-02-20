import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { KVIndex } from "../src/lib/index.ts";
import { KVKeyInstance } from "../src/lib/key.ts";

test("KVIndex: add and get single entry", () => {
  const index = new KVIndex();
  const key = new KVKeyInstance(["users", "alice"]);
  index.add(key, 100);

  const results = index.get(new KVKeyInstance(["users", "alice"], true));
  assertEquals(results, [100]);
});

test("KVIndex: get returns empty array for missing key", () => {
  const index = new KVIndex();
  const results = index.get(new KVKeyInstance(["nonexistent"], true));
  assertEquals(results, []);
});

test("KVIndex: add overwrites existing entry at same key", () => {
  const index = new KVIndex();
  const key1 = new KVKeyInstance(["users", "alice"]);
  const key2 = new KVKeyInstance(["users", "alice"]);
  index.add(key1, 100);
  index.add(key2, 200);

  const results = index.get(new KVKeyInstance(["users", "alice"], true));
  assertEquals(results, [200]);
});

test("KVIndex: get multiple entries under common prefix", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["users", "alice"]), 100);
  index.add(new KVKeyInstance(["users", "bob"]), 200);
  index.add(new KVKeyInstance(["users", "carol"]), 300);

  const results = index.get(new KVKeyInstance(["users"], true));
  assertEquals(results.sort((a, b) => a - b), [100, 200, 300]);
});

test("KVIndex: get returns results sorted by offset (ascending)", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["data", "c"]), 300);
  index.add(new KVKeyInstance(["data", "a"]), 100);
  index.add(new KVKeyInstance(["data", "b"]), 200);

  const results = index.get(new KVKeyInstance(["data"], true));
  assertEquals(results, [100, 200, 300]);
});

test("KVIndex: get returns results sorted by offset (descending) when reverse=true", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["data", "c"]), 300);
  index.add(new KVKeyInstance(["data", "a"]), 100);
  index.add(new KVKeyInstance(["data", "b"]), 200);

  const results = index.get(new KVKeyInstance(["data"], true), undefined, true);
  assertEquals(results, [300, 200, 100]);
});

test("KVIndex: get respects limit", () => {
  const index = new KVIndex();
  for (let i = 1; i <= 5; i++) {
    index.add(new KVKeyInstance(["data", i]), i * 10);
  }

  const results = index.get(new KVKeyInstance(["data"], true), 3);
  assertEquals(results.length, 3);
  assertEquals(results, [10, 20, 30]);
});

test("KVIndex: get with numeric range", () => {
  const index = new KVIndex();
  for (let i = 1; i <= 10; i++) {
    index.add(new KVKeyInstance(["scores", i]), i * 100);
  }

  const results = index.get(
    new KVKeyInstance(["scores", { from: 3, to: 6 }], true),
  );
  assertEquals(results.sort((a, b) => a - b), [300, 400, 500, 600]);
});

test("KVIndex: get with string range", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["files", "doc-a"]), 100);
  index.add(new KVKeyInstance(["files", "doc-b"]), 200);
  index.add(new KVKeyInstance(["files", "img-1"]), 300);

  const results = index.get(
    new KVKeyInstance(["files", { from: "doc-a", to: "doc-z" }], true),
  );
  assertEquals(results.sort((a, b) => a - b), [100, 200]);
});

test("KVIndex: get with empty range matches all children", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["items", 1]), 10);
  index.add(new KVKeyInstance(["items", 2]), 20);
  index.add(new KVKeyInstance(["items", 3]), 30);

  const results = index.get(new KVKeyInstance(["items", {}], true));
  assertEquals(results.sort((a, b) => a - b), [10, 20, 30]);
});

test("KVIndex: delete removes entry", () => {
  const index = new KVIndex();
  const key = new KVKeyInstance(["users", "alice"]);
  index.add(key, 100);

  const removed = index.delete(new KVKeyInstance(["users", "alice"]));
  assertEquals(removed, 100);

  const results = index.get(new KVKeyInstance(["users", "alice"], true));
  assertEquals(results, []);
});

test("KVIndex: delete returns undefined for missing key", () => {
  const index = new KVIndex();
  const removed = index.delete(new KVKeyInstance(["nonexistent"]));
  assertEquals(removed, undefined);
});

test("KVIndex: delete cleans up empty parent nodes", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["users", "alice", "profile"]), 100);
  index.delete(new KVKeyInstance(["users", "alice", "profile"]));

  // Parent nodes should be gone
  const results = index.get(new KVKeyInstance(["users"], true));
  assertEquals(results, []);
  assertEquals(index.getChildKeys(null), []);
});

test("KVIndex: delete keeps sibling nodes intact", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["users", "alice"]), 100);
  index.add(new KVKeyInstance(["users", "bob"]), 200);

  index.delete(new KVKeyInstance(["users", "alice"]));

  const remaining = index.get(new KVKeyInstance(["users"], true));
  assertEquals(remaining, [200]);
});

test("KVIndex: clear removes all entries", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["a"]), 1);
  index.add(new KVKeyInstance(["b"]), 2);

  index.clear();

  assertEquals(index.get(new KVKeyInstance(["a"], true)), []);
  assertEquals(index.get(new KVKeyInstance(["b"], true)), []);
  assertEquals(index.getChildKeys(null), []);
});

test("KVIndex: setIndex replaces entire index", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["old"]), 999);

  const newIndex = new KVIndex();
  newIndex.add(new KVKeyInstance(["new"]), 42);
  index.setIndex(newIndex.index);

  assertEquals(index.get(new KVKeyInstance(["old"], true)), []);
  assertEquals(index.get(new KVKeyInstance(["new"], true)), [42]);
});

test("KVIndex: getChildKeys returns root-level keys when null is passed", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["users", "alice"]), 100);
  index.add(new KVKeyInstance(["products", 1]), 200);
  index.add(new KVKeyInstance(["settings"]), 300);

  const keys = index.getChildKeys(null).sort();
  assertEquals(keys, ["products", "settings", "users"]);
});

test("KVIndex: getChildKeys returns child keys for a given key", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["user", "name"]), 100);
  index.add(new KVKeyInstance(["user", "age"]), 200);
  index.add(new KVKeyInstance(["user", "email"]), 300);

  const keys = index.getChildKeys(new KVKeyInstance(["user"])).sort();
  assertEquals(keys, ["age", "email", "name"]);
});

test("KVIndex: getChildKeys returns empty array for nonexistent key", () => {
  const index = new KVIndex();
  const keys = index.getChildKeys(new KVKeyInstance(["nonexistent"]));
  assertEquals(keys, []);
});

test("KVIndex: getChildKeys converts numeric keys to strings", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["items", 1]), 10);
  index.add(new KVKeyInstance(["items", 2]), 20);

  const keys = index.getChildKeys(new KVKeyInstance(["items"])).sort();
  assertEquals(keys, ["1", "2"]);
});

test("KVIndex: handles multi-level keys with numbers", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["data", "user", 4]), 100);
  index.add(new KVKeyInstance(["data", "system", 4]), 200);

  assertEquals(
    index.get(new KVKeyInstance(["data", "user", 4], true)),
    [100],
  );
  assertEquals(
    index.get(new KVKeyInstance(["data", "system", 4], true)),
    [200],
  );
  assertEquals(
    index.get(new KVKeyInstance(["data", "system", 5], true)),
    [],
  );
});

test("KVIndex: get with limit 0 returns empty array", () => {
  const index = new KVIndex();
  index.add(new KVKeyInstance(["data", 1]), 10);
  index.add(new KVKeyInstance(["data", 2]), 20);

  const results = index.get(new KVKeyInstance(["data"], true), 0);
  assertEquals(results, []);
});
