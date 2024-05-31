// deno-lint-ignore-file no-explicit-any

// Internal dependencies
import { KVIndex } from "./index.ts";
import { type KVKey, KVKeyInstance, type KVQuery } from "./key.ts";
import {
  KVOperation,
  KVTransaction,
  type KVTransactionResult,
} from "./transaction.ts";
import { KVLedger } from "./ledger.ts";
import { LEDGER_CACHE_MB, SYNC_INTERVAL_MS } from "./constants.ts";

// External dependencies
import { EventEmitter } from "node:events";

/**
 * Represents the status of a synchronization operation between the in-memory index and the on-disk ledger.
 */
export type KVSyncResultStatus =
  | "noop" /** No operation was performed (e.g., ledger not open). */
  | "ready" /** The database is ready, no new data to synchronize. */
  | "blocked" /** Synchronization is temporarily blocked (e.g., during a vacuum). */
  | "success" /** Synchronization completed successfully, new data was added. */
  | "ledgerInvalidated" /** The ledger was invalidated and needs to be reopened. */
  | "error"; /** An error occurred during synchronization. Check the `error` property for details. */

/**
 * The result of a synchronization operation between the in-memory index and the on-disk ledger.
 */
export interface KVSyncResult {
  /**
   * Indicates the status of the synchronization operation.
   */
  result: KVSyncResultStatus;
  /**
   * If an error occurred during synchronization, this property will contain the Error object. Otherwise, it will be null.
   */
  error: Error | null;
}

/**
 * A function that is called when a watched transaction occurs.
 */
export interface WatchHandler<T> {
  /**
   * The query used to filter the transactions.
   */
  query: KVQuery;
  /**
   * The callback function that will be called when a transaction matches the query.
   */
  callback: (transaction: KVTransactionResult<T>) => void;
  /**
   * Whether to include child keys
   */
  recursive: boolean;
}

/**
 * Options for configuring the behavior of the KV store.
 */
export interface KVOptions {
  /**
   * Enables or disables automatic synchronization of the in-memory index with the on-disk ledger.
   *
   * When enabled (default), a background process will periodically sync the index to ensure consistency
   * across multiple processes. Disabling this may improve performance in single-process scenarios,
   * but you'll need to manually call `kvStore.sync()` to keep the index up-to-date.
   *
   * @defaultValue `true`
   */
  autoSync?: boolean;

  /**
   * The time interval (in milliseconds) between automatic synchronization operations.
   *
   * This value controls how frequently the in-memory index is updated with changes from the on-disk ledger.
   * A shorter interval provides more up-to-date data at the cost of potentially higher overhead.
   * A longer interval reduces overhead but may result in stale data.
   *
   * @defaultValue `1000`
   */
  syncIntervalMs?: number;

  /**
   * The maximum size (in megabytes) of raw ledger data to cache in memory.
   *
   * Note that actual memory usage may be slightly higher due to the associated overhead of storing index data and metadata.
   *
   * @defaultValue `10` (10 MB)
   */
  ledgerCacheSize?: number;

  /**
   * Disables the in-memory index, leading to faster loading,
   * but preventing efficient querying and iteration using `get`, `iterate`, `scan`, and `list`.
   *
   * When `disableIndex` is true:
   * - Only the `set`, `delete`, and `scan` operations are available.
   * - Use cases are limited to scenarios where only appending to the ledger is required.
   * - Memory usage is minimized as the in-memory index is not maintained.
   *
   * @defaultValue `false`
   */
  disableIndex?: boolean;
}

/**
 * A cross-platform key-value store backed by file storage.
 *
 * Provides a persistent and reliable storage mechanism for key-value pairs,
 * using an on-disk ledger for data integrity and an in-memory index for efficient retrieval.
 */
export class KV extends EventEmitter {
  // Storage
  private index: KVIndex = new KVIndex();
  private ledger?: KVLedger;
  private pendingTransactions: KVTransaction[] = [];
  private watchHandlers: WatchHandler<any>[] = [];

  // Configuration
  private ledgerPath?: string;
  private ledgerCacheSize: number = LEDGER_CACHE_MB;
  /** Public only for testing purposes */
  public autoSync: boolean = true;
  /** Public only for testing purposes */
  public syncIntervalMs: number = SYNC_INTERVAL_MS;
  private disableIndex = false;

  // States
  private blockSync: boolean = false; // Syncing can be blocked during vacuum
  private aborted: boolean = false;
  private isInTransaction: boolean = false;
  private watchdogTimer?: number; // Undefined if not scheduled or currently running
  private watchdogPromise?: Promise<void>;

  /**
   * Initializes a new instance of the cross/kv main class `KV`.
   *
   * @param options - The configuration options for the KV store.
   *
   * @throws {Error} If any of the provided options are invalid (e.g., negative `syncIntervalMs`).
   */
  constructor(options: KVOptions = {}) {
    super();

    // Validate and set options
    // - autoSync
    if (
      options.autoSync !== undefined && typeof options.autoSync !== "boolean"
    ) {
      throw new TypeError("Invalid option: autoSync must be a boolean");
    }
    this.autoSync = options.autoSync ?? true;
    // - syncIntervalMs
    if (
      options.syncIntervalMs !== undefined &&
      (!Number.isInteger(options.syncIntervalMs) || options.syncIntervalMs <= 0)
    ) {
      throw new TypeError(
        "Invalid option: syncIntervalMs must be a positive integer",
      );
    }
    this.syncIntervalMs = options.syncIntervalMs ?? SYNC_INTERVAL_MS;
    // - ledgerCacheSize
    if (
      options.ledgerCacheSize !== undefined &&
      (!Number.isInteger(options.ledgerCacheSize) ||
        options.ledgerCacheSize <= 0)
    ) {
      throw new TypeError(
        "Invalid option: ledgerCacheSize must be a positive integer",
      );
    }
    this.ledgerCacheSize = options.ledgerCacheSize ?? this.ledgerCacheSize;
    // - disableIndex
    if (
      options.disableIndex !== undefined &&
      typeof options.disableIndex !== "boolean"
    ) {
      throw new TypeError("Invalid option: disableIndex must be a boolean");
    }
    this.disableIndex = options.disableIndex ?? false;

    if (this.autoSync) {
      this.watchdogPromise = this.watchdog();
    }
  }
  /**
   * Opens the Key-Value store based on a provided file path.
   * Initializes the index and data files.
   *
   * @param filePath - Path to the base file for the KV store. Index and data files will be derived from this path.
   * @param createIfMissing - If true, the KV store files will be created if they do not exist. Default is true.
   */
  public async open(
    filePath: string,
    createIfMissing: boolean = true,
  ) {
    // Do not allow re-opening a closed database
    if (this.aborted) {
      throw new Error("Could not open, database already closed.");
    }

    // If there is an existing ledger, close it and clear the index
    if (this.ledger) {
      this.index.clear();
    }

    // Open the ledger, and start a new watchdog
    this.ledger = new KVLedger(filePath, this.ledgerCacheSize);
    this.ledgerPath = filePath;
    await this.ledger.open(createIfMissing);

    // Do the initial synchronization
    // - If `this.autoSync` is enabled, additional synchronizations will be carried out every `this.syncIntervalMs`
    const syncResult = await this.sync(true);
    if (syncResult.error) {
      throw syncResult.error;
    }
  }

  /**
   * Forcibly unlocks the underlying ledger file.
   *
   * **WARNING:** This method should only be used in exceptional circumstances,
   * such as recovering from crashes or unexpected shutdowns. It may lead to data
   * corruption if used incorrectly while other processes are actively using the ledger.
   *
   * @throws If ledger isn't open, or on unexpected errors.
   */
  public async forceUnlockLedger(): Promise<void> {
    if (!this.ledger) {
      throw new Error("No ledger is currently open.");
    }

    await this.ledger.unlock();
  }

  /**
   * Starts a background process to periodically synchronize the in-memory index with the on-disk ledger.
   *
   * This function is crucial for maintaining consistency between the index and the ledger when the database is
   * accessed by multiple processes or consumers.
   *
   * It is automatically invoked if `autoSync` is enabled during construction.
   *
   * @emits sync - Emits an event if anything goes wrong, containing the following information:
   *   - `result`: "error"
   *   - `error`: Error object
   *
   * @remarks
   * - The synchronization interval is controlled by the `syncIntervalMs` property.
   * - If the ledger is not open or is in the process of closing, the synchronization will not occur.
   * - Errors during synchronization are emitted as `sync` events with the error in the payload.
   */
  private async watchdog() {
    if (this.aborted) return;

    // Wrap all operations in try/catch
    try {
      await this.sync();
    } catch (watchdogError) {
      // Use the same event reporting format as the sync() method
      const syncResult = "error";
      const errorDetails = new Error(
        "Error in watchdog: " + watchdogError.message,
        { cause: watchdogError },
      );
      // @ts-ignore .emit does indeed exist
      this.emit("sync", { result: syncResult, error: errorDetails });
    }

    // Reschedule
    this.watchdogTimer = setTimeout(
      async () => {
        // Make sure current run is done
        try {
          await this.watchdogPromise;
        } catch (_e) { /* Ignore */ }

        // Initiate a new run
        this.watchdogPromise = this.watchdog();
      },
      this.syncIntervalMs,
    );
  }

  /**
   * Synchronizes the in-memory index with the on-disk ledger.
   *
   * - Automatically run on a specified interval (if autoSync option is enabled)
   * - Automatically run on adding data
   * - Can be manually triggered for full consistency before data retrieval (iterate(), listAll(), get())
   *
   * @param force - (Optional) If true, forces synchronization even if currently blocked (e.g., vacuum). For internal use only.
   * @param doLock - (Optional) Locks the database before synchronization. Defaults to true. Always true unless called internally.
   *
   * @emits sync - Emits an event with the synchronization result:
   *   - `result`: "ready" | "blocked" | "success" | "ledgerInvalidated" | "error"
   *   - `error`: Error object (if an error occurred) or null
   *
   * @throws {Error} If an unexpected error occurs during synchronization.
   */
  public async sync(force = false, doLock = false): Promise<KVSyncResult> {
    // Throw if database isn't open
    if (force) this.ensureOpen();

    if (this.blockSync && !force) {
      const error = new Error("Store synchronization is blocked");
      // @ts-ignore .emit exists
      this.emit("sync", { result: "blocked", error });
      return { result: "blocked", error };
    }

    // Synchronization Logic (with lock if needed)
    let result: KVSyncResult["result"] = "ready";
    let error: Error | null = null;
    let lockSucceeded = false; // Keeping track as we only want to unlock the database later, if the locking operation succeeded
    try {
      if (doLock) await this.ledger?.lock();
      lockSucceeded = true;

      const newTransactions = await this.ledger?.sync(this.disableIndex);

      if (newTransactions === null) { // Ledger invalidated
        result = "ledgerInvalidated";
        await this.open(this.ledgerPath!, false); // Reopen ledger
      } else {
        result = newTransactions?.length ? "success" : "ready"; // Success if new transactions exist
        if (newTransactions && !this.disableIndex) {
          for (const entry of newTransactions) {
            try {
              this.applyTransactionToIndex(entry.transaction, entry.offset); // Refactored for clarity
            } catch (transactionError) {
              result = "error";
              error = new Error("Error processing transaction", {
                cause: transactionError,
              });
              break; // Stop processing on transaction error
            }
          }
        }
      }
    } catch (syncError) {
      result = "error";
      error = new Error("Error during ledger sync", { cause: syncError });
    } finally {
      if (doLock && lockSucceeded) await this.ledger?.unlock();
      // @ts-ignore .emit exists
      this.emit("sync", { result, error });
    }

    return { result, error };
  }

  /**
   * Asynchronously iterates over data entries associated with a given key.
   *
   * @param query - Representation of the key to search for, or a query object for complex filters.
   * @param recursive - Match all entries matching the given query, and recurse.
   * @returns An async generator yielding `KVTransactionResult` objects for each matching entry.
   */
  public async *scan<T = unknown>(
    query: KVKey | KVQuery,
    recursive: boolean = false,
  ): AsyncGenerator<KVTransactionResult<T>> {
    this.ensureOpen();
    for await (const result of this.ledger!.scan(query, recursive)) {
      if (result?.transaction) { // Null check to ensure safety
        const processedResult = result.transaction.asResult<T>(); // Apply your processing logic here
        yield processedResult;
      }
    }
  }

  /**
   * Applies a transaction to the in-memory index.
   *
   * This method updates the index based on the operation specified in the transaction.
   *
   * @param transaction - The transaction to apply.
   * @param offset - The offset of the transaction within the ledger.
   *
   * @throws {Error} If the database is not open or if the transaction operation is unsupported.
   */
  private applyTransactionToIndex(transaction: KVTransaction, offset: number) {
    this.ensureOpen();
    this.ensureIndex();

    // Check for matches in watch handlers
    for (const handler of this.watchHandlers) {
      if (transaction.key!.matchesQuery(handler.query, handler.recursive)) {
        handler.callback(transaction.asResult());
      }
    }

    // Add the transaction to index
    switch (transaction.operation) {
      case KVOperation.SET:
        this.index.add(transaction.key!, offset);
        break;
      case KVOperation.DELETE:
        this.index.delete(transaction.key!);
        break;
      default:
        throw new Error(`Unsupported operation: ${transaction.operation}`); // Handle unknown operations explicitly
    }
  }

  /**
   * Function that throws of the index is disabled.
   *
   * @throws {Error} If the index is disabled.
   */
  private ensureIndex(): void {
    if (this.disableIndex) {
      throw new Error(
        "Operation not available due to `disableIndex` option being set.",
      );
    }
  }

  /**
   * Performs a vacuum operation to reclaim space in the underlying ledger.
   *
   * This operation is essential for maintaining performance as the database grows over time.
   * It involves rewriting the ledger to remove deleted entries, potentially reducing its size.
   *
   * @remarks
   * - Vacuuming temporarily blocks regular synchronization (`blockSync` is set to `true`).
   * - The database is automatically re-opened after the vacuum is complete to ensure consistency.
   *
   * @async
   */
  public async vacuum(): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();
    this.ensureIndex();

    this.blockSync = true;
    try {
      await this.ledger?.vacuum();

      // Force re-opening the database
      await this.open(this.ledgerPath!, false);
    } finally {
      // Ensure blockSync is reset even if vacuum throws an error
      this.blockSync = false;
    }
  }

  /**
   * Begins a new transaction.
   * @throws {Error} If already in a transaction.
   */
  public beginTransaction() {
    // Throw if database isn't open
    this.ensureOpen();

    if (this.isInTransaction) throw new Error("Already in a transaction");
    this.isInTransaction = true;
  }

  /**
   * Ensures the database is open, throwing an error if it's not.
   *
   * @private
   * @throws {Error} If the database is not open.
   */
  private ensureOpen(): void {
    if (!this.isOpen()) {
      throw new Error("Database not open");
    }
  }

  /**
   * Checks if the database is open and ready for interaction
   *
   * @returns True if open, false if closed.
   */
  public isOpen(): boolean {
    return !!this.ledger && this.ledger.isOpen();
  }

  /**
   * Retrieves the first value associated with the given key, or null.
   *
   * @param key - Representation of the key.
   * @returns A promise that resolves to the retrieved value, or null if not found.
   */
  public async get<T = unknown>(
    key: KVKey,
  ): Promise<KVTransactionResult<T> | null> {
    // Throw if database isn't open
    this.ensureOpen();
    this.ensureIndex();
    for await (const entry of this.iterate<T>(key, 1)) {
      return entry;
    }
    return null;
  }

  /**
   * Asynchronously iterates over data entries associated with a given key.
   *
   * This method is ideal for processing large result sets efficiently, as it doesn't
   * load all entries into memory at once. Use `for await...of` to consume the entries
   * one by one, or `list` to retrieve all entries as an array.
   *
   * @param key - Representation of the key to search for.
   * @param limit - (Optional) Maximum number of entries to yield. If not provided, all
   *               entries associated with the key will be yielded.
   * @param reverse - (Optional) Return the results in reverse insertion order, most recent first. Defaulting to false - oldest first.
   * @yields An object containing the `ts` (timestamp) and `data` for each matching entry.
   *
   * @example
   * // Iterating with for await...of
   * for await (const entry of kvStore.iterate(["users"])) {
   *   console.log(entry);
   * }
   *
   * // Retrieving all entries as an array
   * const allEntries = await kvStore.list(["users"]);
   * console.log(allEntries);
   */
  public async *iterate<T = unknown>(
    key: KVQuery,
    limit?: number,
    reverse: boolean = false,
  ): AsyncGenerator<KVTransactionResult<T>> {
    // Throw if database isn't open
    this.ensureOpen();
    this.ensureIndex();
    const validatedKey = new KVKeyInstance(key, true);
    const offsets = this.index!.get(validatedKey, limit, reverse)!;

    if (offsets === null || offsets.length === 0) {
      return; // No results to yield
    }

    let count = 0;
    for (const offset of offsets) {
      const result = await this.ledger?.rawGetTransaction(offset, true);
      if (result?.transaction) {
        yield result.transaction.asResult();
        count++;
      }
      if (limit && count >= limit) break;
    }
  }

  /**
   * Retrieves all data entries associated with a given key as an array.
   *
   * This is a convenience method that utilizes `iterate` to collect
   * all yielded entries into an array.
   *
   * @param key - Representation of the key to query.
   * @param limit - (Optional) Maximum number of entries to return. If not provided, all
   *               entries associated with the key will be yielded.
   * @param reverse - (Optional) Return the results in reverse insertion order, most recent first. Defaulting to false - oldest first.
   * @returns A Promise that resolves to an array of all matching data entries.
   */
  public async listAll<T = unknown>(
    key: KVQuery,
    limit?: number,
    reverse: boolean = false,
  ): Promise<KVTransactionResult<T>[]> {
    // Throw if database isn't open
    this.ensureOpen();
    this.ensureIndex();

    const entries: KVTransactionResult<T>[] = [];
    for await (const entry of this.iterate<T>(key, limit, reverse)) {
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Counts the number of values associated with the given key in the index.
   *
   * This method efficiently determines the total count without needing to
   * fetch and process all the data entries themselves.
   *
   * @param key - Representation of the key to search for.
   * @returns A Promise that resolves to the number of values associated with the key.
   *          If no values are found, the Promise resolves to 0.
   *
   * @remarks
   */
  public count(key: KVQuery): number {
    // Throw if database isn't open
    this.ensureOpen();
    this.ensureIndex();

    const validatedKey = new KVKeyInstance(key, true);
    const offsets = this.index.get(validatedKey);
    return offsets?.length ?? 0;
  }

  /**
   * Stores a value associated with the given key.
   *
   * @param key - Representation of the key.
   * @param value - The value to store.
   */
  public async set<T = unknown>(key: KVKey, value: T): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();
    // Throw if there is an ongoing vacuum
    if (this.blockSync) {
      throw new Error("Can not add data during vacuuming");
    }

    // Ensure the key is ok
    const validatedKey = new KVKeyInstance(key);
    const transaction = new KVTransaction();

    await transaction.create(
      validatedKey,
      KVOperation.SET,
      Date.now(),
      value,
    );
    // Enqueue transaction
    if (!this.isInTransaction) {
      this.beginTransaction();
      this.pendingTransactions.push(transaction);
      const result = await this.endTransaction();
      if (result.length) {
        throw result[0];
      }
    } else {
      this.pendingTransactions.push(transaction);
    }
  }

  /**
   * Deletes the key-value pair with the given key.
   * @param key - Representation of the key.
   * @throws {Error} If the key is not found in the index, or if the database or ledger file is closed.
   */
  async delete(key: KVKey): Promise<void> {
    this.ensureOpen(); // Throw if the database isn't open

    if (this.blockSync) {
      throw new Error("Cannot delete data during vacuuming");
    }

    const validatedKey = new KVKeyInstance(key);

    const pendingTransaction = new KVTransaction();
    pendingTransaction.create(validatedKey, KVOperation.DELETE, Date.now());

    if (!this.isInTransaction) {
      this.beginTransaction();
      this.pendingTransactions.push(pendingTransaction);
      const result = await this.endTransaction();
      if (result.length) {
        throw result[0];
      }
    } else {
      this.pendingTransactions.push(pendingTransaction);
    }
  }

  /**
   * Ends the current transaction, executing all pending operations in a batched write.
   *
   * @returns {Promise<Error[]>} A promise resolving to an array of errors encountered during transaction execution (empty if successful).
   *
   * @throws {Error} If not in a transaction or if the database is not open.
   */
  public async endTransaction(): Promise<Error[]> {
    this.ensureOpen();
    if (!this.isInTransaction) throw new Error("Not in a transaction");

    const bufferedTransactions: {
      transaction: KVTransaction;
      transactionData: Uint8Array;
      relativeOffset: number;
    }[] = [];
    const errors: Error[] = [];

    // Prepare transaction data and offsets
    let currentOffset = 0;
    for (const transaction of this.pendingTransactions) {
      const transactionData = await transaction.toUint8Array();
      bufferedTransactions.push({
        transaction,
        transactionData,
        relativeOffset: currentOffset,
      });
      currentOffset += transactionData.length;
    }

    await this.ledger!.lock();
    let unlocked = false;
    try {
      // Sync before writing the transactions
      const syncResult = await this.sync(false, false);
      if (syncResult.error) {
        throw syncResult.error;
      }

      // Write all buffered transactions at once and get the base offset
      const baseOffset = await this.ledger!.add(bufferedTransactions);

      // Unlock early if everying successed
      await this.ledger!.unlock();
      unlocked = true;

      // Update the index and check for errors
      for (
        const { transaction, transactionData, relativeOffset }
          of bufferedTransactions
      ) {
        try {
          // Add to ledger cache
          this.ledger!.cache.cacheTransactionData(
            baseOffset + relativeOffset,
            {
              offset: baseOffset + relativeOffset,
              length: transactionData.length,
              complete: true,
              transaction,
            },
          );

          // Add to index
          if (!this.disableIndex) {
            this.applyTransactionToIndex(
              transaction,
              baseOffset + relativeOffset,
            );
          }
        } catch (error) {
          errors.push(error as Error);
        }
      }
    } finally {
      // Back-up unlock
      if (!unlocked) await this.ledger!.unlock();
      this.pendingTransactions = []; // Clear pending transactions
      this.isInTransaction = false;
    }

    return errors;
  }

  /**
   * Aborts the current transaction, discarding all pending operations.
   *
   * @throws {Error} If not in a transaction or if the database is not open.
   */
  public abortTransaction(): void {
    this.ensureOpen();
    if (!this.isInTransaction) throw new Error("Not in a transaction");

    // Clear pending transactions
    this.pendingTransactions = [];
    this.isInTransaction = false;
  }

  /**
   * Lists the immediate child keys under a given key, or lists all root keys if `null` is provided.
   *
   * @param key - The parent key for which to retrieve child keys. If `null`, lists all root keys.
   * @returns An array of strings representing the immediate child keys.
   *          If the key doesn't exist or has no children, an empty array is returned.
   */
  public listKeys(key: KVKey | KVQuery | null): string[] {
    // Throw if database isn't open
    this.ensureOpen();
    this.ensureIndex();

    return this.index.getChildKeys(
      key === null ? null : new KVKeyInstance(key, true),
    );
  }

  /**
   * Registers a callback function to be called whenever a new transaction matching the given query is added to the database.
   *
   * @param query - The query to match against new transactions.
   * @param callback - The callback function to be called when a match is found. The callback will receive the matching transaction as its argument.
   */
  public watch<T = unknown>(
    query: KVQuery,
    callback: (transaction: KVTransactionResult<T>) => void,
    recursive: boolean = false,
  ) {
    this.ensureIndex();
    this.watchHandlers.push({ query, callback, recursive });
  }

  /**
   * Unregisters a previously registered watch handler.
   *
   * Both query and callback must be a reference to the original values passed to `.watch()`
   *
   * @param query - The original query or handlerused to register the watch handler.
   * @param callback - The callback function used to register the watch handler.
   *
   * @returns True on success
   */
  public unwatch<T = unknown>(
    query: KVQuery,
    callback: (transaction: KVTransactionResult<T>) => void,
  ): boolean {
    this.ensureIndex();
    const newWatchHandlers = this.watchHandlers.filter(
      (handler) => handler.query !== query || handler.callback !== callback,
    );
    const result = newWatchHandlers.length !== this.watchHandlers.length;
    this.watchHandlers = newWatchHandlers;
    return result;
  }

  /**
   * Closes the database gracefully.
   *
   * 1. Waits for any ongoing watchdog task to complete.
   * 2. Emits a 'closing' event to notify listeners.
   * 3. Closes the associated ledger.
   */
  public async close() {
    // @ts-ignore emit exists
    this.emit("closing");

    // Used to stop any pending watchdog runs
    this.aborted = true;

    // Await running watchdog
    await this.watchdogPromise;

    // Abort any watchdog timer
    clearTimeout(this.watchdogTimer!);
  }

  /**
   * Gets the path to the currently configured ledger, if there is one.
   */
  public getLedgerPath(): string | undefined {
    return this.ledgerPath;
  }
}
