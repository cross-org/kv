import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { faultyMurmurHash, murmurHash } from "../src/lib/utils/murmur.ts";

test("murmurHash: deterministic output for empty string", () => {
  // Act
  const hash1 = murmurHash("");
  const hash2 = murmurHash("");

  // Assert: Same input should produce same hash
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("murmurHash: deterministic output for empty Uint8Array", () => {
  // Act
  const hash1 = murmurHash(new Uint8Array([]));
  const hash2 = murmurHash(new Uint8Array([]));

  // Assert: Same input should produce same hash
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("murmurHash: deterministic output for simple string", () => {
  // Act
  const hash1 = murmurHash("hello");
  const hash2 = murmurHash("hello");

  // Assert: Same input should produce same hash
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("murmurHash: different strings produce different hashes", () => {
  // Act
  const hash1 = murmurHash("hello");
  const hash2 = murmurHash("world");

  // Assert: Different inputs should produce different hashes (with very high probability)
  assertEquals(hash1 !== hash2, true);
});

test("murmurHash: consistent with seed", () => {
  // Act
  const hash1 = murmurHash("test", 42);
  const hash2 = murmurHash("test", 42);
  const hash3 = murmurHash("test", 43);

  // Assert: Same seed should produce same hash, different seed should differ
  assertEquals(hash1, hash2);
  assertEquals(hash1 !== hash3, true);
});

test("murmurHash: handles long strings", () => {
  // Arrange: Create a long string
  const longString = "a".repeat(1000);

  // Act
  const hash1 = murmurHash(longString);
  const hash2 = murmurHash(longString);

  // Assert: Should be deterministic even for long input
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("murmurHash: handles strings with various lengths", () => {
  // Test different remainders (% 4)
  const test1 = murmurHash("a"); // length 1
  const test2 = murmurHash("ab"); // length 2
  const test3 = murmurHash("abc"); // length 3
  const test4 = murmurHash("abcd"); // length 4
  const test5 = murmurHash("abcde"); // length 5

  // Assert: All should produce valid hashes
  assertEquals(typeof test1, "number");
  assertEquals(typeof test2, "number");
  assertEquals(typeof test3, "number");
  assertEquals(typeof test4, "number");
  assertEquals(typeof test5, "number");

  // All should be different
  const hashes = [test1, test2, test3, test4, test5];
  const uniqueHashes = new Set(hashes);
  assertEquals(uniqueHashes.size, 5);
});

test("murmurHash: handles Uint8Array input", () => {
  // Arrange
  const data = new Uint8Array([1, 2, 3, 4, 5]);

  // Act
  const hash1 = murmurHash(data);
  const hash2 = murmurHash(data);

  // Assert: Should be deterministic
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("murmurHash: handles large Uint8Array", () => {
  // Arrange: Create large array
  const largeData = new Uint8Array(10000);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = i % 256;
  }

  // Act
  const hash1 = murmurHash(largeData);
  const hash2 = murmurHash(largeData);

  // Assert: Should be deterministic for large input
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("murmurHash: string and equivalent Uint8Array produce same hash", () => {
  // Arrange
  const str = "hello";
  const bytes = new TextEncoder().encode(str);

  // Act
  const hashFromString = murmurHash(str);
  const hashFromBytes = murmurHash(bytes);

  // Assert: Should produce same hash
  assertEquals(hashFromString, hashFromBytes);
});

test("murmurHash: returns positive 32-bit integer", () => {
  // Act
  const hash = murmurHash("test");

  // Assert: Should be positive and within 32-bit range
  assertEquals(hash >= 0, true);
  assertEquals(hash <= 0xFFFFFFFF, true);
  assertEquals(Number.isInteger(hash), true);
});

test("faultyMurmurHash: deterministic output for empty string", () => {
  // Act
  const hash1 = faultyMurmurHash("");
  const hash2 = faultyMurmurHash("");

  // Assert: Same input should produce same hash
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("faultyMurmurHash: deterministic output for simple string", () => {
  // Act
  const hash1 = faultyMurmurHash("hello");
  const hash2 = faultyMurmurHash("hello");

  // Assert: Same input should produce same hash
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("faultyMurmurHash: different from murmurHash for certain inputs", () => {
  // Act: Test with strings that have different remainders
  const str3 = "abc"; // length 3, should differ
  const str2 = "ab"; // length 2, should differ

  const normalHash3 = murmurHash(str3);
  const faultyHash3 = faultyMurmurHash(str3);

  const normalHash2 = murmurHash(str2);
  const faultyHash2 = faultyMurmurHash(str2);

  // Assert: Faulty version differs for case 2 and 3 (because of missing fallthrough)
  // For case 3, the faulty version breaks early and doesn't process cases 2 and 1
  // For case 2, the faulty version breaks early and doesn't process case 1
  assertEquals(normalHash3 !== faultyHash3, true);
  assertEquals(normalHash2 !== faultyHash2, true);
});

test("faultyMurmurHash: handles Uint8Array input", () => {
  // Arrange
  const data = new Uint8Array([1, 2, 3, 4, 5]);

  // Act
  const hash1 = faultyMurmurHash(data);
  const hash2 = faultyMurmurHash(data);

  // Assert: Should be deterministic
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("faultyMurmurHash: returns positive 32-bit integer", () => {
  // Act
  const hash = faultyMurmurHash("test");

  // Assert: Should be positive and within 32-bit range
  assertEquals(hash >= 0, true);
  assertEquals(hash <= 0xFFFFFFFF, true);
  assertEquals(Number.isInteger(hash), true);
});

test("faultyMurmurHash: consistent with seed", () => {
  // Act
  const hash1 = faultyMurmurHash("test", 42);
  const hash2 = faultyMurmurHash("test", 42);
  const hash3 = faultyMurmurHash("test", 43);

  // Assert: Same seed should produce same hash, different seed should differ
  assertEquals(hash1, hash2);
  assertEquals(hash1 !== hash3, true);
});

test("murmurHash and faultyMurmurHash: same for length % 4 == 0", () => {
  // Arrange: Test with string whose length is divisible by 4
  const str = "test"; // length 4

  // Act
  const normalHash = murmurHash(str);
  const faultyHash = faultyMurmurHash(str);

  // Assert: Should produce same hash when no remainder processing needed
  assertEquals(normalHash, faultyHash);
});

test("murmurHash and faultyMurmurHash: same for empty input", () => {
  // Act
  const normalHash = murmurHash("");
  const faultyHash = faultyMurmurHash("");

  // Assert: Should produce same hash for empty input
  assertEquals(normalHash, faultyHash);
});

test("murmurHash: handles unicode characters", () => {
  // Act
  const hash1 = murmurHash("Hello 世界 🌍");
  const hash2 = murmurHash("Hello 世界 🌍");

  // Assert: Should be deterministic with unicode
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});

test("faultyMurmurHash: handles unicode characters", () => {
  // Act
  const hash1 = faultyMurmurHash("Hello 世界 🌍");
  const hash2 = faultyMurmurHash("Hello 世界 🌍");

  // Assert: Should be deterministic with unicode
  assertEquals(hash1, hash2);
  assertEquals(typeof hash1, "number");
});
