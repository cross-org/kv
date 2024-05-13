import { assertEquals, assertThrows } from "@std/assert";
import { test } from "@cross/test";
import { KVKeyInstance } from "./key.ts";
import { KVOperation, KVTransaction } from "./transaction.ts";

test("KVTransaction: create and toUint8Array", async () => {
  const key = new KVKeyInstance(["testKey"]);
  const value = { name: "Alice", age: 30 };
  const timestamp = Date.now();

  const transaction = new KVTransaction();
  await transaction.create(key, KVOperation.SET, timestamp, value);

  const uint8Array = transaction.toUint8Array();
  const decodedTransaction = new KVTransaction();
  decodedTransaction.headerFromUint8Array(uint8Array.slice(8)); // Skip the initial 8 bytes (header and data lengths)
  decodedTransaction.dataFromUint8Array(transaction.data!);
  assertEquals(
    decodedTransaction.key?.getKeyRepresentation(),
    key.getKeyRepresentation(),
  );
  assertEquals(decodedTransaction.operation, transaction.operation);
  assertEquals(decodedTransaction.timestamp, transaction.timestamp);

  const decodedData = await decodedTransaction.validateAndGetData();
  assertEquals(decodedData, value);
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
