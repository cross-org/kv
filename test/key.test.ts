import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { type KVKey, KVKeyInstance, type KVQuery } from "../src/key.ts";

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
    ["users", 123, "profilé"],
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

test("KVKeyInstance: throws with invalid string key (characters)", () => {
  // Test with various invalid characters
  const invalidChars = [
    "!",
    "#",
    "$",
    "%",
    "&",
    "(",
    ")",
    ":",
    ";",
    "<",
    ">",
    "=",
    "[",
    "]",
    "{",
    "}",
    "\\",
    "|",
    "?",
    "/",
    ".",
    " ",
  ];
  for (const char of invalidChars) {
    assertThrows(
      () => new KVKeyInstance(["users", `user${char}123`]),
      TypeError,
      `String elements in the key can only contain unicode letters, numbers, '@',  '-', and '_'`,
    );
  }
});

test("KVKeyInstance: matchesQuery - exact string match", () => {
  const key = new KVKeyInstance(["users", "user123"]);
  assertEquals(key.matchesQuery(["users", "user123"]), true);
  assertEquals(key.matchesQuery(["users", "user124"]), false);
});

test("KVKeyInstance: matchesQuery - exact number match", () => {
  const key = new KVKeyInstance(["data", 42]);
  assertEquals(key.matchesQuery(["data", 42]), true);
  assertEquals(key.matchesQuery(["data", 43]), false);
});

test("KVKeyInstance: matchesQuery - prefix match (recursive)", () => {
  const key = new KVKeyInstance(["users", "user123", "profile"]);
  assertEquals(key.matchesQuery(["users"], true), true);
  assertEquals(key.matchesQuery(["users", "user123"], true), true);
  assertEquals(key.matchesQuery(["users", "user124"], true), false);
});

test("KVKeyInstance: matchesQuery - prefix match (non-recursive)", () => {
  const key = new KVKeyInstance(["users", "user123", "profile"]);
  assertEquals(key.matchesQuery(["users"], false), false);
  assertEquals(key.matchesQuery(["users", "user123"], false), false);
  assertEquals(key.matchesQuery(["users", "user123", "profile"], false), true);
});

test("KVKeyInstance: matchesQuery - number range match (inclusive)", () => {
  const key = new KVKeyInstance(["data", 5]);
  assertEquals(key.matchesQuery(["data", { from: 1, to: 10 }]), true);
  assertEquals(key.matchesQuery(["data", { from: 7 }]), false);
  assertEquals(key.matchesQuery(["data", { to: 4 }]), false);
  assertEquals(key.matchesQuery(["data", {}]), true); // Empty range matches all
});

test("KVKeyInstance: matchesQuery - string range match (inclusive)", () => {
  const key = new KVKeyInstance(["users", "john_doe"]);
  assertEquals(key.matchesQuery(["users", { from: "a", to: "z" }]), true);
  assertEquals(key.matchesQuery(["users", { from: "k" }]), false);
  assertEquals(key.matchesQuery(["users", { to: "i" }]), false);
  assertEquals(key.matchesQuery(["users", {}]), true); // Empty range matches all
});
