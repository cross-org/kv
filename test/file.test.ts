import { assertEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { tempfile } from "@cross/fs";
import { join } from "@std/path";
import {
  ensureFile,
  rawOpen,
  readAtPosition,
  toNormalizedAbsolutePath,
  writeAtPosition,
} from "../src/lib/utils/file.ts";
import { cwd } from "@cross/fs";

test("toNormalizedAbsolutePath: absolute path stays absolute", () => {
  // Act
  const result = toNormalizedAbsolutePath("/tmp/test.db");

  // Assert: Should remain absolute and normalized
  assertEquals(result.startsWith("/"), true);
  assertEquals(result.includes("test.db"), true);
});

test("toNormalizedAbsolutePath: relative path becomes absolute", () => {
  // Act
  const result = toNormalizedAbsolutePath("test.db");

  // Assert: Should be absolute and include current working directory
  assertEquals(result.startsWith("/"), true);
  assertEquals(result.includes("test.db"), true);
  assertEquals(result.includes(cwd()), true);
});

test("toNormalizedAbsolutePath: path with .. gets normalized", () => {
  // Act
  const result = toNormalizedAbsolutePath("/tmp/dir/../test.db");

  // Assert: Should resolve .. segments
  assertEquals(result.includes(".."), false);
  assertEquals(result.includes("test.db"), true);
});

test("toNormalizedAbsolutePath: path with . gets normalized", () => {
  // Act
  const result = toNormalizedAbsolutePath("/tmp/./test.db");

  // Assert: Should resolve . segments
  const parts = result.split("/");
  assertEquals(parts.includes("."), false);
  assertEquals(result.includes("test.db"), true);
});

test("ensureFile: creates file when missing", async () => {
  // Arrange: Get a temp file path that doesn't exist yet
  const tempDir = await tempfile();
  const testFile = join(tempDir, "subdir", "newfile.db");

  // Act: Ensure the file exists
  const existed = await ensureFile(testFile);

  // Assert: File should be created
  assertEquals(existed, false);

  // Verify file was actually created
  const fd = await rawOpen(testFile, false);
  await fd.close();
});

test("ensureFile: no-op when file exists", async () => {
  // Arrange: Create a file first
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  await writeAtPosition(fd, new Uint8Array([1, 2, 3]), 0);
  await fd.close();

  // Act: Ensure the file exists again
  const existed = await ensureFile(tempFile);

  // Assert: Should report it already existed
  assertEquals(existed, true);

  // Verify original data is still there
  const fd2 = await rawOpen(tempFile, false);
  const data = await readAtPosition(fd2, 3, 0);
  assertEquals(data, new Uint8Array([1, 2, 3]));
  await fd2.close();
});

test("rawOpen: open in read-only mode", async () => {
  // Arrange: Create a file
  const tempFile = await tempfile();
  const fdWrite = await rawOpen(tempFile, true);
  await writeAtPosition(fdWrite, new Uint8Array([1, 2, 3]), 0);
  await fdWrite.close();

  // Act: Open in read-only mode
  const fdRead = await rawOpen(tempFile, false);
  const data = await readAtPosition(fdRead, 3, 0);

  // Assert: Should be able to read
  assertEquals(data, new Uint8Array([1, 2, 3]));

  await fdRead.close();
});

test("rawOpen: open in write mode", async () => {
  // Arrange: Create a file
  const tempFile = await tempfile();

  // Act: Open in write mode and write data
  const fd = await rawOpen(tempFile, true);
  await writeAtPosition(fd, new Uint8Array([4, 5, 6]), 0);
  await fd.close();

  // Assert: Verify data was written
  const fdRead = await rawOpen(tempFile, false);
  const data = await readAtPosition(fdRead, 3, 0);
  assertEquals(data, new Uint8Array([4, 5, 6]));
  await fdRead.close();
});

test("rawOpen: error with invalid path", async () => {
  // Act & Assert: Try to open a non-existent file in read-only mode
  await assertRejects(
    async () => {
      await rawOpen("/nonexistent/path/to/file.db", false);
    },
    Error,
  );
});

test("readAtPosition: reads correct data at offset", async () => {
  // Arrange: Create a file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([10, 20, 30, 40, 50]);
  await writeAtPosition(fd, testData, 0);

  // Act: Read from middle of file
  const result = await readAtPosition(fd, 2, 2);

  // Assert: Should read bytes at positions 2-3
  assertEquals(result, new Uint8Array([30, 40]));

  await fd.close();
});

test("readAtPosition: partial read near EOF", async () => {
  // Arrange: Create a file with limited data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([1, 2, 3]);
  await writeAtPosition(fd, testData, 0);

  // Act: Try to read more than available
  const result = await readAtPosition(fd, 10, 1);

  // Assert: Should return only available bytes (2 bytes from position 1)
  assertEquals(result.length, 2);
  assertEquals(result, new Uint8Array([2, 3]));

  await fd.close();
});

test("readAtPosition: read from position 0", async () => {
  // Arrange: Create a file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([100, 101, 102]);
  await writeAtPosition(fd, testData, 0);

  // Act: Read from start
  const result = await readAtPosition(fd, 3, 0);

  // Assert: Should read from beginning
  assertEquals(result, new Uint8Array([100, 101, 102]));

  await fd.close();
});

test("readAtPosition: large buffer behavior", async () => {
  // Arrange: Create a file with larger data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const largeData = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    largeData[i] = i % 256;
  }
  await writeAtPosition(fd, largeData, 0);

  // Act: Read large chunk
  const result = await readAtPosition(fd, 512, 256);

  // Assert: Should read correct chunk
  assertEquals(result.length, 512);
  assertEquals(result[0], 0); // 256 % 256 = 0
  assertEquals(result[255], 255); // 511 % 256 = 255

  await fd.close();
});

test("writeAtPosition: writes correct data at offset", async () => {
  // Arrange: Create a file with initial data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const initialData = new Uint8Array([1, 2, 3, 4, 5]);
  await writeAtPosition(fd, initialData, 0);

  // Act: Overwrite middle bytes
  await writeAtPosition(fd, new Uint8Array([99, 98]), 2);

  // Assert: Read back and verify
  const result = await readAtPosition(fd, 5, 0);
  assertEquals(result, new Uint8Array([1, 2, 99, 98, 5]));

  await fd.close();
});

test("writeAtPosition: write at position 0", async () => {
  // Arrange: Create an empty file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);

  // Act: Write at the beginning
  await writeAtPosition(fd, new Uint8Array([7, 8, 9]), 0);

  // Assert: Read back and verify
  const result = await readAtPosition(fd, 3, 0);
  assertEquals(result, new Uint8Array([7, 8, 9]));

  await fd.close();
});

test("writeAtPosition: write beyond current file size", async () => {
  // Arrange: Create a small file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  await writeAtPosition(fd, new Uint8Array([1, 2]), 0);

  // Act: Write past the end
  await writeAtPosition(fd, new Uint8Array([99]), 10);

  // Assert: Read at new position
  const result = await readAtPosition(fd, 1, 10);
  assertEquals(result, new Uint8Array([99]));

  await fd.close();
});

test("writeAtPosition: large buffer write", async () => {
  // Arrange: Create a file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const largeData = new Uint8Array(2048);
  for (let i = 0; i < 2048; i++) {
    largeData[i] = (i * 7) % 256;
  }

  // Act: Write large buffer
  await writeAtPosition(fd, largeData, 0);

  // Assert: Read back and verify
  const result = await readAtPosition(fd, 2048, 0);
  assertEquals(result.length, 2048);
  assertEquals(result[0], 0);
  assertEquals(result[100], (100 * 7) % 256);

  await fd.close();
});
