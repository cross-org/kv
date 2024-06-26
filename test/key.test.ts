import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { type KVKey, KVKeyInstance, type KVQuery } from "../src/lib/key.ts";

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
  assertEquals(key.stringify(), "users.data.user123");
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
    // @ts-ignore Supposed to be invalid
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

test("KVKeyInstance: stringify and parse basic keys", () => {
  const keys: KVKey[] = [
    ["users", "123"],
    ["data", "filetxt"],
    ["numbers", 100, 200],
  ];

  for (const key of keys) {
    const instance = new KVKeyInstance(key);
    const stringified = instance.stringify();
    const parsed = KVKeyInstance.parse(stringified, false);
    assertEquals(parsed, key);
  }
});

test("KVKeyInstance: stringify and parse keys with ranges", () => {
  const queries: KVQuery[] = [
    ["users", { from: 1000, to: undefined }, { from: undefined, to: 12312 }],
    ["data", {}, { from: undefined, to: "zz" }],
    ["numbers", { from: 50, to: 100 }, 200, {}],
  ];

  for (const query of queries) {
    const instance = new KVKeyInstance(query, true); // isQuery=true
    const stringified = instance.stringify();
    const parsed = KVKeyInstance.parse(stringified, true);
    assertEquals(parsed, query);
  }
});

test("KVKeyInstance: stringify error on unsupported key type", () => {
  const invalidKey = ["base", true] as unknown as KVKey;
  assertThrows(
    () => {
      const instance = new KVKeyInstance(invalidKey); // isQuery=true
      instance.stringify();
    },
    Error,
    "Key elements must be strings or numbers",
  );
});

test("KVKeyInstance: parse error on invalid string", () => {
  const invalidKeyStrings = [
    "",
    "#123.users", // Number as first element
    "users.#123.!", // Invalid character
    ">=#100abc<=#200", // Invalid range format
  ];

  for (const keyString of invalidKeyStrings) {
    assertThrows(() => {
      KVKeyInstance.parse(keyString, false);
    }, TypeError);
  }
});

test("KVKeyInstance: parse error on range in non-query", () => {
  assertThrows(
    () => {
      KVKeyInstance.parse("users.>=1000", false); // Ranges not allowed in keys
    },
    TypeError,
    "Ranges are not allowed in keys.",
  );
});

test("KVKeyInstance: stringify and parse keys with numeric keys", () => {
  const keys: KVKey[] = [
    ["users", 123],
    ["data", 100, 200],
    ["users", "user123", 123],
  ];

  for (const key of keys) {
    const instance = new KVKeyInstance(key);
    const stringified = instance.stringify();
    const parsed = KVKeyInstance.parse(stringified, false);
    assertEquals(parsed, key);
  }
});

test("KVKeyInstance: parse error on invalid numeric key format", () => {
  assertThrows(() => {
    KVKeyInstance.parse("users.#abc", false);
  }, TypeError);
});

test("KVKeyInstance: parse error on invalid range format", () => {
  assertThrows(() => {
    KVKeyInstance.parse("users.>=abc.<=123", false);
  }, TypeError);
});

test("KVKeyInstance: Throws if trying to use something other than an array for a key", () => {
  assertThrows(
    () => new KVKeyInstance("users.data.user123" as unknown as KVKey),
    TypeError,
    "Key must be an array",
  );
});

test("KVKeyInstance: Throws if trying to use something other than a string or number for a key element", () => {
  assertThrows(
    // @ts-ignore expected to be wrong
    () => new KVKeyInstance(["users", null]),
    TypeError,
    "Key ranges are only allowed in queries",
  );
});

test("KVKeyInstance: Throws if trying to use an object with extra properties for a key element", () => {
  assertThrows(
    // @ts-ignore extected to be wrong
    () => new KVKeyInstance(["users", { from: 100, extra: "value" }], true),
    TypeError,
    "Ranges must have only",
  );
});

test("KVKeyInstance: Throws if trying to mix strings and numbers in a range for a key element", () => {
  assertThrows(
    () => new KVKeyInstance(["users", { from: "abc", to: 123 }], true),
    TypeError,
    "Cannot mix string and number in ranges",
  );
});

test("KVKeyInstance: Throws if trying to use an object with invalid range values for a key element", () => {
  assertThrows(
    () => new KVKeyInstance(["users", { from: 123, to: "abc" }], true, true),
    TypeError,
    "Cannot mix string and number in ranges",
  );
});

test("KVKeyInstance: throws when parsing a key with empty elements", () => {
  assertThrows(
    () => KVKeyInstance.parse("users..profile", false),
    TypeError,
    "Key ranges are only allowed in queries",
  );
});

test("KVKeyInstance: stringify and parse with empty elements", () => {
  // Empty object represents an empty element
  const queryWithEmpty: KVQuery = ["users", {}, "profile"];
  const queryWithRangeAndEmpty: KVQuery = ["data", { from: 10, to: 20 }, {}];

  const parsedKey = KVKeyInstance.parse("users..profile", true);
  assertEquals(parsedKey, queryWithEmpty);

  const queryInstance = new KVKeyInstance(queryWithRangeAndEmpty, true);
  assertEquals(queryInstance.stringify(), "data.>=#10<=#20.");

  const parsedQuery = KVKeyInstance.parse("data.>=#10<=#20.", true);
  assertEquals(parsedQuery, queryWithRangeAndEmpty);
});

test("KVKeyInstance: parse with leading dots should throw", () => {
  assertThrows(
    () => KVKeyInstance.parse(`.data.>=a<=z`, false),
    TypeError,
    "Ranges are not allowed in keys.",
  );
});

test("KVKeyInstance: stringify and parse mixed-type keys", () => {
  const mixedKey: KVKey = ["users", 123, "profile"];
  const instance = new KVKeyInstance(mixedKey);

  const stringified = instance.stringify();
  assertEquals(stringified, "users.#123.profile");

  const parsed = KVKeyInstance.parse(stringified, false);
  assertEquals(parsed, mixedKey);
});

test("KVKeyInstance: toUint8Array and fromUint8Array roundtrip", () => {
  const key: KVKey = ["users", "john_doe", 42];
  const instance = new KVKeyInstance(key);
  const uint8Array = instance.toUint8Array();

  const newKeyInstance = new KVKeyInstance(uint8Array);

  assertEquals(newKeyInstance.get(), key);
});
