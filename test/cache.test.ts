import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { KVLedgerCache } from "../src/lib/cache.ts";
import { KVOperation, KVTransaction } from "../src/lib/transaction.ts";
import { KVKeyInstance } from "../src/lib/key.ts";
import type { KVLedgerResult } from "../src/lib/ledger.ts";

// Helper to create a mock ledger result
function createMockLedgerResult(
  offset: number,
  length: number,
  keyName: string,
): KVLedgerResult {
  const transaction = new KVTransaction();
  const key = new KVKeyInstance([keyName]);
  transaction.key = key;
  transaction.operation = KVOperation.SET;
  transaction.timestamp = Date.now();
  transaction.data = new Uint8Array([1, 2, 3]);
  transaction.hash = 12345;

  return {
    offset,
    length,
    transaction,
    complete: true,
    errorCorrectionOffset: 0,
  };
}

test("KVLedgerCache: basic caching and retrieval", () => {
  // Arrange
  const cache = new KVLedgerCache(1024);
  const result = createMockLedgerResult(100, 50, "test");

  // Act
  cache.cacheTransactionData(100, result);
  const retrieved = cache.getTransactionData(100);

  // Assert
  assertEquals(retrieved, result);
});

test("KVLedgerCache: returns undefined for non-existent entry", () => {
  // Arrange
  const cache = new KVLedgerCache(1024);

  // Act
  const retrieved = cache.getTransactionData(999);

  // Assert
  assertEquals(retrieved, undefined);
});

test("KVLedgerCache: eviction when size exceeded", () => {
  // Arrange: Cache that can hold about 3 entries
  // Each entry with length=10 takes 10*3=30 bytes (due to LEDGER_CACHE_MEMORY_FACTOR=3)
  // So 100 bytes can hold about 3 entries (90 bytes)
  const cache = new KVLedgerCache(100);
  const result1 = createMockLedgerResult(100, 10, "first");
  const result2 = createMockLedgerResult(200, 10, "second");
  const result3 = createMockLedgerResult(300, 10, "third");
  const result4 = createMockLedgerResult(400, 10, "fourth"); // This causes eviction

  // Act: Add four entries
  cache.cacheTransactionData(100, result1);
  cache.cacheTransactionData(200, result2);
  cache.cacheTransactionData(300, result3);
  cache.cacheTransactionData(400, result4); // Should trigger eviction

  // Assert: Fourth entry should be evicted (pop() removes from end)
  // The implementation uses pop() which removes the last pushed item
  assertEquals(cache.getTransactionData(100) !== undefined, true);
  assertEquals(cache.getTransactionData(200) !== undefined, true);
  assertEquals(cache.getTransactionData(300) !== undefined, true);
  assertEquals(cache.getTransactionData(400), undefined); // Evicted
});

test("KVLedgerCache: multiple evictions when needed", () => {
  // Arrange: Very small cache
  // Each entry with length=10 takes 10*3=30 bytes
  // 50 byte cache can only hold 1 entry (30 bytes, leaving 20)
  const cache = new KVLedgerCache(50);
  const result1 = createMockLedgerResult(100, 10, "first");
  const result2 = createMockLedgerResult(200, 10, "second");
  const result3 = createMockLedgerResult(300, 10, "third");

  // Act: Add entries that require evictions
  cache.cacheTransactionData(100, result1); // 30 bytes, ok
  cache.cacheTransactionData(200, result2); // 60 bytes > 50, evict 200
  cache.cacheTransactionData(300, result3); // 60 bytes > 50, evict 300

  // Assert: Only first entry remains (implementation evicts newest with pop())
  assertEquals(cache.getTransactionData(100) !== undefined, true);
  assertEquals(cache.getTransactionData(200), undefined);
  assertEquals(cache.getTransactionData(300), undefined);
});

test("KVLedgerCache: clear removes all entries", () => {
  // Arrange
  const cache = new KVLedgerCache(1024);
  cache.cacheTransactionData(100, createMockLedgerResult(100, 50, "test1"));
  cache.cacheTransactionData(200, createMockLedgerResult(200, 50, "test2"));

  // Act
  cache.clear();

  // Assert: All entries should be gone
  assertEquals(cache.getTransactionData(100), undefined);
  assertEquals(cache.getTransactionData(200), undefined);
});

test("KVLedgerCache: updating existing entry doesn't duplicate", () => {
  // Arrange
  const cache = new KVLedgerCache(1024);
  const result1 = createMockLedgerResult(100, 50, "test");
  const result2 = createMockLedgerResult(100, 50, "updated");

  // Act: Cache same offset twice
  cache.cacheTransactionData(100, result1);
  cache.cacheTransactionData(100, result2);

  // Assert: Should have the updated entry
  const retrieved = cache.getTransactionData(100);
  // stringify() returns dot-separated string, not JSON
  assertEquals(retrieved?.transaction.key?.stringify(), "updated");
});

test("KVLedgerCache: respects max cache size", () => {
  // Arrange
  // Each entry with length=20 takes 20*3=60 bytes
  // 200 byte cache can hold about 3 entries
  const maxSize = 200;
  const cache = new KVLedgerCache(maxSize);

  // Act: Add many entries
  for (let i = 0; i < 10; i++) {
    cache.cacheTransactionData(
      i * 100,
      createMockLedgerResult(i * 100, 20, `test${i}`),
    );
  }

  // Assert: Only first entries should remain (eviction removes from end with pop())
  assertEquals(cache.getTransactionData(0) !== undefined, true);
  assertEquals(cache.getTransactionData(100) !== undefined, true);
  assertEquals(cache.getTransactionData(200) !== undefined, true);
  assertEquals(cache.getTransactionData(900), undefined);
});

test("KVLedgerCache: handles zero-length transactions", () => {
  // Arrange
  const cache = new KVLedgerCache(1024);
  const result = createMockLedgerResult(100, 0, "zero");

  // Act
  cache.cacheTransactionData(100, result);
  const retrieved = cache.getTransactionData(100);

  // Assert
  assertEquals(retrieved, result);
});

test("KVLedgerCache: handles large transactions", () => {
  // Arrange
  // length=3000 takes 3000*3=9000 bytes, fits in 10000 byte cache
  const cache = new KVLedgerCache(10000);
  const result = createMockLedgerResult(100, 3000, "large");

  // Act
  cache.cacheTransactionData(100, result);
  const retrieved = cache.getTransactionData(100);

  // Assert
  assertEquals(retrieved, result);
});

test("KVLedgerCache: eviction order uses pop (removes newest)", () => {
  // Arrange: Cache that can hold about 3 entries
  // Each entry with length=15 takes 15*3=45 bytes
  // 150 byte cache can hold about 3 entries (135 bytes)
  const cache = new KVLedgerCache(150);

  // Act: Add entries in specific order
  cache.cacheTransactionData(100, createMockLedgerResult(100, 15, "first"));
  cache.cacheTransactionData(200, createMockLedgerResult(200, 15, "second"));
  cache.cacheTransactionData(300, createMockLedgerResult(300, 15, "third"));
  cache.cacheTransactionData(400, createMockLedgerResult(400, 15, "fourth")); // Exceeds, triggers eviction

  // Assert: Implementation uses pop() which evicts newest (last pushed)
  assertEquals(
    cache.getTransactionData(100) !== undefined,
    true,
    "First should remain",
  );
  assertEquals(
    cache.getTransactionData(200) !== undefined,
    true,
    "Second should remain",
  );
  assertEquals(
    cache.getTransactionData(300) !== undefined,
    true,
    "Third should remain",
  );
  assertEquals(
    cache.getTransactionData(400),
    undefined,
    "Fourth should be evicted",
  );
});

test("KVLedgerCache: get after eviction returns undefined", () => {
  // Arrange
  // length=30 takes 30*3=90 bytes
  // 100 byte cache can hold 1 entry
  const cache = new KVLedgerCache(100);
  const result1 = createMockLedgerResult(100, 30, "first");
  const result2 = createMockLedgerResult(200, 30, "second");

  // Act: Cache first entry
  cache.cacheTransactionData(100, result1); // 90 bytes, ok

  // Assert: First entry should be cached
  assertEquals(cache.getTransactionData(100) !== undefined, true);

  // Act: Try to cache second entry which causes eviction of second (pop removes newest)
  cache.cacheTransactionData(200, result2); // 180 bytes > 100, evicts 200

  // Assert: Second entry should be evicted immediately (pop removes newest)
  assertEquals(cache.getTransactionData(100) !== undefined, true);
  assertEquals(cache.getTransactionData(200), undefined);
});

test("KVLedgerCache: handles rapid cache/evict cycles", () => {
  // Arrange
  // Each entry with length=10 takes 10*3=30 bytes
  // 100 byte cache can hold about 3 entries
  const cache = new KVLedgerCache(100);

  // Act: Rapidly add and evict entries
  for (let i = 0; i < 100; i++) {
    cache.cacheTransactionData(i, createMockLedgerResult(i, 10, `test${i}`));
  }

  // Assert: Only first 3 entries should remain (eviction removes newest with pop())
  assertEquals(cache.getTransactionData(0) !== undefined, true);
  assertEquals(cache.getTransactionData(1) !== undefined, true);
  assertEquals(cache.getTransactionData(2) !== undefined, true);
  assertEquals(cache.getTransactionData(99), undefined);
});

test("KVLedgerCache: clear resets size tracking", () => {
  // Arrange
  // length=20 takes 20*3=60 bytes, within 100 byte cache
  const cache = new KVLedgerCache(100);
  cache.cacheTransactionData(100, createMockLedgerResult(100, 20, "test"));

  // Act
  cache.clear();
  // Now add a new entry that would have exceeded size if not cleared
  cache.cacheTransactionData(200, createMockLedgerResult(200, 20, "test2"));

  // Assert: New entry should fit because cache was cleared
  assertEquals(cache.getTransactionData(200) !== undefined, true);
});

test("KVLedgerCache: handles multiple entries at different offsets", () => {
  // Arrange
  const cache = new KVLedgerCache(1000);
  const offsets = [100, 200, 300, 150, 250, 350];

  // Act: Cache at various offsets
  offsets.forEach((offset) => {
    cache.cacheTransactionData(
      offset,
      createMockLedgerResult(offset, 30, `test${offset}`),
    );
  });

  // Assert: All should be retrievable
  offsets.forEach((offset) => {
    assertEquals(
      cache.getTransactionData(offset) !== undefined,
      true,
      `Offset ${offset} should be cached`,
    );
  });
});
