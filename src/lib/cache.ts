import { LEDGER_CACHE_MEMORY_FACTOR } from "./constants.ts";
import type { KVLedgerResult } from "./ledger.ts";

/**
 * An in-memory cache for `KVLedgerResult` objects.
 *
 * This cache stores transaction results (`KVLedgerResult`) associated with their offsets within the ledger.
 * It maintains a fixed maximum size and evicts the oldest entries (Least Recently Used - LRU)
 * when the cache becomes full.  Since the ledger is append-only, expiration is not necessary.
 *
 * Note: The `cacheSizeBytes` property is an approximation of the cache's size and represents
 *       the encoded size of the transaction data on disk, not the actual memory usage of the cached objects.
 *
 * Note: A plain JavaScript object is used for the cache instead of a `Map` for efficiency.
 *       Since offsets are numeric, objects provide faster lookups (O(1)) compared to `Map`
 *       in this specific use case.
 *
 *       Additionally, an array of inserted offsets is used to provide O(1) lookups of offsets
 *       to evict.
 */
export class KVLedgerCache {
  private cache: Record<number, KVLedgerResult> = {};
  private cacheEntries: number[] = [];
  private cacheSizeBytes = 0;
  /** Maximum allowed size of the cache (in bytes). */
  public maxCacheSizeBytes: number;

  /**
   * Creates a new `KVLedgerCache`.
   * @param maxCacheSizeBytes Maximum size of the cache in bytes.
   */
  constructor(maxCacheSizeBytes: number) {
    this.maxCacheSizeBytes = maxCacheSizeBytes;
  }

  /**
   * Caches a `KVLedgerResult` at the specified offset.
   * If the cache exceeds its maximum size, the oldest entries are evicted.
   * @param offset The offset of the transaction in the ledger.
   * @param transaction The `KVLedgerResult` object to cache.
   */
  cacheTransactionData(offset: number, transaction: KVLedgerResult): void {
    if (!this.cache[offset]) this.cacheEntries.push(offset);
    this.cache[offset] = transaction;
    this.cacheSizeBytes += transaction.length * LEDGER_CACHE_MEMORY_FACTOR;

    this.evictOldestEntries();
  }

  /**
   * Retrieves a cached `KVLedgerResult` by its offset.
   * @param offset The offset of the transaction in the ledger.
   * @returns The cached `KVLedgerResult` or `undefined` if not found.
   */
  getTransactionData(offset: number): KVLedgerResult | undefined {
    return this.cache[offset];
  }

  /**
   * Clears the cache, removing all entries and resetting the cache size.
   */
  clear(): void {
    this.cache = {};
    this.cacheEntries = [];
    this.cacheSizeBytes = 0;
  }

  /**
   * Evicts the oldest entries from the cache until the size is within the limit.
   * This method is called automatically by `cacheTransactionData`.
   */
  private evictOldestEntries(): void {
    while (this.cacheSizeBytes > this.maxCacheSizeBytes) {
      const oldestOffset = this.cacheEntries.pop() as number;
      if (oldestOffset) {
        const oldestData = this.cache[oldestOffset];
        delete this.cache[oldestOffset];
        this.cacheSizeBytes -= oldestData.length * LEDGER_CACHE_MEMORY_FACTOR;
      }
    }
  }
}
