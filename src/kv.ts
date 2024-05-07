// deno-lint-ignore-file no-explicit-any
import { KVIndex } from "./index.ts";
import { KVKey, type KVKeyRepresentation } from "./key.ts";
import {
  ensureFile,
  lock,
  readAtPosition,
  unlock,
  writeAtPosition,
} from "./utils/file.ts";
import { readFile, stat } from "@cross/fs";
import {
  type KVFinishedTransaction,
  KVOperation,
  type KVPendingTransaction,
} from "./transaction.ts";
import { extDecoder, extEncoder } from "./cbor.ts";

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
export class CrossKV {
  private index: KVIndex = new KVIndex();

  private pendingTransactions: KVPendingTransaction[] = [];
  private isInTransaction: boolean = false;

  private dataPath?: string;
  private transactionsPath?: string;

  constructor() {}

  /**
   * Opens the Key-Value store based on a provided file path.
   * Initializes the index and data files.
   *
   * @param filePath - Path to the base file for the KV store.
   *                   Index and data files will be derived from this path.
   */
  public async open(filePath: string) {
    const transactionsPath = filePath + ".tlog";
    await ensureFile(transactionsPath);
    this.transactionsPath = transactionsPath;

    this.dataPath = filePath + ".data";
    await ensureFile(this.dataPath);

    // Initial load of the transaction log into the index
    await this.restoreTransactionLog();
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
   * Loads all KVFinishedTransaction entries from the transaction log and
   * replays them to rebuild the index state.
   *
   * @private
   */
  private async restoreTransactionLog() {
    this.ensureOpen();
    await lock(this.transactionsPath!);
    const transactionLog = await readFile(this.transactionsPath!);
    let position = 0;
    while (position < transactionLog.byteLength) {
      const dataLength = new DataView(transactionLog.buffer).getUint16(
        position,
        false,
      );
      try {
        const transaction: KVFinishedTransaction = extDecoder.decode(
          transactionLog.slice(position + 2, position + 2 + dataLength),
        );
        // Apply transaction to the index
        switch (transaction.oper) {
          case KVOperation.INSERT:
          case KVOperation.UPSERT:
            this.index.add(transaction);
            break;
          case KVOperation.DELETE:
            this.index.delete(transaction);
            break;
        }
      } catch (_e) {
        console.error(_e);
        throw new Error("Error while encoding data");
      }

      position += 2 + dataLength; // Move to the next transaction
    }
    await unlock(this.transactionsPath!);
  }

  /**
   * Ensures the database is open, throwing an error if it's not.
   *
   * @private
   * @throws {Error} If the database is not open.
   */
  private ensureOpen(): void {
    if (!this.index || !this.dataPath) {
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
      count++;
      const lengthPrefixBuffer = await readAtPosition(
        this.dataPath!,
        2,
        offset,
      );
      const dataLength = new DataView(lengthPrefixBuffer.buffer).getUint16(
        0,
        false,
      );
      const dataBuffer = await readAtPosition(
        this.dataPath!,
        dataLength,
        offset + 2,
      );
      results.push(extDecoder.decode(dataBuffer));
      if (limit && count >= limit) return results;
    }
    return results;
  }

  /**
   * Encodes a value and adds it to the list of pending transactions
   * @param encodedData - The CBOR-encoded value to write.
   * @returns The offset at which the data was written.
   */
  private async writeData(
    pendingTransaction: KVPendingTransaction,
  ): Promise<number> {
    this.ensureOpen();

    // Create a data entry
    const dataEntry: KVDataEntry = {
      ts: pendingTransaction.ts,
      data: pendingTransaction.data,
    };

    const encodedDataEntry = extEncoder.encode(dataEntry);

    // Get current offset (since we're appending)

    await lock(this.dataPath!);

    const stats = await stat(this.dataPath!); // Use fs.fstat instead
    const originalPosition = stats.size;

    // Create array
    const fullData = new Uint8Array(2 + encodedDataEntry.length);

    // Add length prefix (2 bytes)
    new DataView(fullData.buffer).setUint16(0, encodedDataEntry.length, false);

    // Add data
    fullData.set(encodedDataEntry, 2);

    await writeAtPosition(this.dataPath!, fullData, originalPosition);

    await unlock(this.dataPath!);

    return originalPosition; // Return the offset (where the write started)
  }

  /**
   * Encodes a value and adds it to the list of pending transactions
   * @param encodedData - The CBOR-encoded value to write.
   * @returns The offset at which the data was written.
   */
  private async writeTransaction(encodedData: Uint8Array): Promise<number> {
    this.ensureOpen();

    // Get current offset (since we're appending)
    await lock(this.transactionsPath!);
    const stats = await stat(this.transactionsPath!); // Use fs.fstat instead
    const originalPosition = stats.size;

    // Add length prefix (2 bytes)
    const fullData = new Uint8Array(2 + encodedData.length);
    new DataView(fullData.buffer).setUint16(0, encodedData.length);
    fullData.set(encodedData, 2);
    await writeAtPosition(this.transactionsPath!, fullData, originalPosition);
    await unlock(this.transactionsPath!);
    return originalPosition; // Return the offset (where the write started)
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
    overwrite: boolean = false,
  ): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key);

    // Create transaction
    const pendingTransaction: KVPendingTransaction = {
      key: validatedKey,
      oper: overwrite ? KVOperation.UPSERT : KVOperation.INSERT,
      ts: new Date().getTime(),
      data: value,
    };

    // Enqueue transaction
    if (!this.isInTransaction) {
      await this.runTransaction(pendingTransaction);
    } else {
      this.checkTransaction(pendingTransaction);
      this.pendingTransactions.push(pendingTransaction);
    }
  }

  /**
   * Deletes the key-value pair with the given key.
   * @param key - Representation of the key.
   * @throws {Error} If the key is not found.
   */
  async delete(key: KVKeyRepresentation): Promise<number | undefined> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key);

    // Create transaction
    const pendingTransaction: KVPendingTransaction = {
      key: validatedKey,
      oper: KVOperation.DELETE,
      ts: new Date().getTime(),
    };

    if (!this.isInTransaction) {
      return await this.runTransaction(pendingTransaction);
    } else {
      this.checkTransaction(pendingTransaction);
      this.pendingTransactions.push(pendingTransaction);
    }
  }

  /**
   * Checks the prerequisites of a single transaction
   *
   * @param pendingTransaction - The transaction to execute.
   */
  checkTransaction(pendingTransaction: KVPendingTransaction): void {
    this.ensureOpen();

    // Check that the key doesn't exist
    if (
      pendingTransaction.oper === KVOperation.INSERT &&
      this.index.get(pendingTransaction.key).length > 0
    ) {
      throw new Error("Duplicate key: Key already exists");
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
    pendingTransaction: KVPendingTransaction,
  ): Promise<number> {
    this.ensureOpen();

    // 1. Check that the transaction can be carried out
    // - Will throw on error
    this.checkTransaction(pendingTransaction);

    // 12. Write Data if Needed
    let offset;
    if (pendingTransaction.data !== undefined) {
      offset = await this.writeData(pendingTransaction);
    }

    // 3. Create the finished transaction
    const finishedTransaction: KVFinishedTransaction = {
      key: pendingTransaction.key,
      oper: pendingTransaction.oper,
      ts: pendingTransaction.ts,
      offset: offset,
    };

    // 4. Update the Index
    switch (pendingTransaction.oper) {
      case KVOperation.UPSERT:
      case KVOperation.INSERT:
        this.index.add(finishedTransaction);
        break;
      case KVOperation.DELETE: {
        const deletedReference = this.index.delete(finishedTransaction);
        if (deletedReference === undefined) {
          throw new Error("Could not delete entry, key not found.");
        }
        break;
      }
    }

    // 5. Persist the Transaction Log
    const encodedTransaction = extEncoder.encode(finishedTransaction);
    return await this.writeTransaction(encodedTransaction); // Append
  }

  public close() {
    /* No-Op, for now */
  }
}
