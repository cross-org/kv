/**
 * Benchmark to demonstrate index cache performance improvement
 * Run with: deno run -A test/index-cache-benchmark.ts
 */

console.log("=== Index Cache Performance Benchmark ===\n");

const { KV } = await import("../src/lib/kv.ts");

// Configuration
const NUM_ENTRIES = 5000;
const tempFile = `/tmp/bench-${Date.now()}.db`;

console.log(`Creating database with ${NUM_ENTRIES} entries...`);

// Create a database with many entries
const createDb = new KV({ enableIndexCache: true, autoSync: false });
await createDb.open(tempFile);

for (let i = 0; i < NUM_ENTRIES; i++) {
  await createDb.set(["item", i, "data"], {
    id: i,
    name: `Item ${i}`,
    timestamp: Date.now(),
  });
}

await createDb.close();
console.log("✓ Database created and closed (cache saved)\n");

// Benchmark: Open without cache
console.log("Benchmark 1: Opening database WITHOUT index cache");
const startNoCache = performance.now();
const dbNoCache = new KV({ enableIndexCache: false, autoSync: false });
await dbNoCache.open(tempFile);
const timeNoCache = performance.now() - startNoCache;
await dbNoCache.close();
console.log(`  Time: ${timeNoCache.toFixed(2)}ms\n`);

// Benchmark: Open with cache
console.log("Benchmark 2: Opening database WITH index cache");
const startWithCache = performance.now();
const dbWithCache = new KV({ enableIndexCache: true, autoSync: false });
await dbWithCache.open(tempFile);
const timeWithCache = performance.now() - startWithCache;
await dbWithCache.close();
console.log(`  Time: ${timeWithCache.toFixed(2)}ms\n`);

// Calculate improvement
const improvement = ((timeNoCache - timeWithCache) / timeNoCache * 100).toFixed(
  1,
);
const speedup = (timeNoCache / timeWithCache).toFixed(2);

console.log("=== Results ===");
console.log(`Without cache: ${timeNoCache.toFixed(2)}ms`);
console.log(`With cache:    ${timeWithCache.toFixed(2)}ms`);
console.log(`Improvement:   ${improvement}% faster`);
console.log(`Speedup:       ${speedup}x`);

if (timeWithCache < timeNoCache) {
  console.log("\n✓ Cache provides measurable performance improvement!");
} else {
  console.log(
    "\n⚠ Cache performance similar to non-cached (may vary by system)",
  );
}
