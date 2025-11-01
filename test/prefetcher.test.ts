import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { tempfile } from "@cross/fs";
import { KVPrefetcher } from "../src/lib/prefetcher.ts";
import { rawOpen, writeAtPosition } from "../src/lib/utils/file.ts";

test("KVPrefetcher: basic read with prefetch", async () => {
  // Arrange: Create a temp file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await writeAtPosition(fd, testData, 0);

  // Act: Read data using prefetcher
  const prefetcher = new KVPrefetcher(20); // Prefetch 20 bytes
  const result = await prefetcher.read(fd, 5, 0);

  // Assert: Verify correct data returned
  assertEquals(result, new Uint8Array([1, 2, 3, 4, 5]));

  await fd.close();
});

test("KVPrefetcher: sequential reads use cache", async () => {
  // Arrange: Create a temp file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await writeAtPosition(fd, testData, 0);

  // Act: Read sequentially
  const prefetcher = new KVPrefetcher(20);
  const result1 = await prefetcher.read(fd, 3, 0); // Should prefetch 20 bytes
  const result2 = await prefetcher.read(fd, 3, 3); // Should use cache
  const result3 = await prefetcher.read(fd, 3, 6); // Should use cache

  // Assert: Verify all reads are correct
  assertEquals(result1, new Uint8Array([1, 2, 3]));
  assertEquals(result2, new Uint8Array([4, 5, 6]));
  assertEquals(result3, new Uint8Array([7, 8, 9]));

  await fd.close();
});

test("KVPrefetcher: non-sequential read clears cache", async () => {
  // Arrange: Create a temp file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array(50);
  for (let i = 0; i < 50; i++) testData[i] = i;
  await writeAtPosition(fd, testData, 0);

  // Act: Read sequentially then jump
  const prefetcher = new KVPrefetcher(20);
  await prefetcher.read(fd, 3, 0); // Prefetch from 0
  const result = await prefetcher.read(fd, 3, 40); // Jump to 40, should re-fetch

  // Assert: Verify correct data
  assertEquals(result, new Uint8Array([40, 41, 42]));

  await fd.close();
});

test("KVPrefetcher: read larger than prefetch size", async () => {
  // Arrange: Create a temp file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array(100);
  for (let i = 0; i < 100; i++) testData[i] = i;
  await writeAtPosition(fd, testData, 0);

  // Act: Read larger than prefetch window
  const prefetcher = new KVPrefetcher(10); // Small prefetch
  const result = await prefetcher.read(fd, 30, 0); // Read 30 bytes

  // Assert: Should read exactly what's requested
  assertEquals(result.length, 30);
  assertEquals(result[0], 0);
  assertEquals(result[29], 29);

  await fd.close();
});

test("KVPrefetcher: partial read near EOF", async () => {
  // Arrange: Create a small temp file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  await writeAtPosition(fd, testData, 0);

  // Act: Try to read past EOF with prefetch
  const prefetcher = new KVPrefetcher(20);
  const result = await prefetcher.read(fd, 3, 3); // Read from position 3, only 2 bytes available

  // Assert: Should return only available bytes
  assertEquals(result.length, 2);
  assertEquals(result, new Uint8Array([4, 5]));

  await fd.close();
});

test("KVPrefetcher: zero-length read", async () => {
  // Arrange: Create a temp file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([1, 2, 3]);
  await writeAtPosition(fd, testData, 0);

  // Act: Read zero bytes
  const prefetcher = new KVPrefetcher(10);
  const result = await prefetcher.read(fd, 0, 0);

  // Assert: Should return empty array
  assertEquals(result.length, 0);

  await fd.close();
});

test("KVPrefetcher: clear cache", async () => {
  // Arrange: Create a temp file with test data
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  await writeAtPosition(fd, testData, 0);

  // Act: Read, clear, then read again
  const prefetcher = new KVPrefetcher(10);
  await prefetcher.read(fd, 2, 0);
  prefetcher.clear();
  const result = await prefetcher.read(fd, 2, 0); // Should re-fetch

  // Assert: Data should still be correct
  assertEquals(result, new Uint8Array([1, 2]));

  await fd.close();
});

test("KVPrefetcher: boundary offset at start of cache", async () => {
  // Arrange: Create a temp file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array(30);
  for (let i = 0; i < 30; i++) testData[i] = i;
  await writeAtPosition(fd, testData, 0);

  // Act: Read to populate cache, then read from exact start of cache
  const prefetcher = new KVPrefetcher(20);
  await prefetcher.read(fd, 5, 10); // Cache from 10-30
  const result = await prefetcher.read(fd, 5, 10); // Read from exact start

  // Assert: Should use cache
  assertEquals(result, new Uint8Array([10, 11, 12, 13, 14]));

  await fd.close();
});

test("KVPrefetcher: boundary offset at end of cache", async () => {
  // Arrange: Create a temp file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array(50);
  for (let i = 0; i < 50; i++) testData[i] = i;
  await writeAtPosition(fd, testData, 0);

  // Act: Read to populate cache, then read past end
  const prefetcher = new KVPrefetcher(20);
  await prefetcher.read(fd, 5, 0); // Cache from 0-20
  const result = await prefetcher.read(fd, 5, 18); // Partially in cache

  // Assert: Should re-fetch because read extends past cache
  assertEquals(result, new Uint8Array([18, 19, 20, 21, 22]));

  await fd.close();
});

test("KVPrefetcher: read from position before cache", async () => {
  // Arrange: Create a temp file
  const tempFile = await tempfile();
  const fd = await rawOpen(tempFile, true);
  const testData = new Uint8Array(50);
  for (let i = 0; i < 50; i++) testData[i] = i;
  await writeAtPosition(fd, testData, 0);

  // Act: Read to populate cache at offset, then read before it
  const prefetcher = new KVPrefetcher(20);
  await prefetcher.read(fd, 5, 20); // Cache from 20-40
  const result = await prefetcher.read(fd, 5, 0); // Read before cache

  // Assert: Should re-fetch
  assertEquals(result, new Uint8Array([0, 1, 2, 3, 4]));

  await fd.close();
});
