import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { pseudoRandomTimestamp } from "../src/lib/utils/randomts.ts";

test("pseudoRandomTimestamp: returns a bigint", () => {
  const ts = pseudoRandomTimestamp(BigInt(Date.now()));
  assertEquals(typeof ts, "bigint");
});

test("pseudoRandomTimestamp: result is close to original timestamp", () => {
  const original = BigInt(Date.now());
  const result = pseudoRandomTimestamp(original);

  // The upper bits should be preserved (only bottom numBits are randomized)
  // With numBits=11, the mask clears the lower 11 bits (~2047), so the
  // result should be within 2048 of the original
  const diff = result > original ? result - original : original - result;
  assertEquals(diff < BigInt(2048), true);
});

test("pseudoRandomTimestamp: produces different values on repeated calls", () => {
  const ts = BigInt(Date.now());
  const results = new Set<bigint>();

  // Generate multiple values; they should not all be the same
  for (let i = 0; i < 20; i++) {
    results.add(pseudoRandomTimestamp(ts));
  }

  // With 11 bits of randomness (2048 possible values), 20 calls should
  // almost certainly produce more than one unique value
  assertEquals(results.size > 1, true);
});

test("pseudoRandomTimestamp: custom numBits works", () => {
  const original = BigInt(1000000);
  const result = pseudoRandomTimestamp(original, 4);

  // With numBits=4, only the bottom 4 bits (0–15) are randomized
  const diff = result > original ? result - original : original - result;
  assertEquals(diff < BigInt(16), true);
});

test("pseudoRandomTimestamp: zero timestamp produces a bigint", () => {
  const result = pseudoRandomTimestamp(BigInt(0));
  assertEquals(typeof result, "bigint");
  // With 0 input and 11-bit randomness, result should be < 2048
  assertEquals(result < BigInt(2048), true);
});

test("pseudoRandomTimestamp: preserves upper bits of large timestamp", () => {
  const original = BigInt("0x7FFFFFFFFFFFFFFF"); // Large 63-bit value
  const result = pseudoRandomTimestamp(original, 11);
  const mask = BigInt(~((1 << 11) - 1));

  // Upper bits should match
  assertEquals((result & mask) === (original & mask), true);
});
