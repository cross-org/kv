import { tempfile } from "@cross/fs";
import { KV } from "./kv.ts";

const DATABASE_FILE_CROSS = await tempfile();
const DATABASE_FILE_DENO = await tempfile();

// Your setup and cleanup functions
async function setupKV() {
  const kvStore = new KV();
  await kvStore.open(DATABASE_FILE_CROSS);
  return kvStore;
}

async function setupDenoKV() {
  const kvStore = await Deno.openKv(DATABASE_FILE_DENO);
  return kvStore;
}

/*async function cleanup() {
  denoStore.close();
  await crossStore.close();
}*/

const crossStore = await setupKV();
const denoStore = await setupDenoKV();
let crossIter = 0;
let denoIter = 0;

await Deno.bench("cross_kv_set", async () => {
  await crossStore.set(["testKey", crossIter++], {
    data: "testData",
    ts: new Date(),
  });
});

await Deno.bench("deno_kv_set", async () => {
  await denoStore.set(["testKey", denoIter++], {
    data: "testData",
    ts: new Date(),
  });
});

await Deno.bench("cross_kv_get", async () => {
  await crossStore.get(["testKey", 3]);
});

await Deno.bench("deno_kv_get", async () => {
  await denoStore.get(["testKey", 3]);
});

//await cleanup();
