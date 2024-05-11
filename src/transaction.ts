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
    // ToDo: Optimise
    const decoded: KVTransactionHeader = extDecoder.decode(data);

    this.key = decoded.k;
    this.operation = decoded.o;
    this.timestamp = decoded.t;
    this.hash = decoded.h;
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
    // Create transaction data
    const pendingTransactionHeader: KVTransactionHeader = {
      k: this.key!,
      o: this.operation!,
      t: this.timestamp!,
      h: this.hash!,
    };

    // Encode header
    const encodedTransactionHeader = extEncoder.encode(
      pendingTransactionHeader,
    );

    // Encode data
    const pendingTransactionData = this.data;
    const pendingTransactionDataLength = pendingTransactionData
      ? pendingTransactionData.length
      : 0;

    // Create array
    const fullData = new Uint8Array(
      4 + 4 + encodedTransactionHeader.length + pendingTransactionDataLength,
    );

    // Add header length
    new DataView(fullData.buffer).setUint32(
      0,
      encodedTransactionHeader.length,
      false,
    );

    // Add data length
    new DataView(fullData.buffer).setUint32(
      4,
      pendingTransactionDataLength,
      false,
    );

    fullData.set(encodedTransactionHeader, 4 + 4);
    if (pendingTransactionData) {
      fullData.set(
        pendingTransactionData,
        4 + 4 + encodedTransactionHeader.length,
      );
    }

    return fullData;
  }
}
