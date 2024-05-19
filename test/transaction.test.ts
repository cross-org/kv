import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { KVKeyInstance } from "../src/key.ts";
import { KVOperation, KVTransaction } from "../src/transaction.ts";

test("KVTransaction: create and toUint8Array", async () => {
  const key = new KVKeyInstance(["testKey"]);
  const value = { test: "data" };
  const timestamp = Date.now();

  const transaction = new KVTransaction();
  await transaction.create(key, KVOperation.SET, timestamp, value);

  const uint8Array = transaction.toUint8Array();
  const decodedTransaction = new KVTransaction();
  const headerLength = new DataView(uint8Array.buffer).getUint32(3);
  decodedTransaction.headerFromUint8Array(
    uint8Array.slice(8 + 3, 8 + 3 + headerLength),
  ); // Skip the initial 11 bytes (signature, header and data lengths)
  await decodedTransaction.dataFromUint8Array(transaction.data!);
  assertEquals(
    decodedTransaction.key?.getKeyRepresentation(),
    key.getKeyRepresentation(),
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
