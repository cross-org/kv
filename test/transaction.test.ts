import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { KVKeyInstance } from "../src/lib/key.ts";
import {
  KVHashAlgorithm,
  KVOperation,
  KVTransaction,
} from "../src/lib/transaction.ts";
import { ENCODED_TRANSACTION_SIGNATURE } from "../src/lib/constants.ts";

test("KVTransaction: create and toUint8Array", async () => {
  const key = new KVKeyInstance(["testKey"]);
  const value = { test: "data" };
  const timestamp = Date.now();

  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const decodedTransaction = new KVTransaction();

  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4; // <2 bytes "T;"><uint32 header length><unit32 data length>

  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  decodedTransaction.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  ); // Skip the initial 11 bytes (signature, header and data lengths)
  await decodedTransaction.dataFromUint8Array(transaction.data!);
  assertEquals(
    decodedTransaction.key?.stringify(),
    key.stringify(),
  );
  assertEquals(decodedTransaction.operation, transaction.operation);
  assertEquals(decodedTransaction.timestamp, transaction.timestamp);

  const result = decodedTransaction.asResult();
  assertEquals(result.data, value);
});

test("KVTransaction: headerFromUint8Array - invalid data", () => {
  // Arrange: Create an invalid Uint8Array (e.g., too short, invalid key type, etc.)
  const invalidUint8Array = new Uint8Array([0, 0, 0, 1, 255]); // Invalid element type

  // Act & Assert: Expect an error when trying to decode
  const transaction = new KVTransaction();
  assertThrows(
    () => transaction.headerFromUint8Array(invalidUint8Array),
    Error, // Or a custom error type
  );
});
