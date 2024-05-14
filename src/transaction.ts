import { compareHash, sha1 } from "./utils/hash.ts";
import { type KVKey, KVKeyInstance } from "./key.ts";
import { decode, encode } from "cbor-x";

/**
 * Data structure of a Cross/kv transaction:
 *
 * | Header Length (uint32) | Data Length (uint32) | Header Bytes... | Data Bytes... |
 *
 * - Header Length: Specifies the length of the transaction header in bytes.
 * - Data Length: Specifies the length of the transaction data in bytes.
 * - Header Bytes: Contains metadata about the transaction (detailed below).
 * - Data Bytes: The actual data associated with the transaction (optional).
 *
 * Header Bytes Structure:
 *
 * | Key Data... | Operation (uint8) | Timestamp (uint32) | Hash Length (uint32) | Hash Bytes... |
 *
 * - Key Data: Data returned by the key
 * - Operation: The type of operation (SET or DELETE).
 * - Timestamp: The timestamp of the operation.
 * - Hash Length: The length of the hash in bytes.
 * - Hash Bytes: The hash of the data (optional).
 *
 * Key Element Structure (repeated for each key element):
 *
 * | Element Type (uint8) | Element Data... |
 *
 * - Element Type: 0 for string, 1 for number.
 * - String Element Data: String Length (uint32) | String Bytes...
 * - Number Element Data: Number Value (float64)
 */

export enum KVOperation {
  SET = 1,
  DELETE = 2,
}

/**
 * Represents content of a transaction
 */
export interface KVTransactionHeader {
  /**
   * Holds the key
   */
  k: KVKey;

  /**
   * Holds the operation
   */
  o: KVOperation;

  /**
   * Operation timestamp
   */
  t: number;

  /**
   * Hash
   */
  h: Uint8Array;
}

export type KVTransactionData = Uint8Array;

// Concrete implementation of the KVTransaction interface
export class KVTransaction {
  public key?: KVKeyInstance;
  public operation?: KVOperation;
  public timestamp?: number;
  public data?: Uint8Array;
  public hash?: Uint8Array;
  constructor() {
  }

  public async create(
    key: KVKeyInstance,
    operation: KVOperation,
    timestamp: number,
    value?: unknown,
  ) {
    // Validate
    if (this.operation === KVOperation.SET && value === undefined) {
      throw new Error("Set operation needs data");
    }

    // Assign
    this.key = key;
    this.operation = operation;
    this.timestamp = timestamp;
    if (value) {
      this.data = encode(value);
      this.hash = await sha1(this.data!);
    }
  }

  public headerFromUint8Array(data: Uint8Array) {
    const dataView = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    let offset = 0;

    // Decode key
    this.key = new KVKeyInstance(dataView, false, false);
    offset += this.key.byteLength!;

    // Decode operation (assuming it's encoded as uint8)
    this.operation = dataView.getUint8(offset);
    offset += 1;

    // Decode timestamp
    if (offset + 8 > dataView.byteLength) {
      throw new Error("Invalid data: Not enough bytes to decode timestamp");
    }
    this.timestamp = dataView.getFloat64(offset, false);
    offset += 8;

    // Decode hash length (assuming it's encoded as uint32)
    if (offset + 4 > dataView.byteLength) {
      throw new Error("Invalid data: Not enough bytes to decode hash length");
    }
    const hashLength = dataView.getUint32(offset, false);
    offset += 4;

    // Decode hash bytes
    if (offset + hashLength > data.length) {
      throw new Error("Invalid data: Hash data truncated");
    }
    this.hash = data.subarray(offset, offset + hashLength);
    offset += hashLength;

    // Do not allow extra data
    if (offset !== data.byteLength) {
      throw new Error("Invalid data: Extra data in transaction header");
    }
  }

  public async dataFromUint8Array(data: Uint8Array) {
    if (!compareHash(await sha1(data), this.hash!)) {
      throw new Error("Invalid data: Read data not matching hash");
    }
    this.data = data;
  }

  /**
   * Return a Uint8Array consisting of data length (uint32) plus the actual data
   */
  public toUint8Array(): Uint8Array {
    const keyBytes = this.key!.toUint8Array();
    const hashBytes = this.hash;
    const pendingTransactionData = this.data;

    // Calculate total sizes
    const headerSize = keyBytes.length + 1 + 8 + 4 + (hashBytes?.length ?? 0);
    const dataLength = pendingTransactionData
      ? pendingTransactionData.length
      : 0;
    const fullDataSize = 4 + 4 + headerSize + dataLength;

    const fullData = new Uint8Array(fullDataSize);
    const fullDataView = new DataView(fullData.buffer);

    // Encode header and data lengths
    fullDataView.setUint32(0, headerSize, false);
    fullDataView.setUint32(4, dataLength, false);

    // Encode key bytes
    let offset = 8; // Start after length fields
    fullData.set(keyBytes, offset);
    offset += keyBytes.length;

    // Encode other header fields
    fullDataView.setUint8(offset++, this.operation!);
    fullDataView.setFloat64(offset, this.timestamp!, false);
    offset += 8;
    fullDataView.setUint32(offset, hashBytes?.length ?? 0, false);
    offset += 4;
    if (hashBytes) {
      fullData.set(hashBytes, offset);
      offset += hashBytes.length;
    }

    // Encode data (if present)
    if (pendingTransactionData) {
      fullData.set(pendingTransactionData, offset);
    }

    return fullData;
  }

  public getData(): unknown | null {
    // Return data, should be validated through create or fromUint8Array
    if (this.data) {
      return decode(this.data);
    } else {
      return null;
    }
  }
}
