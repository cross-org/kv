import {
  ensureFile,
  rawOpen,
  readAtPosition,
  toAbsolutePath,
  writeAtPosition,
} from "./utils/file.ts";
import {
  LEDGER_BASE_OFFSET,
  LEDGER_CURRENT_VERSION,
  LEDGER_FILE_ID,
  LEDGER_MAX_READ_FAILURES,
  LEDGER_PREFETCH_BYTES,
  LOCK_BYTE_OFFSET,
  LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS,
  LOCK_DEFAULT_MAX_RETRIES,
  LOCK_STALE_TIMEOUT_MS,
  LOCKED_BYTES_LENGTH,
  SUPPORTED_LEDGER_VERSIONS,
  TRANSACTION_SIGNATURE,
  UNLOCKED_BYTES,
} from "./constants.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import { rename, unlink } from "@cross/fs";
import type { FileHandle } from "node:fs/promises";

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

interface KVLedgerResult {
  offset: number;
  length: number;
  transaction: KVTransaction;
}

export class KVLedger {
  private aborted: boolean = false;
  private dataPath: string;
  public header: KVLedgerHeader = {
    fileId: LEDGER_FILE_ID,
    ledgerVersion: LEDGER_CURRENT_VERSION,
    created: 0,
    currentOffset: LEDGER_BASE_OFFSET,
  };

  constructor(filePath: string) {
    this.dataPath = toAbsolutePath(filePath);
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
      /* No-op, sync reads the header from file when needed */
    } else if (createIfMissing) {
      this.header.created = Date.now();
      await this.writeHeader();
    } else {
      throw new Error("Database not found.");
    }
  }

  close() {
    this.aborted = true;
  }

  /**
   * Synchronizes the ledger with the underlying file, retrieving any new
   * transactions that have been added since the last sync.
   *
   * The result of this function need to be picked up, and transfered to the in-memory index.
   *
   * @returns A Promise resolving to an array of the newly retrieved KVTransaction objects, or null if the ledger is invalidated.
   */
  public async sync(): Promise<KVLedgerResult[] | null> {
    this.ensureOpen();

    const newTransactions = [] as KVLedgerResult[];

    let currentOffset = this.header.currentOffset; // Get from the cached header
    const currentCreated = this.header.created; // Get from the cached header

    // Update offset
    let reusableFd;
    try {
      await this.readHeader();

      // If the ledger is re-created (by vacuum or overwriting), there will be a time in the cached header
      // and there will be a different time after reading the header
      if (currentCreated !== 0 && currentCreated !== this.header.created) {
        // Return 0 to invalidate this ledger
        return null;
      }

      // If there is new transactions
      reusableFd = await rawOpen(this.dataPath, false);
      let failures = 0;
      while (currentOffset < this.header.currentOffset) {
        if (failures > LEDGER_MAX_READ_FAILURES) {
          // Recover
          currentOffset++;
        }
        try {
          const result = await this.rawGetTransaction(
            currentOffset,
            false,
            reusableFd,
          );
          newTransactions.push(result); // Add the    transaction
          currentOffset += result.length; // Advance the offset
          failures = 0;
        } catch (_e) {
          failures++;
        }
      }
      // Update the cached header's currentOffset
      this.header.currentOffset = currentOffset;
    } finally {
      if (reusableFd) reusableFd.close();
    }
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
        fileId: new TextDecoder().decode(headerData.slice(0, 4)),
        ledgerVersion: new TextDecoder().decode(headerData.slice(4, 8)),
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

  public async writeHeader() {
    this.ensureOpen();
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);
      // Assuming the same header structure as before
      const headerDataSize = 4 + 4 + 8 + 8; // 4 bytes for fileId, 4 for version, 8 for created, 8 for offset
      const headerBuffer = new ArrayBuffer(headerDataSize);
      const headerView = new DataView(headerBuffer);

      // Encode fileId
      new TextEncoder().encodeInto(
        this.header.fileId,
        new Uint8Array(headerBuffer, 0, 4),
      );

      // Encode ledgerVersion
      new TextEncoder().encodeInto(
        this.header.ledgerVersion,
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
  public async add(transactionsData: Uint8Array[]): Promise<number> {
    this.ensureOpen();
    const baseOffset = this.header.currentOffset;
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);
      for (const transactionData of transactionsData) {
        // Append each transaction data
        await writeAtPosition(fd, transactionData, this.header.currentOffset);

        // Update the current offset in the header
        this.header.currentOffset += transactionData.length;
      }
      await this.writeHeader(); // Update header with the new offset
    } finally {
      if (fd) fd.close();
    }
    return baseOffset;
  }

  public async rawGetTransaction(
    baseOffset: number,
    readData: boolean = true,
    externalFd?: Deno.FsFile | FileHandle,
  ): Promise<KVLedgerResult> {
    this.ensureOpen();
    let fd = externalFd;
    try {
      if (!externalFd) fd = await rawOpen(this.dataPath, false);

      // Fetch 2 + 4 + 4 bytes (signature, header length, data length) + prefetch
      const transactionLengthData = await readAtPosition(
        fd!,
        TRANSACTION_SIGNATURE.length + 4 + 4 + LEDGER_PREFETCH_BYTES, // Updated to include 3 bytes for signature
        baseOffset,
      );
      const transactionLengthDataView = new DataView(
        transactionLengthData.buffer,
      );

      let headerOffset = 0;

      // Read and validate the CKT signature
      const signature = new TextDecoder().decode(
        transactionLengthData.slice(headerOffset, TRANSACTION_SIGNATURE.length),
      );
      if (signature !== TRANSACTION_SIGNATURE) {
        throw new Error("Invalid transaction signature");
      }
      headerOffset += TRANSACTION_SIGNATURE.length;

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
      let transactionHeaderData;

      // - directly from file
      if (headerLength + headerOffset > LEDGER_PREFETCH_BYTES) {
        transactionHeaderData = await readAtPosition(
          fd!,
          headerLength,
          baseOffset + headerOffset,
        );
        transaction.headerFromUint8Array(transactionHeaderData);
        // - from pre-fetched data
      } else {
        transaction.headerFromUint8Array(
          transactionLengthData.subarray(
            headerOffset,
            headerLength + headerOffset,
          ),
        );
      }

      // Read transaction data (optional)
      if (readData) {
        // Directly from file
        if (headerLength + headerOffset + dataLength > LEDGER_PREFETCH_BYTES) {
          const transactionData = await readAtPosition(
            fd!,
            dataLength,
            baseOffset + headerOffset + headerLength,
          );
          await transaction.dataFromUint8Array(transactionData);
          // From pre-fetched data
        } else {
          await transaction.dataFromUint8Array(
            transactionLengthData.slice(
              headerLength + headerOffset,
              headerLength + headerOffset + dataLength,
            ),
          );
        }
      }
      return {
        offset: baseOffset,
        length: headerOffset + headerLength + dataLength,
        transaction,
      };
    } finally {
      if (fd && !externalFd) fd.close();
    }
  }

  /**
   * Caution should be taken not to carry out any other operations during a vacuum
   */
  public async vacuum() {
    // 1. Lock for Exclusive Access
    await this.lock();

    try {
      // 2. Gather All Transaction Offsets
      const allOffsets: number[] = [];
      let currentOffset = LEDGER_BASE_OFFSET;
      while (currentOffset < this.header.currentOffset) {
        const result = await this.rawGetTransaction(
          currentOffset,
          false,
        );
        allOffsets.push(currentOffset);
        currentOffset += result.length;
      }

      // 3. Gather Valid Transactions (in Reverse Order)
      const validTransactions: KVLedgerResult[] = [];
      const removedKeys: Set<string> = new Set();
      const addedKeys: Set<string> = new Set();
      for (let i = allOffsets.length - 1; i >= 0; i--) {
        const offset = allOffsets[i];
        const result = await this.rawGetTransaction(offset, false);
        if (result.transaction.operation === KVOperation.DELETE) {
          removedKeys.add(result.transaction.key!.getKeyRepresentation());
        } else if (
          !(removedKeys.has(result.transaction.key?.getKeyRepresentation()!)) &&
          !(addedKeys.has(result.transaction.key?.getKeyRepresentation()!))
        ) {
          addedKeys.add(result.transaction.key!.getKeyRepresentation());
          validTransactions.push(result);
        }
      }

      // 4. Compact the Data File
      const tempFilePath = this.dataPath + "-tmp";
      const tempLedger = new KVLedger(tempFilePath);
      await tempLedger.open(true);

      // Append valid transactions to the new file.
      for (const validTransaction of validTransactions) {
        const transaction = await this.rawGetTransaction(
          validTransaction.offset,
          true,
        );
        await tempLedger.add([transaction.transaction.toUint8Array()]);
      }
      this.header.currentOffset = tempLedger.header.currentOffset;
      tempLedger.close();

      // 5. Replace Original File
      await unlink(this.dataPath);
      await rename(tempFilePath, this.dataPath);

      // 6. Update the Cached Header
      await this.readHeader();
    } finally {
      // 7. Unlock
      await this.unlock();
    }
  }

  public isClosing() {
    return this.aborted;
  }

  private ensureOpen(): void {
    if (this.aborted) throw new Error("Ledger is closed.");
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
        const lockBytes = new Uint8Array(LOCKED_BYTES_LENGTH);
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
}
