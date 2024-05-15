import { assertEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { tempfile } from "@cross/fs";
import { KVLedger } from "./ledger.ts";
import { LEDGER_BASE_OFFSET, LEDGER_CURRENT_VERSION } from "./constants.ts";

test("KVLedger: readHeader - valid header", async () => {
  // Arrange: Create a temporary ledger file with a valid header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix);
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

  ledger.close();
});

test("KVLedger: readHeader - invalid file ID", async () => {
  // Arrange: Create a temporary ledger file with an invalid header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix);
  await ledger.open();

  ledger.header.fileId = "XXXX";
  await ledger.writeHeader();

  // Act & Assert: Expect an InvalidLedgerError
  await assertRejects(
    () => ledger.readHeader(),
    "Invalid database file format",
  );

  ledger.close();
});

test("KVLedger: readHeader - invalid version", async () => {
  // Arrange: Create a temporary ledger file with an invalid header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix);
  await ledger.open();

  ledger.header.ledgerVersion = "XXXX";
  await ledger.writeHeader();

  // Act & Assert: Expect an InvalidLedgerError
  await assertRejects(() => ledger.readHeader(), "Invalid version");

  ledger.close();
});

test("KVLedger: writeHeader", async () => {
  // Arrange: Create a ledger and modify its header
  const tempFilePrefix = await tempfile();
  const ledger = new KVLedger(tempFilePrefix);
  await ledger.open();
  ledger.header.created = 1234567890;
  ledger.header.currentOffset = 2048;

  // Act: Write the modified header
  await ledger.writeHeader();

  // Assert: Read the header again and verify it matches the modifications
  await ledger.readHeader(); // Re-read from disk
  assertEquals(ledger.header.created, 1234567890);
  assertEquals(ledger.header.currentOffset, 2048);

  ledger.close();
});
