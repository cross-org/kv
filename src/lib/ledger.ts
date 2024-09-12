import {
  ensureFile,
  rawOpen,
  readAtPosition,
  toNormalizedAbsolutePath,
  writeAtPosition,
} from "./utils/file.ts";
import {
  ENCODED_TRANSACTION_SIGNATURE,
  LEDGER_BASE_OFFSET,
  LEDGER_CURRENT_VERSION,
  LEDGER_FILE_ID,
  LEDGER_MAX_READ_FAILURE_BYTES,
  LEDGER_PREFETCH_BYTES,
  LOCK_BYTE_OFFSET,
  LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS,
  LOCK_DEFAULT_MAX_RETRIES,
  LOCK_STALE_TIMEOUT_MS,
  LOCKED_BYTES,
  LOCKED_BYTES_LENGTH,
  SUPPORTED_LEDGER_VERSIONS,
  UNLOCKED_BYTES,
} from "./constants.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import { rename, unlink } from "@cross/fs";
import type { FileHandle } from "node:fs/promises";
import type { KVQuery } from "./key.ts";
import { KVLedgerCache } from "./cache.ts";
import { KVPrefetcher } from "./prefetcher.ts";

/**
 * This file handles the ledger file, which is where all persisted data of an cross/kv instance is stored.
 *
 * The file structure consists of an 1024 byte header:
 *
 * | File ID (4 bytes) | Ledger Version (4 bytes) | Created Timestamp (4 bytes) | Current Offset (8 bytes) | (Header padding...) | (Transactions...)
 *
 * - File ID: A fixed string "CKVD" to identify the file type.
 * - Ledger Version: A string indicating the ledger version (e.g., "ALPH" for alpha).
 * - Timestamp: A Unix timestamp of when the ledger was created, set to current date on creation or vacuuming.
 * - Current Offset: The ending offset of the last written transaction data.
 * - Padding: The leftover space in the header is reserved for future use.
 *
 * Following the header, is a long list of transactions described in detail in transaction.ts.
 */

interface KVLedgerHeader {
  fileId: string; // "CKVD", 4 bytes
  ledgerVersion: string; // 4 bytes
  created: number;
  currentOffset: number;
}

export interface KVLedgerResult {
  offset: number;
  length: number;
  transaction: KVTransaction;
  complete: boolean;
  errorCorrectionOffset: number;
}

export class KVLedger {
  // States
  private opened: boolean = false;
  private dataPath: string;

  // Cache for decoded transactions
  public cache: KVLedgerCache;

  // Rolling pre-fetch cache for raw transaction data
  public prefetch: KVPrefetcher;

  public header: KVLedgerHeader = {
    fileId: LEDGER_FILE_ID,
    ledgerVersion: LEDGER_CURRENT_VERSION,
    created: 0,
    currentOffset: LEDGER_BASE_OFFSET,
  };

  constructor(filePath: string, maxCacheSizeMBytes: number) {
    this.dataPath = toNormalizedAbsolutePath(filePath);
    this.cache = new KVLedgerCache(maxCacheSizeMBytes * 1024 * 1024);
    this.prefetch = new KVPrefetcher(LEDGER_PREFETCH_BYTES);
  }

  /**
   * Opens the Ledger based on a provided filename or full path.
   *
   * @param filePath - Path to the base file for the KV store.
   */
  public async open(createIfMissing: boolean = true) {
    // Make sure there is a file
    const alreadyExists = await ensureFile(this.dataPath);

    // Read or create the file header
    if (alreadyExists) {
      // No-op, sync reads the header from file when needed
    } else if (createIfMissing) {
      this.header.created = Date.now();
      await this.writeHeader();
    } else {
      throw new Error("Database not found.");
    }

    this.opened = true;
  }

  /**
   * Synchronizes the ledger with the underlying file, retrieving any new
   * transactions that have been added since the last sync.
   *
   * The result of this function need to be picked up, and transfered to the in-memory index.
   *
   * @returns A Promise resolving to an array of the newly retrieved KVTransaction objects, or null if the ledger is invalidated.
   */
  public async sync(
    disableIndex: boolean = false,
    ignoreReadErrors: boolean = false,
  ): Promise<KVLedgerResult[] | null> {
    this.ensureOpen();

    const newTransactions = [] as KVLedgerResult[];

    let currentOffset = this.header.currentOffset; // Get from the cached header
    const currentCreated = this.header.created;

    // Update offset
    let reusableFd;

    await this.readHeader();

    // If the ledger is re-created (by vacuum or overwriting), there will be one time in the cached header
    // and there will be a different time after reading the header
    if (currentCreated !== 0 && currentCreated !== this.header.created) {
      // Return null to invalidate this ledger
      return null;
    }

    // Return new transactions for indexing
    if (!disableIndex) {
      reusableFd = await rawOpen(this.dataPath, false);
      while (currentOffset < this.header.currentOffset) {
        const result = await this.rawGetTransaction(
          currentOffset,
          this.header.currentOffset,
          false,
          reusableFd,
          ignoreReadErrors,
        );
        if (result) {
          newTransactions.push(result);
          currentOffset += result.length + result.errorCorrectionOffset; // Advance the offset
        } else {
          break;
        }
      }
    }
    if (reusableFd) reusableFd.close();
    return newTransactions;
  }

  /**
   * Reads the header from the ledger file.
   *
   * - This should ONLY be carried out by the KVLedger.sync() function
   *   as it can update the internal offset
   *
   * @throws If the header is invalid or cannot be read.
   */
  public async readHeader() {
    this.ensureOpen();
    let fd;
    try {
      fd = await rawOpen(this.dataPath, false);
      const headerData = await readAtPosition(fd, LEDGER_BASE_OFFSET, 0);
      const decoded: KVLedgerHeader = {
        fileId: new TextDecoder().decode(headerData.subarray(0, 4)),
        ledgerVersion: new TextDecoder().decode(headerData.subarray(4, 8)),
        created: new DataView(headerData.buffer).getFloat64(8, false),
        currentOffset: new DataView(headerData.buffer).getFloat64(16, false),
      };

      if (decoded.fileId !== LEDGER_FILE_ID) {
        throw new Error("Invalid database file format");
      }

      if (!SUPPORTED_LEDGER_VERSIONS.includes(decoded.ledgerVersion)) {
        throw new Error("Invalid database version");
      }

      if (
        decoded.currentOffset < LEDGER_BASE_OFFSET
      ) {
        throw new Error("Invalid offset");
      }

      this.header = decoded;
    } finally {
      if (fd) fd.close();
    }
  }

  /**
   * Scans the entire ledger for transactions that match a given query.
   *
   * This method is an async generator, yielding `KVLedgerResult` objects for
   * each matching transaction.
   *
   * @param query
   * @param recursive
   * @param fetchData
   * @param ignoreReadErrors Defaults to false
   * @returns An async generator yielding `KVLedgerResult` objects for each matching transaction.
   */
  public async *scan(
    query: KVQuery,
    recursive: boolean,
    fetchData: boolean = true,
    ignoreReadErrors: boolean = false,
  ): AsyncIterableIterator<KVLedgerResult> {
    this.ensureOpen();

    let currentOffset = LEDGER_BASE_OFFSET;

    const reusableFd = await rawOpen(this.dataPath, false); // Keep file open during scan

    while (currentOffset < this.header.currentOffset) {
      // Allow getting partial results (2nd parameter false) to re-use ledger cache to the maximum
      const result = await this.rawGetTransaction(
        currentOffset,
        this.header.currentOffset,
        false,
        reusableFd,
        ignoreReadErrors,
      );
      if (result) {
        if (result.transaction.key?.matchesQuery(query, recursive)) {
          // Check for completeness
          if (result.complete || !fetchData) {
            yield result;
          } else {
            const completeResult = await this.rawGetTransaction(
              result.offset,
              this.header.currentOffset,
              true,
              reusableFd,
            );
            if (completeResult) {
              yield completeResult;
            } else {
              break;
            }
          }
        }
        currentOffset += result.length + result.errorCorrectionOffset; // Advance the offset
      } else {
        break;
      }
    }

    if (reusableFd) reusableFd.close();
  }

  public async writeHeader() {
    this.ensureOpen();
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);

      const headerDataSize = 4 + 4 + 8 + 8; // 4 bytes for fileId, 4 for version, 8 for created, 8 for offset
      const headerBuffer = new ArrayBuffer(headerDataSize);
      const headerView = new DataView(headerBuffer);

      // Encode fileId
      new TextEncoder().encodeInto(
        this.header.fileId,
        // - Creates a uint8 view into the existing ArrayBuffer
        new Uint8Array(headerBuffer, 0, 4),
      );

      // Encode ledgerVersion
      new TextEncoder().encodeInto(
        this.header.ledgerVersion,
        // - Creates a uint8 view into the existing ArrayBuffer
        new Uint8Array(headerBuffer, 4, 4),
      );

      // Set numeric fields
      headerView.setFloat64(8, this.header.created, false); // false for little-endian
      headerView.setFloat64(16, this.header.currentOffset, false);
      // Write the header data
      await writeAtPosition(fd, new Uint8Array(headerBuffer), 0);
    } finally {
      if (fd) fd.close();
    }
  }

  /**
   * Adds multiple transactions to the ledger at once.
   *
   * This MUST be invoked directly after a full sync, to ensure consistency.
   * This MUST be done in a locked state, to ensure consistency.

   * @param transactionsData An array of raw transaction data as Uint8Arrays.
   * @returns The base offset where the transactions were written.
   */
  public async add(transactionsData: {
    transactionData: Uint8Array;
  }[]): Promise<number> {
    this.ensureOpen();

    // Used to return the first offset of the series
    const baseOffset = this.header.currentOffset;

    // Used to track insert position, this.header.currentOffset can
    // change by sync while inserting, so keep a separate copy.
    let currentOffset = this.header.currentOffset;

    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);
      for (const { transactionData } of transactionsData) {
        // Append each transaction data
        await writeAtPosition(fd, transactionData, currentOffset);

        currentOffset += transactionData.length;

        // Update the current offset in the cached header
        this.header.currentOffset = currentOffset;
      }
      await this.writeHeader(); // Update the on disk header with the new offset
    } finally {
      if (fd) fd.close();
    }
    return baseOffset;
  }

  public async rawGetTransaction(
    baseOffset: number,
    currentMaxOffset: number,
    readData: boolean = true,
    externalFd?: Deno.FsFile | FileHandle,
    ignoreReadErrors: boolean = false,
  ): Promise<KVLedgerResult | null> {
    this.ensureOpen();
    // Check cache first
    const cachedResult = this.cache.getTransactionData(baseOffset);
    if (cachedResult && (!readData || cachedResult.complete)) {
      return cachedResult;
    }
    let fd = externalFd;
    let errorCorrectionOffset = 0;
    if (!externalFd) fd = await rawOpen(this.dataPath, false);

    while (
      errorCorrectionOffset < LEDGER_MAX_READ_FAILURE_BYTES &&
      baseOffset + errorCorrectionOffset < currentMaxOffset
    ) {
      try {
        let headerOffset = 0;

        // Fetch 2 + 4 + 4 bytes (signature, header length, data length)
        const baseData: Uint8Array = await this.prefetch.read(
          fd!,
          ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4,
          baseOffset + errorCorrectionOffset,
        );
        const transactionLengthDataView = new DataView(
          baseData.buffer,
          0,
          ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4,
        );

        // Check if the first two bytes match ENCODED_TRANSACTION_SIGNATURE
        if (
          transactionLengthDataView.getUint8(0) ===
            ENCODED_TRANSACTION_SIGNATURE[0] &&
          transactionLengthDataView.getUint8(1) ===
            ENCODED_TRANSACTION_SIGNATURE[1]
        ) {
          headerOffset += ENCODED_TRANSACTION_SIGNATURE.length;

          // Read header length (offset by 4 bytes for header length uint32)
          const headerLength = transactionLengthDataView.getUint32(
            headerOffset,
            false,
          );
          headerOffset += 4;

          // Read data length (offset by 4 bytes for header length uint32)
          const dataLength = transactionLengthDataView.getUint32(
            headerOffset,
            false,
          );
          headerOffset += 4;

          const transaction = new KVTransaction();
          // Read transaction header
          const transactionHeaderData = await this.prefetch.read(
            fd!,
            headerLength,
            baseOffset + headerOffset + errorCorrectionOffset,
          );
          transaction.headerFromUint8Array(transactionHeaderData, readData);

          // Read transaction data (optional)
          const complete = readData || !(dataLength > 0);
          if (readData && dataLength > 0) {
            const transactionData = await this.prefetch.read(
              fd!,
              dataLength,
              baseOffset + errorCorrectionOffset + headerOffset + headerLength,
            );
            transaction.dataFromUint8Array(transactionData);
          }
          // Get transaction result
          const result = {
            offset: baseOffset + errorCorrectionOffset,
            length: headerOffset + headerLength + dataLength,
            complete: complete,
            errorCorrectionOffset,
            transaction,
          };

          // Cache transaction
          this.cache.cacheTransactionData(
            baseOffset + errorCorrectionOffset,
            result,
          );
          if (fd && !externalFd) fd.close();
          return result;
        }
      } catch (error) {
        if (!ignoreReadErrors) {
          throw error;
        }
      } finally {
        // Fast forward by one byte and try again
        errorCorrectionOffset += 1;
      }
    }
    if (fd && !externalFd) fd.close();
    return null;
  }

  /**
   * Caution should be taken not to carry out any other operations during a vacuum
   */
  public async vacuum(ignoreReadErrors: boolean = false): Promise<boolean> {
    let ledgerIsReplaced = false;
    try {
      // 1. Gather All Transaction Offsets
      const allOffsets: number[] = [];
      let currentOffset = LEDGER_BASE_OFFSET;
      while (currentOffset < this.header.currentOffset) {
        const result = await this.rawGetTransaction(
          currentOffset,
          this.header.currentOffset,
          false,
          undefined,
          ignoreReadErrors,
        );
        if (result) {
          allOffsets.push(currentOffset + result.errorCorrectionOffset);
          currentOffset += result.length + result.errorCorrectionOffset;

          // Update the header after each read, to make sure we catch any new transactions
          this.readHeader();
        } else {
          break;
        }
      }

      // 2. Now we need to lock the ledger, as a "state" is about to be calculated
      await this.lock();

      // 3. Gather Valid Transactions (in Reverse Order)
      const validTransactions: KVLedgerResult[] = [];
      const removedKeys: Set<string> = new Set();
      const addedKeys: Set<string> = new Set();
      for (let i = allOffsets.length - 1; i >= 0; i--) {
        const offset = allOffsets[i];
        const result = await this.rawGetTransaction(
          offset,
          this.header.currentOffset,
          false,
          undefined,
          ignoreReadErrors,
        );
        if (result) {
          if (result.transaction.operation === KVOperation.DELETE) {
            removedKeys.add(result.transaction.key!.stringify());
          } else if (
            !(removedKeys.has(result.transaction.key?.stringify()!)) &&
            !(addedKeys.has(result.transaction.key?.stringify()!))
          ) {
            addedKeys.add(result.transaction.key!.stringify());
            validTransactions.push(result);
          }
        }
      }

      // 4. Compact the Data File
      const tempFilePath = this.dataPath + "-tmp";
      const tempLedger = new KVLedger(
        tempFilePath,
        this.cache.maxCacheSizeBytes,
      );
      await tempLedger.open(true);

      // Lock the temporary ledger to prevent multiple vacuums against the same tempfile
      // - Will be unlocked in the finally clause
      await tempLedger.lock();

      // 5. Append valid transactions to the new file.
      for (const validTransaction of validTransactions) {
        const transaction = await this.rawGetTransaction(
          validTransaction.offset,
          this.header.currentOffset,
          true,
          undefined,
          ignoreReadErrors,
        );
        if (transaction) {
          await tempLedger.add([{
            transactionData: transaction.transaction.toUint8Array(),
          }]);
        }
      }
      this.header.currentOffset = tempLedger.header.currentOffset;

      // 6. Clear cache and prefetch
      this.cache.clear();
      this.prefetch.clear();

      // 7. Replace Original File
      await unlink(this.dataPath);
      await rename(tempFilePath, this.dataPath);
      ledgerIsReplaced = true;
    } finally {
      // 9. Unlock
      if (ledgerIsReplaced) await this.unlock();
    }

    return ledgerIsReplaced;
  }

  private ensureOpen(): void {
    if (!this.open) throw new Error("Ledger is not opened yet.");
  }

  public async lock(): Promise<void> {
    this.ensureOpen();

    let fd;
    const retryInterval = LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS; // Use provided retry interval

    for (let attempt = 0; attempt < LOCK_DEFAULT_MAX_RETRIES; attempt++) {
      try {
        fd = await rawOpen(this.dataPath, true);

        // 1. Check if already locked
        const lockData = await readAtPosition(
          fd,
          LOCKED_BYTES_LENGTH,
          LOCK_BYTE_OFFSET,
        );
        const existingTimestamp = new DataView(lockData.buffer).getBigUint64(
          0,
          false,
        );

        // Check for stale lock
        if (
          existingTimestamp !== BigInt(0) &&
          Date.now() - Number(existingTimestamp) > LOCK_STALE_TIMEOUT_MS
        ) {
          await writeAtPosition(fd, UNLOCKED_BYTES, LOCK_BYTE_OFFSET); // Remove stale lock
        } else if (existingTimestamp !== BigInt(0)) {
          // File is locked, wait and retry
          await new Promise((resolve) =>
            setTimeout(resolve, retryInterval + attempt * retryInterval)
          );
          continue;
        }

        // 2. Prepare lock data
        const lockBytes = LOCKED_BYTES;
        const lockView = new DataView(lockBytes.buffer);
        lockView.setBigUint64(0, BigInt(Date.now()), false);

        // 3. Write lock data
        await writeAtPosition(fd, lockBytes, LOCK_BYTE_OFFSET);

        // Lock acquired!
        return;
      } finally {
        if (fd) fd.close();
      }
    }

    // Could not acquire the lock after retries
    throw new Error("Could not acquire database lock");
  }

  public async unlock(): Promise<void> {
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);

      // Write all zeros to the lock bytes
      await writeAtPosition(fd, UNLOCKED_BYTES, LOCK_BYTE_OFFSET);
    } finally {
      if (fd) fd.close();
    }
  }

  public isOpen(): boolean {
    return this.opened;
  }
}
