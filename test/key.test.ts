import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import {
  type KVKey,
  KVKeyInstance,
  /* ... */ type KVQuery,
} from "../src/key.ts";

test("KVKeyInstance: constructs with valid string key", () => {
  const key = new KVKeyInstance(["users", "user123"]);
  assertEquals(key.get(), ["users", "user123"]);
});

test("KVKeyInstance: throws with invalid string key (colon)", () => {
  assertThrows(
    () => new KVKeyInstance(["users", ":lol"]),
    TypeError,
    "String elements in the key can only contain",
  );
});

test("KVKeyInstance: throws with invalid string key (space)", () => {
  assertThrows(
    () => new KVKeyInstance(["users", "l ol"]),
    TypeError,
    "String elements in the key can only contain",
  );
});

test("KVKeyInstance: constructs with valid number key", () => {
  const key = new KVKeyInstance(["data", 42]);
  assertEquals(key.get(), ["data", 42]);
});

test("KVKeyInstance: returns correct string representation", () => {
  const key = new KVKeyInstance(["users", "data", "user123"]);
  assertEquals(key.getKeyRepresentation(), "users.data.user123");
});

test("KVKeyInstance: constructs with valid range", () => {
  const key = new KVKeyInstance(
    ["users", { from: "user001", to: "user999" }],
    true,
  );
  assertEquals(key.get(), ["users", { from: "user001", to: "user999" }]);
});

test("KVKeyInstance: constructs with valid range (only from)", () => {
  const key = new KVKeyInstance(["users", { from: "user001" }], true);
  assertEquals(key.get(), ["users", { from: "user001" }]);
});

test("KVKeyInstance: constructs with valid range (only to)", () => {
  const key = new KVKeyInstance(["users", { to: "user001" }], true);
  assertEquals(key.get(), ["users", { to: "user001" }]);
});

test("KVKeyInstance: constructs with valid range (all)", () => {
  const key = new KVKeyInstance(["users", {}], true);
  assertEquals(key.get(), ["users", {}]);
});

test("KVKeyInstance: constructs with invalid range (extra property)", () => {
  assertThrows(
    // @ts-expect-error test unknown property
    () => new KVKeyInstance(["users", { test: 1 }], true),
    TypeError,
    "Ranges must have only",
  );
});

test("KVKeyInstance: throws on empty key", () => {
  assertThrows(() => new KVKeyInstance([]), TypeError, "Key cannot be empty");
});

test("KVKeyInstance: only allows string keys as first entry", () => {
  assertThrows(
    () => new KVKeyInstance([123121]),
    TypeError,
    "First index of the key must be a string",
  );
});

test("KVKeyInstance: toUint8Array and fromUint8Array", () => {
  const originalKeys: (KVKey | KVQuery)[] = [
    ["users", 123, "profile"],
    ["logs", 2023, 11, 15],
    ["settings", "theme", "dark"],
  ];

  for (const originalKey of originalKeys) {
    const keyInstance = new KVKeyInstance(
      originalKey,
      Array.isArray(originalKey) &&
        originalKey.some((element) => typeof element === "object"),
    ); // Pass `true` for allowRange if it's a query
    const encodedKey = keyInstance.toUint8Array();
    const decodedKeyInstance = new KVKeyInstance(encodedKey, false, false); // Decode without validation
    assertEquals(decodedKeyInstance.get(), originalKey);
  }
});
