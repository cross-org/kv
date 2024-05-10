import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { KVKey /* ... */ } from "./key.ts";

test("KVKey: constructs with valid string key", () => {
  const key = new KVKey(["users", "user123"]);
  assertEquals(key.get(), ["users", "user123"]);
});

test("KVKey: throws with invalid string key (colon)", () => {
  assertThrows(
    () => new KVKey(["users", ":lol"]),
    TypeError,
    "String elements in the key can only contain",
  );
});

test("KVKey: throws with invalid string key (space)", () => {
  assertThrows(
    () => new KVKey(["users", "l ol"]),
    TypeError,
    "String elements in the key can only contain",
  );
});

test("KVKey: constructs with valid number key", () => {
  const key = new KVKey(["data", 42]);
  assertEquals(key.get(), ["data", 42]);
});

test("KVKey: returns correct string representation", () => {
  const key = new KVKey(["users", "data", "user123"]);
  assertEquals(key.getKeyRepresentation(), "users.data.user123");
});

test("KVKey: constructs with valid range", () => {
  const key = new KVKey(["users", { from: "user001", to: "user999" }], true);
  assertEquals(key.get(), ["users", { from: "user001", to: "user999" }]);
});

test("KVKey: constructs with valid range (only from)", () => {
  const key = new KVKey(["users", { from: "user001" }], true);
  assertEquals(key.get(), ["users", { from: "user001" }]);
});

test("KVKey: constructs with valid range (only to)", () => {
  const key = new KVKey(["users", { to: "user001" }], true);
  assertEquals(key.get(), ["users", { to: "user001" }]);
});

test("KVKey: constructs with valid range (all)", () => {
  const key = new KVKey(["users", {}], true);
  assertEquals(key.get(), ["users", {}]);
});

test("KVKey: constructs with invalid range (extra property)", () => {
  assertThrows(
    // @ts-expect-error test unknown property
    () => new KVKey(["users", { test: 1 }], true),
    TypeError,
    "Ranges must have only",
  );
});

test("KVKey: throws on empty key", () => {
  assertThrows(() => new KVKey([]), TypeError, "Key cannot be empty");
});

test("KVKey: only allows string keys as first entry", () => {
  assertThrows(
    () => new KVKey([123121]),
    TypeError,
    "First index of the key must be a string",
  );
});
