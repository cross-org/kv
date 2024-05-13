// deno-lint-ignore-file no-explicit-any
import { KVIndex } from "./index.ts";
import { type KVKey, KVKeyInstance, type KVQuery } from "./key.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import { KVLedger } from "./ledger.ts";
import { SYNC_INTERVAL_MS } from "./constants.ts";

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
 * Cross-platform Key-Value store implementation backed by file storage.
 */
export class KV {
  private index: KVIndex = new KVIndex();

  private pendingTransactions: KVTransaction[] = [];
  private isInTransaction: boolean = false;

  private ledger?: KVLedger;
  private ledgerPath?: string;
  private watchdogTimer?: number;

  private blockSync: boolean = false; // Syncing can be blocked during vacuum

  private aborted: boolean = false;

  constructor() {
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
    forceSync: boolean = false,
  ) {
    // If there is an existing ledger, close it and clear the index
    if (this.ledger) {
      this.ledger?.close();
      this.index.clear();
      // ToDo: Is an abort signal needed to prevent a current watchdog to recurse?
      clearTimeout(this.watchdogTimer!); // Clear the timer if it exists
    }

    // Open the ledger, and start a new watchdog
    this.ledger = new KVLedger(filePath);
    this.ledgerPath = filePath;
    await this.ledger.open(createIfMissing);
    await this.watchdog(forceSync);
  }

  /**
   * Starts a watchdog function that periodically syncs the ledger with disk.
   */
  private async watchdog(forceSync: boolean = false) {
    if (this.aborted) return;
    await this.sync(forceSync);

    // Reschedule
    this.watchdogTimer = setTimeout(() => this.watchdog(), SYNC_INTERVAL_MS);
  }

  private async sync(force: boolean = false) {
    if (this.aborted) return;
    if (this.blockSync && !force) return;
    try {
      const newTransactions = await this.ledger?.sync();
      // If sync() do return null the ledger is invalidated
      // - Return without rescheduling the watchdog, and open the new ledger
      if (newTransactions === null) {
        return this.open(this.ledgerPath!, false);
      }

      if (newTransactions) {
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
          } catch (_e) {
            console.error(_e);
            throw new Error("Error while encoding data");
          }
        }
      }
    } catch (error) {
      console.error("Error in watchdog sync:", error);
    }
  }

  /**
   * Performs a vacuum operation on the underlying ledger to reclaim space.
   */
  public async vacuum(): Promise<void> {
    this.blockSync = true;
    await this.ledger?.vacuum();

    // Force re-opening the database
    await this.open(this.ledgerPath!, false, true);
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
          data: await result?.transaction.validateAndGetData(),
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
   * Processes a single transaction and makes necessary updates to the index and
   * data files.
   *
   * File locks should be handled outside this function.
   *
   * @param pendingTransaction - The transaction to execute.
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

  public close() {
    this.aborted = true;
    clearTimeout(this.watchdogTimer!); // Clear the timer if it exists
    this.ledger?.close();
  }

  public unsafeGetIndex(): KVIndex {
    return this.index;
  }
}
