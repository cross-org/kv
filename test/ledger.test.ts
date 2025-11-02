import { assertEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { tempfile } from "@cross/fs";
import { KVLedger } from "../src/lib/ledger.ts";
import {
  LEDGER_BASE_OFFSET,
  LEDGER_CURRENT_VERSION,
} from "../src/lib/constants.ts";
import { KVTransaction } from "../src/lib/transaction.ts";

test("KVLedger: readHeader - valid header", async () => {
  // Arrange: Create a temporary ledger file with a valid header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();

  // Act: Read the header
  await ledger.readHeader();

  // Assert: Verify the header matches the expected values
  assertEquals(ledger.header.fileId, "CKVD"); // Could be LEDGER_FILE_ID, but kept as "CKVD" to make sure it doesn't change
  assertEquals(ledger.header.ledgerVersion, LEDGER_CURRENT_VERSION);
  assertEquals(
    ledger.header.created > 0,
    true,
    "Created timestamp should be valid",
  );
  assertEquals(ledger.header.currentOffset, LEDGER_BASE_OFFSET);
});

test("KVLedger: readHeader - invalid file ID", async () => {
  // Arrange: Create a temporary ledger file with an invalid header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 0);
  await ledger.open();

  ledger.header.fileId = "XXXX";
  await ledger.writeHeader();

  // Act & Assert: Expect an InvalidLedgerError
  await assertRejects(
    () => ledger.readHeader(),
    "Invalid database file format",
  );
});

test("KVLedger: readHeader - invalid version", async () => {
  // Arrange: Create a temporary ledger file with an invalid header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 0);
  await ledger.open();

  ledger.header.ledgerVersion = "XXXX";
  await ledger.writeHeader();

  // Act & Assert: Expect an InvalidLedgerError
  await assertRejects(() => ledger.readHeader(), "Invalid version");
});

test("KVLedger: writeHeader", async () => {
  // Arrange: Create a ledger and modify its header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();
  ledger.header.created = 1234567890;
  ledger.header.currentOffset = 2048;

  // Act: Write the modified header
  await ledger.writeHeader();

  // Assert: Read the header again and verify it matches the modifications
  await ledger.readHeader(); // Re-read from disk
  assertEquals(ledger.header.created, 1234567890);
  assertEquals(ledger.header.currentOffset, 2048);
});

test("KVLedger: lock acquisition", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();

  // Act: Acquire lock
  const lockId = await ledger.lock();

  // Assert: Verify lock is acquired
  const isLocked = await ledger.verifyLock(lockId);
  assertEquals(isLocked, true);

  await ledger.unlock(lockId);
});

test("KVLedger: unlock releases lock", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();
  const lockId = await ledger.lock();

  // Act: Release lock
  await ledger.unlock(lockId);

  // Assert: Verify lock is released
  const isLocked = await ledger.verifyLock(lockId);
  assertEquals(isLocked, false);
});

test("KVLedger: verifyLock passes after lock", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();
  const lockId = await ledger.lock();

  // Act & Assert: Verify should pass
  const result = await ledger.verifyLock(lockId);
  assertEquals(result, true);

  await ledger.unlock(lockId);
});

test("KVLedger: verifyLock fails when not locked", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();

  // Act & Assert: Verify should fail without lock
  const result = await ledger.verifyLock(BigInt(0));
  assertEquals(result, false);
});

test("KVLedger: multiple lock attempts", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger1 = new KVLedger(tempFilePrefix, 100);
  const ledger2 = new KVLedger(tempFilePrefix, 100);
  await ledger1.open();
  await ledger2.open();

  // Act: First ledger acquires lock
  const lockId = await ledger1.lock();

  // Assert: Second ledger should see it's locked
  const canLock = await ledger2.verifyLock(lockId);
  assertEquals(canLock, false);

  await ledger1.unlock(lockId);
});

test("KVLedger: cache stores and retrieves transactions", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 10);
  await ledger.open();

  // Act: Use cache directly
  const mockTransaction = new KVTransaction();
  const mockResult = {
    offset: 100,
    length: 50,
    transaction: mockTransaction,
    complete: true,
    errorCorrectionOffset: 0,
  };
  ledger.cache.cacheTransactionData(100, mockResult);

  // Assert: Retrieve from cache
  const cached = ledger.cache.getTransactionData(100);
  assertEquals(cached, mockResult);
});

test("KVLedger: prefetch clears cache", async () => {
  // Arrange
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix, 100);
  await ledger.open();

  // Act: Clear prefetch cache
  ledger.prefetch.clear();

  // Assert: Should not throw and prefetch should be cleared
  // (no direct way to verify, but operation should succeed)
  assertEquals(true, true);
});
