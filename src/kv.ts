// deno-lint-ignore-file no-explicit-any

// Internal dependencies
import { KVIndex } from "./index.ts";
import { type KVKey, KVKeyInstance, type KVQuery } from "./key.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import { KVLedger } from "./ledger.ts";
import { SYNC_INTERVAL_MS } from "./constants.ts";

// External dependencies
import { EventEmitter } from "node:events";

/**
 * Represents a single data entry returned after querying the Key/Value store.
 */
export interface KVDataEntry {
  /**
   * The timestamp (milliseconds since epoch) when the entry was created or modified.
   */
  ts: number;

  /**
   * The actual data stored in the Key-Value store. Can be any type.
   */
  data: unknown;
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
  public autoSync: boolean = true; // Public only to allow testing
  public syncIntervalMs: number = SYNC_INTERVAL_MS; // Public only to allow testing

  // States
  private blockSync: boolean = false; // Syncing can be blocked during vacuum
  private aborted: boolean = false;
  private isInTransaction: boolean = false;
  private watchdogTimer?: number; // Undefined if not scheduled or currently running
  private watchdogPromise?: Promise<void>;

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
    await this.sync(true);
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
   * This method fetches new transactions from the ledger and applies them to the index.
   * If the ledger is invalidated, it automatically re-opens the database.
   *
   * @param force - If true, forces synchronization even if it's currently blocked (e.g., during a vacuum).
   *
   * @emits sync - Emits an event with the synchronization result. The event detail object has the following structure:
   *   - `result`: <string representing success state> | "error"
   *   - `error`: Error object (if an error occurred) or null
   *
   * @throws {Error} If an unexpected error occurs during synchronization.
   */
  private async sync(force: boolean = false) {
    // Early returns
    if (!this.ledger || this.ledger?.isClosing()) return;
    if (this.aborted) return;
    if (this.blockSync && !force) {
      // @ts-ignore .emit does indeed exist
      this.emit("sync", { result: "blocked", error: errorDetails });
      return;
    }

    let syncResult:
      | "ready"
      | "blocked"
      | "success"
      | "ledgerInvalidated"
      | "error" = "ready";
    let errorDetails: Error | null = null;

    try {
      const newTransactions = await this.ledger?.sync();
      // If sync() do return null the ledger is invalidated
      // - Return without rescheduling the watchdog, and open the new ledger
      if (newTransactions === null) {
        // @ts-ignore .emit does indeed exist
        syncResult = "ledgerInvalidated";
        await this.open(this.ledgerPath!, false);
      } else if (newTransactions) {
        // Change status to success if there are new transactions
        if (newTransactions.length > 0) {
          syncResult = "success";
        }
        // Handle each new transactionx
        for (const entry of newTransactions) {
          try {
            // Apply transaction to the index
            switch (entry.operation) {
              case KVOperation.SET:
                this.index.add(entry.key, entry.offset);
                break;
              case KVOperation.DELETE:
                this.index.delete(entry.key);
                break;
            }
          } catch (transactionError) {
            // Change result to error
            syncResult = "error";
            errorDetails = new Error(
              "Error processing transaction: " + transactionError.message,
              { cause: transactionError },
            );
            // @ts-ignore .emit does indeed exist
            this.emit("sync", { result: syncResult, error: errorDetails });
          }
        }
      } else {
        throw new Error("Undefined error during ledger sync");
      }
    } catch (syncError) {
      syncResult = "error";
      errorDetails = new Error(
        "Error during ledger sync: " + syncError.message,
        { cause: syncError },
      );
    } finally {
      // @ts-ignore .emit does indeed exist
      this.emit("sync", { result: syncResult, error: errorDetails });
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
    if (!this.ledger) {
      throw new Error("Database not open");
    }
  }

  /**
   * Retrieves the first value associated with the given key, or null.
   *
   * @param key - Representation of the key.
   * @returns A promise that resolves to the retrieved value, or null if not found.
   */
  public async get(key: KVKey): Promise<KVDataEntry | null> {
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
  ): AsyncGenerator<KVDataEntry> {
    const validatedKey = new KVKeyInstance(key, true);
    const offsets = this.index!.get(validatedKey, limit)!;

    if (offsets === null || offsets.length === 0) {
      return; // No results to yield
    }

    let count = 0;
    for (const offset of offsets) {
      const result = await this.ledger?.rawGetTransaction(offset, false, true);
      if (result?.transaction) {
        yield {
          ts: result?.transaction.timestamp!,
          data: result?.transaction.getData(),
        };
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
  public async listAll(key: KVQuery): Promise<KVDataEntry[]> {
    const entries: KVDataEntry[] = [];
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
   * @throws {Error} If the key is not found.
   */
  async delete(key: KVKey): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKeyInstance(key);

    // Create transaction
    const pendingTransaction = new KVTransaction();
    pendingTransaction.create(
      validatedKey,
      KVOperation.DELETE,
      Date.now(),
    );

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
  async runTransaction(
    pendingTransaction: KVTransaction,
  ): Promise<void> {
    this.ensureOpen();

    const offset = await this.ledger!.add(pendingTransaction);

    if (offset) {
      switch (pendingTransaction.operation) {
        case KVOperation.SET:
          this.index.add(
            pendingTransaction.key!,
            offset,
          );
          break;
        case KVOperation.DELETE: {
          const deletedReference = this.index.delete(pendingTransaction.key!);
          if (deletedReference === undefined) {
            throw new Error("Could not delete entry, key not found.");
          }
          break;
        }
      }
    } else {
      throw new Error("Transaction failed, no data written.");
    }
  }

  public async close() {
    // First await current watchdog run
    await this.watchdogPromise;
    // @ts-ignore Closing ledger
    this.emit("closing");
    this.aborted = true;
    clearTimeout(this.watchdogTimer!); // Clear the timer if it exists
    this.ledger?.close();
  }
}
