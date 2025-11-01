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

test("KVLedgerCache: FIFO eviction when size exceeded", () => {
  // Arrange: Small cache that can hold ~2 entries
  const cache = new KVLedgerCache(100); // 100 bytes max
  const result1 = createMockLedgerResult(100, 50, "first");
  const result2 = createMockLedgerResult(200, 50, "second");
  const result3 = createMockLedgerResult(300, 50, "third");

  // Act: Add three entries, should evict the oldest
  cache.cacheTransactionData(100, result1);
  cache.cacheTransactionData(200, result2);
  cache.cacheTransactionData(300, result3); // Should trigger eviction

  // Assert: First entry should be evicted (FIFO)
  assertEquals(cache.getTransactionData(100), undefined);
  assertEquals(cache.getTransactionData(200) !== undefined, true);
  assertEquals(cache.getTransactionData(300) !== undefined, true);
});

test("KVLedgerCache: multiple evictions when needed", () => {
  // Arrange: Very small cache
  const cache = new KVLedgerCache(50);
  const result1 = createMockLedgerResult(100, 30, "first");
  const result2 = createMockLedgerResult(200, 30, "second");
  const result3 = createMockLedgerResult(300, 30, "third");

  // Act: Add entries that require multiple evictions
  cache.cacheTransactionData(100, result1);
  cache.cacheTransactionData(200, result2);
  cache.cacheTransactionData(300, result3);

  // Assert: Oldest entries should be evicted
  assertEquals(cache.getTransactionData(100), undefined);
  assertEquals(cache.getTransactionData(200), undefined);
  assertEquals(cache.getTransactionData(300) !== undefined, true);
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
  assertEquals(retrieved?.transaction.key?.stringify(), '["updated"]');
});

test("KVLedgerCache: respects max cache size", () => {
  // Arrange
  const maxSize = 200;
  const cache = new KVLedgerCache(maxSize);

  // Act: Add many entries
  for (let i = 0; i < 10; i++) {
    cache.cacheTransactionData(
      i * 100,
      createMockLedgerResult(i * 100, 40, `test${i}`),
    );
  }

  // Assert: Early entries should be evicted, later ones retained
  assertEquals(cache.getTransactionData(0), undefined);
  assertEquals(cache.getTransactionData(100), undefined);
  assertEquals(cache.getTransactionData(900) !== undefined, true);
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
  const cache = new KVLedgerCache(10000);
  const result = createMockLedgerResult(100, 5000, "large");

  // Act
  cache.cacheTransactionData(100, result);
  const retrieved = cache.getTransactionData(100);

  // Assert
  assertEquals(retrieved, result);
});

test("KVLedgerCache: eviction order is FIFO", () => {
  // Arrange: Cache that can hold 2-3 entries
  const cache = new KVLedgerCache(150);

  // Act: Add entries in specific order
  cache.cacheTransactionData(100, createMockLedgerResult(100, 40, "first"));
  cache.cacheTransactionData(200, createMockLedgerResult(200, 40, "second"));
  cache.cacheTransactionData(300, createMockLedgerResult(300, 40, "third"));
  cache.cacheTransactionData(400, createMockLedgerResult(400, 40, "fourth"));

  // Assert: First entries should be evicted in FIFO order
  assertEquals(
    cache.getTransactionData(100),
    undefined,
    "First should be evicted",
  );
  assertEquals(
    cache.getTransactionData(200),
    undefined,
    "Second should be evicted",
  );
  assertEquals(
    cache.getTransactionData(300) !== undefined,
    true,
    "Third should remain",
  );
  assertEquals(
    cache.getTransactionData(400) !== undefined,
    true,
    "Fourth should remain",
  );
});

test("KVLedgerCache: get after eviction returns undefined", () => {
  // Arrange
  const cache = new KVLedgerCache(100);
  const result1 = createMockLedgerResult(100, 60, "first");
  const result2 = createMockLedgerResult(200, 60, "second");

  // Act: Cache first, then second (which evicts first)
  cache.cacheTransactionData(100, result1);
  cache.cacheTransactionData(200, result2);

  // Assert: First entry should be evicted
  assertEquals(cache.getTransactionData(100), undefined);

  // Act: Re-cache after eviction
  cache.cacheTransactionData(100, result1);

  // Assert: Should be cached again
  assertEquals(cache.getTransactionData(100) !== undefined, true);
});

test("KVLedgerCache: handles rapid cache/evict cycles", () => {
  // Arrange
  const cache = new KVLedgerCache(100);

  // Act: Rapidly add and evict entries
  for (let i = 0; i < 100; i++) {
    cache.cacheTransactionData(i, createMockLedgerResult(i, 50, `test${i}`));
  }

  // Assert: Only most recent entries should remain
  assertEquals(cache.getTransactionData(0), undefined);
  assertEquals(cache.getTransactionData(50), undefined);
  assertEquals(cache.getTransactionData(99) !== undefined, true);
});

test("KVLedgerCache: clear resets size tracking", () => {
  // Arrange
  const cache = new KVLedgerCache(100);
  cache.cacheTransactionData(100, createMockLedgerResult(100, 80, "test"));

  // Act
  cache.clear();
  // Now add a new entry that would have exceeded size if not cleared
  cache.cacheTransactionData(200, createMockLedgerResult(200, 80, "test2"));

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
