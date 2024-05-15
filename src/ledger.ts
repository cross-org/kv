import {
  ensureFile,
  rawOpen,
  readAtPosition,
  toAbsolutePath,
  writeAtPosition,
} from "./utils/file.ts";
import { lock, unlock } from "./utils/file.ts";
import {
  LEDGER_BASE_OFFSET,
  LEDGER_MAX_READ_FAILURES,
  LEDGER_PREFETCH_BYTES,
  SUPPORTED_LEDGER_VERSIONS,
} from "./constants.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import { rename, unlink } from "@cross/fs";
import type { FileHandle } from "node:fs/promises";

/**
 * This file handles the ledger file, which is where all persisted data of an cross/kv instance is stored.
 *
 * The file structure consists of an 1024 byte header:
 *
 * | File ID (4 bytes) | Ledger Version (4 bytes) | Created Timestamp (float64) | Current Offset (uint32) | (Header padding...) | (Transactions...)
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
    fileId: "CKVD",
    ledgerVersion: "ALPH",
    created: 0,
    currentOffset: 1024,
  };

  constructor(filePath: string) {
    this.dataPath = toAbsolutePath(filePath + ".data");
  }

  /**
   * Opens the Ledger based on a provided file path.
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
   * @returns A Promise resolving to an array of the newly retrieved KVTransaction objects, or null if the ledger is invalidated.
   */
  public async sync(): Promise<KVLedgerResult[] | null> {
    if (this.aborted) return [];

    const newTransactions = [] as KVLedgerResult[];

    let currentOffset = this.header.currentOffset; // Get from the cached header
    const currentCreated = this.header.created; // Get from the cached header

    // Update offset
    let reusableFd;
    try {
      await this.readHeader(false);

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
          throw new Error("Internal sync error: Read attempts exceeded");
        }
        try {
          const result = await this.rawGetTransaction(
            currentOffset,
            false,
            reusableFd,
          );
          newTransactions.push(result); // Add the    transaction
          currentOffset += result.length; // Advance the offset
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
   * @throws If the header is invalid or cannot be read.
   */
  public async readHeader(doLock: boolean = true) {
    if (doLock) await lock(this.dataPath);
    let fd;
    try {
      fd = await rawOpen(this.dataPath, false);
      const headerData = await readAtPosition(fd, 1024, 0);
      const decoded: KVLedgerHeader = {
        fileId: new TextDecoder().decode(headerData.slice(0, 4)),
        ledgerVersion: new TextDecoder().decode(headerData.slice(4, 8)),
        created: new DataView(headerData.buffer).getFloat64(8, false),
        currentOffset: new DataView(headerData.buffer).getUint32(16, false),
      };

      if (decoded.fileId !== "CKVD") {
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
      if (doLock) await unlock(this.dataPath);
    }
  }

  public async writeHeader(doLock: boolean = true) {
    if (doLock) await lock(this.dataPath);
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);
      // Assuming the same header structure as before
      const headerDataSize = 4 + 4 + 16; // 4 bytes for fileId, 4 for version, 8 for created, 4 for offset
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
      headerView.setUint32(16, this.header.currentOffset, false);
      // Write the header data
      await writeAtPosition(fd, new Uint8Array(headerBuffer), 0);
    } finally {
      if (fd) fd.close();
      if (doLock) await unlock(this.dataPath);
    }
  }

  public async add(
    transaction: KVTransaction,
    doLock: boolean = true,
  ): Promise<number> {
    // Compose the transaction before locking to reduce lock time
    const transactionData = await transaction.toUint8Array();

    if (doLock) await lock(this.dataPath);

    // Update internal offset
    await this.readHeader(false);
    const offset = this.header.currentOffset;

    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);

      // Append the transaction data
      await writeAtPosition(
        fd,
        transactionData,
        this.header.currentOffset,
      );

      // Update the current offset in the header
      this.header.currentOffset += transactionData.length;

      await this.writeHeader(false); // Update header with new offset
    } finally {
      if (fd) fd.close();
      if (doLock) await unlock(this.dataPath);
    }
    return offset;
  }

  public async rawGetTransaction(
    offset: number,
    readData: boolean = true,
    externalFd?: Deno.FsFile | FileHandle,
  ): Promise<KVLedgerResult> {
    let fd = externalFd;
    try {
      if (!externalFd) fd = await rawOpen(this.dataPath, false);
      // Fetch 4 + 4 bytes for header length and data length, also prefetch additional LEDGER_PREFETCH_BYTES bytes to avoid duplicate reads
      const transactionLengthData = await readAtPosition(
        fd!,
        8 + LEDGER_PREFETCH_BYTES,
        offset,
      );
      const transactionLengthDataView = new DataView(
        transactionLengthData.buffer,
      );

      // Read header length
      const headerLength = transactionLengthDataView.getUint32(
        0,
        false,
      );

      // Read data length
      const dataLength = transactionLengthDataView.getUint32(
        4,
        false,
      );

      const transaction = new KVTransaction();

      // Read transaction header
      let transactionHeaderData;

      // - directly from file
      if (headerLength + 8 > LEDGER_PREFETCH_BYTES) {
        transactionHeaderData = await readAtPosition(
          fd!,
          headerLength,
          offset + 8,
        );
        transaction.headerFromUint8Array(transactionHeaderData);
        // - from pre-fetched data
      } else {
        transaction.headerFromUint8Array(
          transactionLengthData.subarray(8, headerLength + 8),
        );
      }

      // Read transaction data (optional)
      if (readData) {
        // Directly from file
        if (headerLength + 8 + dataLength > LEDGER_PREFETCH_BYTES) {
          const transactionData = await readAtPosition(
            fd!,
            dataLength,
            offset + 8 + headerLength,
          );
          await transaction.dataFromUint8Array(transactionData);
          // From pre-fetched data
        } else {
          await transaction.dataFromUint8Array(
            transactionLengthData.slice(
              headerLength + 8,
              headerLength + 8 + dataLength,
            ),
          );
        }
      }
      return {
        offset: offset,
        length: 4 + 4 + dataLength + headerLength,
        transaction,
      };
    } finally {
      if (fd && !externalFd) fd.close();
    }
  }

  public async vacuum() {
    // 1. Lock for Exclusive Access
    await lock(this.dataPath);

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
      const tempFilePath = this.dataPath + ".tmp";
      const tempLedger = new KVLedger(tempFilePath);
      await tempLedger.open(true);

      // Append valid transactions to the new file.
      for (const validTransaction of validTransactions) {
        const transaction = await this.rawGetTransaction(
          validTransaction.offset,
          true,
        );
        await tempLedger.add(transaction.transaction, false);
      }
      this.header.currentOffset = tempLedger.header.currentOffset;
      tempLedger.close();

      // 5. Replace Original File
      await unlink(this.dataPath);
      await rename(tempFilePath + ".data", this.dataPath);

      // 6. Update the Cached Header
      await this.readHeader(false);
    } finally {
      // 7. Unlock
      await unlock(this.dataPath);
    }
  }

  public isClosing() {
    return this.aborted;
  }
}
