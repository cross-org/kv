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

test("KVTransaction: roundtrip with string value", async () => {
  // Arrange
  const key = new KVKeyInstance(["user", "name"]);
  const value = "Alice";
  const timestamp = Date.now();

  // Act: Create, encode, and decode
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  const decoded = new KVTransaction();
  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );
  await decoded.dataFromUint8Array(transaction.data!);

  // Assert
  assertEquals(decoded.asResult().data, value);
});

test("KVTransaction: roundtrip with number value", async () => {
  // Arrange
  const key = new KVKeyInstance(["user", "age"]);
  const value = 42;
  const timestamp = Date.now();

  // Act: Create, encode, and decode
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  const decoded = new KVTransaction();
  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );
  await decoded.dataFromUint8Array(transaction.data!);

  // Assert
  assertEquals(decoded.asResult().data, value);
});

test("KVTransaction: roundtrip with Date value", async () => {
  // Arrange
  const key = new KVKeyInstance(["event", "timestamp"]);
  const value = new Date("2024-01-01T00:00:00Z");
  const timestamp = Date.now();

  // Act: Create, encode, and decode
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  const decoded = new KVTransaction();
  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );
  await decoded.dataFromUint8Array(transaction.data!);

  // Assert
  assertEquals(decoded.asResult().data.getTime(), value.getTime());
});

test("KVTransaction: roundtrip with Map value", async () => {
  // Arrange
  const key = new KVKeyInstance(["config", "settings"]);
  const value = new Map([["theme", "dark"], ["lang", "en"]]);
  const timestamp = Date.now();

  // Act: Create, encode, and decode
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  const decoded = new KVTransaction();
  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );
  await decoded.dataFromUint8Array(transaction.data!);

  // Assert
  const result = decoded.asResult().data;
  assertEquals(result instanceof Map, true);
  assertEquals(result.get("theme"), "dark");
  assertEquals(result.get("lang"), "en");
});

test("KVTransaction: roundtrip with Set value", async () => {
  // Arrange
  const key = new KVKeyInstance(["tags"]);
  const value = new Set(["javascript", "typescript", "deno"]);
  const timestamp = Date.now();

  // Act: Create, encode, and decode
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  const decoded = new KVTransaction();
  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );
  await decoded.dataFromUint8Array(transaction.data!);

  // Assert
  const result = decoded.asResult().data;
  assertEquals(result instanceof Set, true);
  assertEquals(result.has("javascript"), true);
  assertEquals(result.has("typescript"), true);
  assertEquals(result.has("deno"), true);
  assertEquals(result.size, 3);
});

test("KVTransaction: DELETE operation has no data", async () => {
  // Arrange
  const key = new KVKeyInstance(["user", "deleted"]);
  const timestamp = Date.now();

  // Act: Create DELETE transaction
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.DELETE,
    timestamp,
    undefined,
    KVHashAlgorithm.MURMURHASH3,
  );

  const uint8Array = transaction.toUint8Array();
  const dataView = new DataView(uint8Array.buffer);
  const dataLength = dataView.getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length + 4,
  );

  // Assert: DELETE operation should have no data
  assertEquals(dataLength, 0);
  assertEquals(transaction.data, undefined);
});

test("KVTransaction: faulty hash algorithm", async () => {
  // Arrange
  const key = new KVKeyInstance(["test"]);
  const value = "data";
  const timestamp = Date.now();

  // Act: Create with faulty algorithm
  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.FAULTY_MURMURHASH3,
  );

  // Assert: Should have created transaction with faulty hash
  assertEquals(transaction.hash !== undefined, true);
  assertEquals(transaction.hashIsFresh, true);
});

test("KVTransaction: dataFromUint8Array with faulty algorithm", async () => {
  // Arrange
  const key = new KVKeyInstance(["test"]);
  const value = "data";
  const timestamp = Date.now();

  const transaction = new KVTransaction();
  await transaction.create(
    key,
    KVOperation.SET,
    timestamp,
    value,
    KVHashAlgorithm.FAULTY_MURMURHASH3,
  );

  // Act: Decode with faulty algorithm
  const decoded = new KVTransaction();
  const uint8Array = transaction.toUint8Array();
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );
  await decoded.dataFromUint8Array(
    transaction.data!,
    KVHashAlgorithm.FAULTY_MURMURHASH3,
  );

  // Assert: Should successfully decode with matching algorithm
  assertEquals(decoded.data, transaction.data);
});

test("KVTransaction: hash mismatch error", async () => {
  // Arrange
  const key = new KVKeyInstance(["test"]);
  const value = "data";
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
  const headerOffset = ENCODED_TRANSACTION_SIGNATURE.length + 4 + 4;
  const headerLength = new DataView(uint8Array.buffer).getUint32(
    ENCODED_TRANSACTION_SIGNATURE.length,
  );

  const decoded = new KVTransaction();
  decoded.headerFromUint8Array(
    uint8Array.slice(headerOffset, headerOffset + headerLength),
  );

  // Act & Assert: Try to decode with wrong data (should fail hash check)
  const wrongData = new Uint8Array([1, 2, 3, 4, 5]);
  assertThrows(
    () => {
      decoded.dataFromUint8Array(wrongData);
    },
    Error,
    "Invalid data: Read data not matching hash",
  );
});

test("KVTransaction: invalid operation type", () => {
  // Arrange: Create data with invalid operation
  const invalidData = new Uint8Array(20);
  const dataView = new DataView(invalidData.buffer);
  dataView.setUint32(0, 4); // Key length
  // Offset 4-7: key data
  dataView.setUint8(8, 99); // Invalid operation (not 1 or 2)
  dataView.setFloat64(9, Date.now(), false); // Timestamp
  dataView.setUint32(17, 0); // Hash

  // Act & Assert: Should throw error for invalid operation
  const transaction = new KVTransaction();
  assertThrows(
    () => transaction.headerFromUint8Array(invalidData),
    Error,
    "Invalid operation",
  );
});

test("KVTransaction: extra data in header", () => {
  // Arrange: Create header with extra bytes
  const key = new KVKeyInstance(["test"]);
  const keyBytes = key.toUint8Array();
  const headerSize = 4 + keyBytes.length + 1 + 8 + 4 + 10; // Extra 10 bytes
  const headerData = new Uint8Array(headerSize);
  const dataView = new DataView(headerData.buffer);

  dataView.setUint32(0, keyBytes.length, false);
  headerData.set(keyBytes, 4);
  dataView.setUint8(4 + keyBytes.length, KVOperation.SET);
  dataView.setFloat64(4 + keyBytes.length + 1, Date.now(), false);
  dataView.setUint32(4 + keyBytes.length + 1 + 8, 12345, false);

  // Act & Assert: Should throw error for extra data
  const transaction = new KVTransaction();
  assertThrows(
    () => transaction.headerFromUint8Array(headerData),
    Error,
    "Invalid data: Extra data in transaction header",
  );
});

test("KVTransaction: create without value for SET throws error", () => {
  // Arrange
  const key = new KVKeyInstance(["test"]);
  const timestamp = Date.now();

  // Act & Assert: SET operation without value should throw
  const transaction = new KVTransaction();
  assertThrows(
    () => {
      transaction.create(
        key,
        KVOperation.SET,
        timestamp,
        undefined,
        KVHashAlgorithm.MURMURHASH3,
      );
    },
    Error,
    "Set operation needs data",
  );
});

test("KVTransaction: incorrect hash algorithm throws error", () => {
  // Arrange
  const key = new KVKeyInstance(["test"]);
  const timestamp = Date.now();

  // Act & Assert: Invalid algorithm should throw
  const transaction = new KVTransaction();
  assertThrows(
    () => {
      transaction.create(
        key,
        KVOperation.SET,
        timestamp,
        "value",
        99 as KVHashAlgorithm, // Invalid algorithm
      );
    },
    Error,
    "Incorrect hash algorithm requested",
  );
});
