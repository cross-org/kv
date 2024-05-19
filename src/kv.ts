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
import { SYNC_INTERVAL_MS } from "./constants.ts";

// External dependencies
import { EventEmitter } from "node:events";

/**
 * Represents the status of a synchronization operation between the in-memory index and the on-disk ledger.
 */
export type KVSyncResultStatus =
  | "noop" // No operation was performed (e.g., ledger not open)
  | "ready" // The database is ready, no new data
  | "blocked" // Synchronization is blocked (e.g., during a vacuum)
  | "success" // The database is ready, new data were synchronized
  | "ledgerInvalidated" // The ledger was invalidated and needs to be reopened
  | "error"; // An error occurred during synchronization, check .error for details

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

  // Configuration
  private ledgerPath?: string;
  /** Public only for testing purposes */
  public autoSync: boolean = true;
  /** Public only for testing purposes */
  public syncIntervalMs: number = SYNC_INTERVAL_MS;

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
      this.ledger?.close();
      this.index.clear();
    }

    // Open the ledger, and start a new watchdog
    this.ledger = new KVLedger(filePath);
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
        await this.watchdogPromise;

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
  public async sync(force = false, doLock = true): Promise<KVSyncResult> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure ledger is open and instance is not closed
    if (this.ledger?.isClosing() || this.aborted) {
      const error = new Error(
        this.aborted ? "Store is closed" : "Ledger is not open",
      );
      return { result: "noop", error }; // Emit noop since no sync was performed
    }

    if (this.blockSync && !force) {
      const error = new Error("Store synchronization is blocked");
      // @ts-ignore .emit exists
      this.emit("sync", { result: "blocked", error });
      return { result: "blocked", error };
    }

    // Synchronization Logic (with lock if needed)
    let result: KVSyncResult["result"] = "ready";
    let error: Error | null = null;

    try {
      if (doLock) await this.ledger?.lock();

      const newTransactions = await this.ledger?.sync();

      if (newTransactions === null) { // Ledger invalidated
        result = "ledgerInvalidated";
        await this.open(this.ledgerPath!, false); // Reopen ledger
      } else {
        result = newTransactions?.length ? "success" : "ready"; // Success if new transactions exist

        if (newTransactions) {
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
      if (doLock) await this.ledger?.unlock();
      // @ts-ignore .emit exists
      this.emit("sync", { result, error });
    }

    return { result, error };
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
    // Throw if database isn't open
    this.ensureOpen();

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

    this.blockSync = true;
    await this.ledger?.vacuum();

    // Force re-opening the database
    await this.open(this.ledgerPath!, false);
    this.blockSync = false;
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
   * Ends the current transaction, executing all pending operations.
   *
   * @returns {Promise<Error[]>} A promise resolving to an array of errors
   *                             encountered during transaction execution (empty if successful).
   */
  public async endTransaction(): Promise<Error[]> {
    // Throw if database isn't open
    this.ensureOpen();

    if (!this.isInTransaction) throw new Error("Not in a transaction");

    // Run transactions
    let p = this.pendingTransactions.pop();
    const errors: Error[] = [];
    while (p) {
      try {
        await this.runTransaction(p);
      } catch (e) {
        errors.push(e);
      }
      p = this.pendingTransactions.pop();
    }

    // Done
    this.isInTransaction = false;

    return errors;
  }

  /**
   * Ensures the database is open, throwing an error if it's not.
   *
   * @private
   * @throws {Error} If the database is not open.
   */
  private ensureOpen(): void {
    if (!this.ledger || this.ledger.isClosing()) {
      throw new Error("Database not open");
    }
  }

  /**
   * Retrieves the first value associated with the given key, or null.
   *
   * @param key - Representation of the key.
   * @returns A promise that resolves to the retrieved value, or null if not found.
   */
  public async get(key: KVKey): Promise<KVTransactionResult | null> {
    // Throw if database isn't open
    this.ensureOpen();

    for await (const entry of this.iterate(key, 1)) {
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
  public async *iterate(
    key: KVQuery,
    limit?: number,
  ): AsyncGenerator<KVTransactionResult> {
    // Throw if database isn't open
    this.ensureOpen();

    const validatedKey = new KVKeyInstance(key, true);
    const offsets = this.index!.get(validatedKey, limit)!;

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
   * @returns A Promise that resolves to an array of all matching data entries.
   */
  public async listAll(key: KVQuery): Promise<KVTransactionResult[]> {
    // Throw if database isn't open
    this.ensureOpen();

    const entries: KVTransactionResult[] = [];
    for await (const entry of this.iterate(key)) {
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
  public async set(
    key: KVKey,
    value: any,
  ): Promise<void> {
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
      await this.runTransaction(transaction);
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

    // Ensure the key exists in the index by performing a sync
    await this.sync();

    // Check if the key exists in the index after the sync
    const keyExistsInIndex = this.index.get(validatedKey, 1);

    if (!keyExistsInIndex.length) {
      throw new Error("Key not found");
    }

    const pendingTransaction = new KVTransaction();
    pendingTransaction.create(validatedKey, KVOperation.DELETE, Date.now());

    if (!this.isInTransaction) {
      await this.runTransaction(pendingTransaction);
    } else {
      this.pendingTransactions.push(pendingTransaction);
    }
  }

  /**
   * Processes a single transaction and updates the index and data files.
   *
   * @param pendingTransaction - The transaction to execute.
   *
   * @throws {Error} If the transaction fails or if there's an issue updating the index or data files.
   */
  private async runTransaction(
    pendingTransaction: KVTransaction,
  ): Promise<void> {
    this.ensureOpen();
    await this.ledger!.lock();
    try {
      // Always do a complete sync before a transaction
      // - This will ensure that the index is is up to date, and that new
      //   transactions are added reflected to listeners.
      // - Throw on any error
      const syncResult = await this.sync(false, false);
      if (syncResult.error) throw syncResult.error;

      // Add the transaction to the ledger
      const offset = await this.ledger!.add(pendingTransaction);
      if (offset) {
        this.applyTransactionToIndex(pendingTransaction, offset);
      } else {
        throw new Error("Transaction failed, no data written.");
      }
    } finally {
      await this.ledger!.unlock();
    }
  }

  /**
   * Lists the immediate child keys under a given key, or lists all root keys if `null` is provided.
   *
   * @param key - The parent key for which to retrieve child keys. If `null`, lists all root keys.
   * @returns An array of strings representing the immediate child keys.
   *          If the key doesn't exist or has no children, an empty array is returned.
   */
  public listKeys(key: KVKey | null): string[] {
    // Throw if database isn't open
    this.ensureOpen();

    return this.index.getChildKeys(
      key === null ? null : new KVKeyInstance(key, true),
    );
  }

  /**
   * Closes the database gracefully.
   *
   * 1. Waits for any ongoing watchdog task to complete.
   * 2. Emits a 'closing' event to notify listeners.
   * 3. Closes the associated ledger.
   */
  public async close() {
    this.aborted = true;
    await this.watchdogPromise;
    clearTimeout(this.watchdogTimer!);

    // @ts-ignore emit exists
    this.emit("closing");

    this.ledger?.close();
  }
}
