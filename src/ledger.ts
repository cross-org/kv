import {
  ensureFile,
  rawOpen,
  readAtPosition,
  toAbsolutePath,
  writeAtPosition,
} from "./utils/file.ts";
import { lock, unlock } from "./utils/file.ts";
import { SUPPORTED_LEDGER_VERSIONS } from "./constants.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";
import type { KVKey } from "./key.ts";
import { rename, unlink } from "@cross/fs";
import { compareHash } from "./utils/hash.ts";

export interface KVTransactionMeta {
  key: KVKey;
  operation: KVOperation;
  offset: number;
}

interface LedgerHeader {
  fileId: string; // "CKVD", 4 bytes
  ledgerVersion: string; // 4 bytes
  created: number;
  baseOffset: number;
  currentOffset: number;
}

export class KVLedger {
  private aborted: boolean = false;
  private dataPath: string;
  public header: LedgerHeader = {
    fileId: "CKVD",
    ledgerVersion: "ALPH",
    created: 0,
    baseOffset: 1024,
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
      /* No-op */
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
   * @returns A Promise resolving to an array of the newly retrieved KVTransaction objects.
   */
  public async sync(): Promise<KVTransactionMeta[]> {
    if (this.aborted) return [];
    const newTransactions = [] as KVTransactionMeta[];

    let currentOffset = this.header.currentOffset; // Get from the cached header

    // Update offset
    await lock(this.dataPath);
    await this.readHeader(false);

    while (currentOffset < this.header.currentOffset) {
      const result = await this.rawGetTransaction(currentOffset, false, false);
      newTransactions.push({
        key: result.transaction.key!,
        operation: result.transaction.operation!,
        offset: currentOffset,
      }); // Add the    transaction
      currentOffset += result.length; // Advance the offset
    }

    // Update the cached header's currentOffset
    this.header.currentOffset = currentOffset;

    await unlock(this.dataPath);

    return newTransactions;
  }

  /**
   * Reads the header from the ledger file.
   * @throws If the header is invalid or cannot be read.
   */
  private async readHeader(doLock: boolean = true) {
    if (doLock) await lock(this.dataPath);
    let fd;
    try {
      fd = await rawOpen(this.dataPath, false);
      const headerData = await readAtPosition(fd, 1024, 0);
      const decoded: LedgerHeader = {
        fileId: new TextDecoder().decode(headerData.slice(0, 4)),
        ledgerVersion: new TextDecoder().decode(headerData.slice(4, 8)),
        created: new DataView(headerData.buffer).getUint32(8, false),
        baseOffset: new DataView(headerData.buffer).getUint32(12, false),
        currentOffset: new DataView(headerData.buffer).getUint32(16, false),
      };

      if (decoded.fileId !== "CKVD") {
        throw new Error("Invalid database file format");
      }

      if (!SUPPORTED_LEDGER_VERSIONS.includes(decoded.ledgerVersion)) {
        throw new Error("Invalid database version");
      }

      if (decoded.baseOffset < 1024) {
        throw new Error("Invalid base offset");
      }

      if (
        decoded.currentOffset < 1024 ||
        decoded.currentOffset < decoded.baseOffset
      ) {
        throw new Error("Invalid offset");
      }

      this.header = decoded;
    } finally {
      if (fd) fd.close();
      if (doLock) await unlock(this.dataPath);
    }
  }

  private async writeHeader(doLock: boolean = true) {
    if (doLock) await lock(this.dataPath);
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);
      // Assuming the same header structure as before
      const headerDataSize = 4 + 4 + 12; // 4 bytes for fileId, 4 for version, 3x4 for numbers
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
      headerView.setUint32(8, this.header.created, false); // false for little-endian
      headerView.setUint32(12, this.header.baseOffset, false);
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
    const offset = this.header.currentOffset;
    if (doLock) await lock(this.dataPath);
    let fd;
    try {
      fd = await rawOpen(this.dataPath, true);
      const transactionData = await transaction.toUint8Array();

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
    doLock: boolean = false,
    decodeData: boolean = true,
  ): Promise<{ offset: number; length: number; transaction: KVTransaction }> {
    if (doLock) await lock(this.dataPath);
    let fd;
    try {
      fd = await rawOpen(this.dataPath, false);
      const transactionLengthData = await readAtPosition(fd, 8, offset);
      const headerLength = new DataView(transactionLengthData.buffer).getUint32(
        0,
        false,
      );
      const dataLength = new DataView(transactionLengthData.buffer).getUint32(
        4,
        false,
      );
      const transaction = new KVTransaction();

      // Read transaction header
      const transactionHeaderData = await readAtPosition(
        fd,
        headerLength,
        offset + 8,
      );
      transaction.headerFromUint8Array(transactionHeaderData);

      // Read transaction data (optional)
      if (decodeData) {
        const originalHash: Uint8Array = transaction.hash!;
        const transactionHeaderData = await readAtPosition(
          fd,
          dataLength,
          offset + 8 + headerLength,
        );
        await transaction.dataFromUint8Array(transactionHeaderData);
        // Validate data
        if (!compareHash(originalHash, transaction.hash!)) {
          throw new Error("Invalid data");
        }
      }
      return {
        offset: offset,
        length: 4 + 4 + dataLength + headerLength,
        transaction,
      };
    } finally {
      if (fd) fd.close();
      if (doLock) await unlock(this.dataPath);
    }
  }

  public async vacuum() {
    // 1. Lock for Exclusive Access
    await lock(this.dataPath);

    try {
      // 2. Gather All Transaction Offsets
      const allOffsets: number[] = [];
      let currentOffset = this.header.baseOffset;
      while (currentOffset < this.header.currentOffset) {
        const result = await this.rawGetTransaction(
          currentOffset,
          false,
          false,
        );
        allOffsets.push(currentOffset);
        currentOffset += result.length;
      }

      // 3. Gather Valid Transactions (in Reverse Order)
      const validTransactions: KVTransactionMeta[] = [];
      const removedKeys: Set<string> = new Set();
      const addedKeys: Set<string> = new Set();
      for (let i = allOffsets.length - 1; i >= 0; i--) {
        const offset = allOffsets[i];
        const result = await this.rawGetTransaction(offset, false, false);
        if (result.transaction.operation === KVOperation.DELETE) {
          removedKeys.add(result.transaction.key!.getKeyRepresentation());
        } else if (
          !(removedKeys.has(result.transaction.key?.getKeyRepresentation()!)) &&
          !(addedKeys.has(result.transaction.key?.getKeyRepresentation()!))
        ) {
          addedKeys.add(result.transaction.key!.getKeyRepresentation());
          validTransactions.push({
            key: result.transaction.key!,
            operation: result.transaction.operation!,
            offset: offset,
          });
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
          false,
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
}
