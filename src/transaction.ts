import type { KVKey } from "./key.ts";

export enum KVOperation {
  INSERT = 1,
  UPSERT = 2,
  DELETE = 3,
}

/**
 * Represents content of a finished transaction
 */
export interface KVFinishedTransaction {
  /**
   * Holds the key
   */
  key: KVKey;

  /**
   * Holds the operation
   */
  oper: KVOperation;

  /**
   * Operation timestamp
   */
  ts: number;

  /**
   * Offset data row, added once the entry has been written to a data file
   */
  offset?: number;
}

/**
 * Represents content of a transaction entry outside the KVIndex tree.
 */
export interface KVPendingTransaction {
  /**
   * Holds the key
   */
  key: KVKey;

  /**
   * Holds the operation
   */
  oper: KVOperation;

  /**
   * Operation timestamp
   */
  ts: number;

  /**
   * Actual data for this transaction, ready to be written
   */
  data?: unknown;
}
