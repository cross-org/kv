import { KVIndex, type KVIndexContent } from "./index.ts";
import {
  ensureFile,
  rawOpen,
  readAtPosition,
  toNormalizedAbsolutePath,
  writeAtPosition,
} from "./utils/file.ts";
import { unlink } from "@cross/fs";

/**
 * Header structure for the index cache file.
 *
 * The cache file structure:
 * | Magic Bytes (4) | Version (4) | Ledger Created (8) | Ledger Offset (8) | Index Data Length (8) | Index Data (variable) |
 */
interface IndexCacheHeader {
  /** Magic bytes to identify the file: "CKVI" (Cross/KV Index) */
  magic: string;
  /** Cache format version */
  version: string;
  /** The timestamp when the original ledger was created */
  ledgerCreated: number;
  /** The ledger offset up to which this index was built */
  ledgerOffset: number;
  /** The length of the serialized index data */
  indexDataLength: number;
}

const CACHE_MAGIC = "CKVI"; // Cross/KV Index
const CACHE_VERSION = "V001";
const CACHE_HEADER_SIZE = 32; // 4 + 4 + 8 + 8 + 8 = 32 bytes

/**
 * Manages persistent caching of the KVIndex to speed up cold starts.
 *
 * The index cache allows loading a pre-built index from disk instead of
 * rebuilding it from scratch by reading all transactions from the ledger.
 */
export class KVIndexCache {
  private cachePath: string;

  constructor(ledgerPath: string) {
    // Cache file is stored alongside the ledger with .idx extension
    this.cachePath = toNormalizedAbsolutePath(ledgerPath + ".idx");
  }

  /**
   * Serializes an index node recursively to a plain object that can be JSON-encoded.
   */
  private serializeIndexNode(node: KVIndexContent): unknown {
    const result: Record<string, unknown> = {};

    if (node.reference !== undefined) {
      result.ref = node.reference;
    }

    if (node.children.size > 0) {
      const children: Record<string, unknown> = {};
      for (const [key, value] of node.children.entries()) {
        children[String(key)] = this.serializeIndexNode(value);
      }
      result.children = children;
    }

    return result;
  }

  /**
   * Deserializes an index node from a plain object.
   */
  private deserializeIndexNode(obj: unknown): KVIndexContent {
    if (typeof obj !== "object" || obj === null) {
      throw new Error("Invalid index node format");
    }

    const node: KVIndexContent = {
      children: new Map(),
    };

    const record = obj as Record<string, unknown>;

    if (typeof record.ref === "number") {
      node.reference = record.ref;
    }

    if (record.children && typeof record.children === "object") {
      const childrenObj = record.children as Record<string, unknown>;
      for (const [key, value] of Object.entries(childrenObj)) {
        // Restore the original type (number or string)
        const parsedKey = /^\d+$/.test(key) ? Number(key) : key;
        node.children.set(parsedKey, this.deserializeIndexNode(value));
      }
    }

    return node;
  }

  /**
   * Saves the current index to the cache file.
   *
   * @param index - The index to save
   * @param ledgerCreated - The creation timestamp of the ledger
   * @param ledgerOffset - The ledger offset up to which this index represents
   * @returns true if save was successful, false otherwise
   */
  async save(
    index: KVIndex,
    ledgerCreated: number,
    ledgerOffset: number,
  ): Promise<boolean> {
    try {
      // Serialize the index to JSON
      const serialized = this.serializeIndexNode(index.index);
      const jsonData = JSON.stringify(serialized);
      const indexData = new TextEncoder().encode(jsonData);

      // Create header
      const header = new Uint8Array(CACHE_HEADER_SIZE);
      const view = new DataView(header.buffer);

      // Magic bytes
      new TextEncoder().encodeInto(CACHE_MAGIC, header);
      // Version
      new TextEncoder().encodeInto(CACHE_VERSION, header.subarray(4));
      // Ledger created timestamp
      view.setFloat64(8, ledgerCreated, false);
      // Ledger offset
      view.setFloat64(16, ledgerOffset, false);
      // Index data length
      view.setFloat64(24, indexData.length, false);

      // Combine header and data
      const fileData = new Uint8Array(CACHE_HEADER_SIZE + indexData.length);
      fileData.set(header, 0);
      fileData.set(indexData, CACHE_HEADER_SIZE);

      // Write to file
      await ensureFile(this.cachePath);
      const fd = await rawOpen(this.cachePath, true);
      try {
        await writeAtPosition(fd, fileData, 0);
        return true;
      } finally {
        await fd.close();
      }
    } catch (error) {
      console.warn("Failed to save index cache:", error);
      return false;
    }
  }

  /**
   * Loads the index from the cache file if it exists and is valid.
   *
   * @param ledgerCreated - The creation timestamp of the current ledger
   * @returns An object with the loaded index and the ledger offset, or null if cache is invalid/missing
   */
  async load(
    ledgerCreated: number,
  ): Promise<{ index: KVIndex; ledgerOffset: number } | null> {
    try {
      // Check if cache file exists
      const exists = await ensureFile(this.cachePath);
      if (!exists) {
        return null;
      }

      // Read header
      const fd = await rawOpen(this.cachePath, false);
      try {
        const headerData = await readAtPosition(fd, CACHE_HEADER_SIZE, 0);

        // Parse header
        const magic = new TextDecoder().decode(headerData.subarray(0, 4));
        const version = new TextDecoder().decode(headerData.subarray(4, 8));
        const view = new DataView(headerData.buffer);
        const cachedLedgerCreated = view.getFloat64(8, false);
        const cachedLedgerOffset = view.getFloat64(16, false);
        const indexDataLength = view.getFloat64(24, false);

        // Validate header
        if (magic !== CACHE_MAGIC) {
          console.warn("Invalid cache magic bytes");
          return null;
        }

        if (version !== CACHE_VERSION) {
          console.warn("Unsupported cache version:", version);
          return null;
        }

        // Validate that the cache matches the current ledger
        if (cachedLedgerCreated !== ledgerCreated) {
          console.warn(
            "Cache ledger timestamp mismatch. Cache is stale or for a different ledger.",
          );
          return null;
        }

        // Read index data
        const indexData = await readAtPosition(
          fd,
          indexDataLength,
          CACHE_HEADER_SIZE,
        );

        // Deserialize index
        const jsonData = new TextDecoder().decode(indexData);
        const serialized = JSON.parse(jsonData);

        const index = new KVIndex();
        index.index = this.deserializeIndexNode(serialized);

        return {
          index,
          ledgerOffset: cachedLedgerOffset,
        };
      } finally {
        await fd.close();
      }
    } catch (error) {
      console.warn("Failed to load index cache:", error);
      return null;
    }
  }

  /**
   * Deletes the cache file if it exists.
   */
  async delete(): Promise<void> {
    try {
      await unlink(this.cachePath);
    } catch (_error) {
      // Ignore errors if file doesn't exist
    }
  }

  /**
   * Gets the path to the cache file.
   */
  getCachePath(): string {
    return this.cachePath;
  }
}
