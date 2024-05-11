import { sha1 } from "./utils/hash.ts";
import { extDecoder, extEncoder } from "./cbor.ts";
import { KVKey, type KVKeyRepresentation } from "./key.ts";

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
    this.data = value ? extEncoder.encode(value) : undefined;
    this.hash = this.data ? await sha1(this.data) : undefined;
  }

  public headerFromUint8Array(data: Uint8Array) {
    let offset = 0;

    // 1. Decode Number of Key Elements (uint32)
    if (offset + 4 > data.length) {
      throw new Error(
        "Invalid data: Not enough bytes to decode key elements count",
      );
    }
    const numKeyElements = new DataView(data.buffer).getUint32(offset, false);
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
        const strLength = new DataView(data.buffer).getUint32(offset, false);
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
        const numValue = new DataView(data.buffer).getFloat64(offset, false);
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
    this.timestamp = new DataView(data.buffer).getUint32(offset, false);
    offset += 4;

    // Decode hash length (assuming it's encoded as uint32)
    if (offset + 4 > data.length) {
      throw new Error("Invalid data: Not enough bytes to decode hash length");
    }
    const hashLength = new DataView(data.buffer).getUint32(offset, false);
    offset += 4;

    // Decode hash bytes
    if (offset + hashLength > data.length) {
      throw new Error("Invalid data: Hash data truncated");
    }
    this.hash = data.slice(offset, offset + hashLength);
  }

  public async dataFromUint8Array(data: Uint8Array) {
    this.data = extDecoder.decode(data);
    if (data) {
      this.hash = await sha1(data);
    }
  }

  /**
   * Return a Uint8Array consisting of data length (uint32) plus the actual data
   */
  public toUint8Array(): Uint8Array {
    const keyBytesArray = [];

    // 1. Encode Number of Key Elements (uint32)
    const numKeyElements = this.key!.get().length;
    const numKeyElementsBytes = new Uint8Array(4);
    new DataView(numKeyElementsBytes.buffer).setUint32(
      0,
      numKeyElements,
      false,
    );
    keyBytesArray.push(numKeyElementsBytes);

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
    const totalSize = keyBytes.length + // Key length + key bytes
      1 + // Operation
      4 + // Timestamp
      4 + (hashBytes ? hashBytes.length : 0); // Hash length + hash bytes

    const headerBytes = new Uint8Array(totalSize);
    let offset = 0;

    // Encode key bytes
    headerBytes.set(keyBytes, offset);
    offset += keyBytes.length;

    // Encode operation
    headerBytes[offset] = this.operation!;
    offset += 1;

    // Encode timestamp
    new DataView(headerBytes.buffer).setUint32(offset, this.timestamp!, false);
    offset += 4;

    // Encode hash length
    new DataView(headerBytes.buffer).setUint32(
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

    // Create array
    const fullData = new Uint8Array(
      4 + 4 + headerBytes.length + pendingTransactionDataLength,
    );

    // Add header length
    new DataView(fullData.buffer).setUint32(
      0,
      headerBytes.length,
      false,
    );

    // Add data length
    new DataView(fullData.buffer).setUint32(
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
