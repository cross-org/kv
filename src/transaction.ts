import { sha1 } from "./utils/hash.ts";
import { KVKey, type KVKeyRepresentation } from "./key.ts";
import { decode, encode } from "cbor-x";

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
  public key?: KVKey;
  public operation?: KVOperation;
  public timestamp?: number;
  public data?: Uint8Array;
  public hash?: Uint8Array;

  constructor() {
  }

  public async create(
    key: KVKey | KVKeyRepresentation,
    operation: KVOperation,
    timestamp: number,
    value?: unknown,
  ) {
    if (!(key instanceof KVKey)) {
      this.key = new KVKey(key, false);
    } else {
      this.key = key;
    }
    this.operation = operation;
    this.timestamp = timestamp;
    this.data = value ? encode(value) : undefined;
    this.hash = this.data ? await sha1(this.data) : undefined;
  }

  public headerFromUint8Array(data: Uint8Array) {
    const dataView = new DataView(data.buffer);
    let offset = 0;

    // 1. Decode Number of Key Elements (uint32)
    if (offset + 4 > data.length) {
      throw new Error(
        "Invalid data: Not enough bytes to decode key elements count",
      );
    }
    const numKeyElements = dataView.getUint32(offset, false);
    offset += 4;

    const keyToBe: KVKeyRepresentation = [];

    for (let i = 0; i < numKeyElements; i++) {
      if (offset >= data.length) {
        throw new Error("Invalid data: Incomplete key element");
      }
      // 2. Decode Element Type (uint8): 0 for string, 1 for number
      const elementType = data[offset];
      offset += 1;

      if (elementType === 0) { // String
        // 3a. Decode String Length (uint32)
        if (offset + 4 > data.length) {
          throw new Error(
            "Invalid data: Not enough bytes to decode string length",
          );
        }
        const strLength = dataView.getUint32(offset, false);
        offset += 4;

        // 3b. Decode String Bytes
        if (offset + strLength > data.length) {
          throw new Error("Invalid data: String data truncated");
        }
        const strBytes = data.slice(offset, offset + strLength);
        keyToBe.push(new TextDecoder().decode(strBytes));
        offset += strLength;
      } else if (elementType === 1) { // Number
        // 3c. Decode Number (float64 - adjust if using different type)
        if (offset + 8 > data.length) {
          throw new Error("Invalid data: Not enough bytes to decode number");
        }
        const numValue = dataView.getFloat64(offset, false);
        keyToBe.push(numValue);
        offset += 8;
      } else {
        throw new Error(
          `Invalid data: Unknown key element type ${elementType}`,
        );
      }
    }

    this.key = new KVKey(keyToBe, false, false);
    if (offset >= data.length) {
      throw new Error("Invalid data: Insufficient data to decode header");
    }
    // Decode operation (assuming it's encoded as uint8)
    this.operation = data[offset];
    offset += 1;

    // Decode timestamp (assuming it's encoded as uint32)
    if (offset + 4 > data.length) {
      throw new Error("Invalid data: Not enough bytes to decode timestamp");
    }
    this.timestamp = dataView.getUint32(offset, false);
    offset += 4;

    // Decode hash length (assuming it's encoded as uint32)
    if (offset + 4 > data.length) {
      throw new Error("Invalid data: Not enough bytes to decode hash length");
    }
    const hashLength = dataView.getUint32(offset, false);
    offset += 4;

    // Decode hash bytes
    if (offset + hashLength > data.length) {
      throw new Error("Invalid data: Hash data truncated");
    }
    this.hash = data.slice(offset, offset + hashLength);
  }

  public async dataFromUint8Array(data: Uint8Array) {
    this.data = decode(data);
    if (data) {
      this.hash = await sha1(data);
    }
  }

  /**
   * Return a Uint8Array consisting of data length (uint32) plus the actual data
   */
  public toUint8Array(): Uint8Array {
    const keyBytesArray = [];

    for (const element of this.key!.get()) {
      if (typeof element === "string") {
        // 2a. Encode Element Type (uint8): 0
        keyBytesArray.push(new Uint8Array([0]));

        // 3a. Encode String Length (uint32) + String Bytes
        const strBytes = new TextEncoder().encode(element);
        const strLengthBytes = new Uint8Array(4);
        new DataView(strLengthBytes.buffer).setUint32(
          0,
          strBytes.length,
          false,
        );
        keyBytesArray.push(strLengthBytes);
        keyBytesArray.push(strBytes);
      } else if (typeof element === "number") {
        // 2b. Encode Element Type (uint8): 1
        keyBytesArray.push(new Uint8Array([1]));

        // 3b. Encode Number (float64 - adjust if using different type)
        const numBytes = new Uint8Array(8);
        new DataView(numBytes.buffer).setFloat64(0, element, false);
        keyBytesArray.push(numBytes);
      }
    }

    const keyBytes = new Uint8Array(
      keyBytesArray.reduce((a, b) => a + b.length, 0),
    );
    let keyOffset = 0;
    for (const bytes of keyBytesArray) {
      keyBytes.set(bytes, keyOffset);
      keyOffset += bytes.length;
    }

    const hashBytes = this.hash!;

    // Calculate total size of the encoded header
    const totalSize = 4 + // Number of key elements
      keyBytes.length + // Key bytes
      1 + // Operation
      4 + // Timestamp
      4 + (hashBytes ? hashBytes.length : 0); // Hash length + hash bytes

    const headerBytes = new Uint8Array(totalSize);
    const headerBytesView = new DataView(headerBytes.buffer);
    let offset = 0;

    // 1. Encode Number of Key Elements (uint32)
    headerBytesView.setUint32(0, this.key!.get().length, false);
    offset += 4;

    // Encode key bytes
    headerBytes.set(keyBytes, offset);
    offset += keyBytes.length;

    // Encode operation
    headerBytes[offset] = this.operation!;
    offset += 1;

    // Encode timestamp
    headerBytesView.setUint32(offset, this.timestamp!, false);
    offset += 4;

    // Encode hash length
    headerBytesView.setUint32(
      offset,
      hashBytes ? hashBytes.length : 0,
      false,
    );
    offset += 4;

    // Encode hash bytes
    if (hashBytes) headerBytes.set(hashBytes, offset);

    // Encode data
    const pendingTransactionData = this.data;
    const pendingTransactionDataLength = pendingTransactionData
      ? pendingTransactionData.length
      : 0;

    // Create typed array and view
    const fullData = new Uint8Array(
      4 + 4 + headerBytes.length + pendingTransactionDataLength,
    );
    const fullDataView = new DataView(fullData.buffer);

    // Add header length
    fullDataView.setUint32(
      0,
      headerBytes.length,
      false,
    );

    // Add data length
    fullDataView.setUint32(
      4,
      pendingTransactionDataLength,
      false,
    );

    fullData.set(headerBytes, 4 + 4);
    if (pendingTransactionData) {
      fullData.set(
        pendingTransactionData,
        4 + 4 + headerBytes.length,
      );
    }

    return fullData;
  }
}
