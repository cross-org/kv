import { compareHash, sha1 } from "./utils/hash.ts";
import { type KVKey, KVKeyInstance } from "./key.ts";
import { decode, encode } from "cbor-x";
import { TRANSACTION_SIGNATURE } from "./constants.ts";

/**
 * Data structure of a Cross/kv transaction:
 *
 * Header signature (2 bytes) | Header Length (uint32) | Data Length (uint32) | Header Bytes... | Data Bytes... |
 *
 * - Header Signature: Two bytes "T;" designating the start of a Cross KV Transaction, and is primarily used to fast forward past corrupted data.
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

/**
 * Enumerates the possible operations that can be performed on a key-value pair in the KV store.
 */
export enum KVOperation {
  /**
   * The operation of setting or updating the value associated with a key.
   */
  SET = 1,
  /**
   * The operation of removing a key-value pair from the store.
   */
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

/**
 * Represents a single transaction result from the Key-Value store.
 */
export interface KVTransactionResult {
  /**
   * The key associated with the transaction.
   */
  key: KVKey;

  /**
   * The operation performed (KVOperation.SET or KVOperation.DELETE).
   */
  operation: KVOperation;

  /**
   * The timestamp of the operation (in milliseconds since the Unix epoch).
   */
  timestamp: number;

  /**
   * The decoded data associated with the transaction (if any).
   * For SET operations, this will be the value that was set.
   * For DELETE operations, this will typically be null or undefined.
   */
  data: unknown;

  /**
   * The hash of the raw transaction data. This can be used for
   * verification and integrity checks.
   */
  hash: Uint8Array;
}

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
    this.timestamp = dataView.getFloat64(offset, false);
    offset += 8;

    // Decode hash length (assuming it's encoded as uint32)
    const hashLength = dataView.getUint32(offset, false);
    offset += 4;

    // Decode hash bytes
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
    const fullDataSize = TRANSACTION_SIGNATURE.length + 4 + 4 + headerSize +
      dataLength;

    const fullData = new Uint8Array(fullDataSize);
    const fullDataView = new DataView(fullData.buffer);

    let offset = 0;

    // Encode transaction signature
    const signature = new TextEncoder().encode(TRANSACTION_SIGNATURE);
    fullData.set(signature, 0);
    offset += TRANSACTION_SIGNATURE.length;

    // Encode header and data lengths
    fullDataView.setUint32(offset, headerSize, false);
    offset += 4;

    fullDataView.setUint32(offset, dataLength, false);
    offset += 4;

    // Encode key bytes
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

  private getData(): unknown | null {
    // Return data, should be validated through create or fromUint8Array
    if (this.data) {
      return decode(this.data);
    } else {
      return null;
    }
  }

  /**
   * Converts the transaction to a KVTransactionResult object.
   * This assumes that the transaction's data is already validated or created correctly.
   */
  public asResult(): KVTransactionResult {
    if (
      this.operation === undefined || this.timestamp === undefined ||
      this.hash === undefined
    ) {
      throw new Error(
        "Incomplete transaction cannot be converted to a result.",
      );
    }
    return {
      key: this.key!.get() as KVKey,
      operation: this.operation,
      timestamp: this.timestamp,
      data: this.getData(),
      hash: this.hash,
    };
  }
}
