// deno-lint-ignore-file no-explicit-any
import { KVIndex } from "./index.ts";
import { KVKey, type KVKeyRepresentation } from "./key.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import { KVLedger } from "./ledger.ts";
import { SYNC_INTERVAL_MS } from "./constants.ts";

/**
 * Represents a single data entry within the Key-Value store.
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
  private watchdogTimer?: number;

  private aborted: boolean = false;

  constructor() {
  }

  /**
   * Opens the Key-Value store based on a provided file path.
   * Initializes the index and data files.
   *
   * @param filePath - Path to the base file for the KV store.
   *                   Index and data files will be derived from this path.
   */
  public async open(filePath: string, createIfMissing: boolean = true) {
    this.ledger = new KVLedger(filePath);
    await this.ledger.open(createIfMissing);
    await this.watchdog();
  }

  /**
   * Starts a watchdog function that periodically syncs the ledger with disk
   */
  private async watchdog() {
    if (this.aborted) return;
    try {
      const newTransactions = await this.ledger?.sync();
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

    // Reschedule
    this.watchdogTimer = setTimeout(() => this.watchdog(), SYNC_INTERVAL_MS);
  }

  public async vacuum(): Promise<void> {
    await this.ledger?.vacuum();
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
   * @returns The retrieved value, or null if not found.
   */
  public async get(key: KVKeyRepresentation): Promise<KVDataEntry | null> {
    const result = await this.getMany(key, 1);
    if (result.length) {
      return result[0];
    } else {
      return null;
    }
  }

  /**
   * Retrieves all values associated with the given key, with an optional record limit.
   *
   * @param key - Representation of the key.
   * @param limit - Optional maximum number of values to retrieve.
   * @returns An array of retrieved values.
   */
  async getMany(
    key: KVKeyRepresentation,
    limit?: number,
  ): Promise<KVDataEntry[]> {
    const validatedKey = new KVKey(key, true);
    const offsets = this.index!.get(validatedKey)!;

    if (offsets === null || offsets.length === 0) {
      return [];
    }
    const results: any[] = [];
    let count = 0;
    for (const offset of offsets) {
      const result = await this.ledger?.rawGetTransaction(offset);
      if (result?.transaction) {
        results.push({
          ts: result?.transaction.timestamp,
          data: result?.transaction.value,
        });
        count++;
      }
      if (limit && count >= limit) break;
    }
    return results;
  }

  /**
   * Stores a value associated with the given key, optionally overwriting existing values.
   * @param key - Representation of the key.
   * @param value - The value to store.
   * @param overwrite - If true, overwrites any existing value for the key.
   */
  public async set(
    key: KVKeyRepresentation,
    value: any,
  ): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key);

    const transaction = new KVTransaction();
    transaction.create(
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
  async delete(key: KVKeyRepresentation): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key);

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

    // 2. Write Data if Needed
    const offset = await this.ledger?.add(pendingTransaction);

    if (offset) {
      // 3. Update the Index
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
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.ledger?.close();
  }
}
