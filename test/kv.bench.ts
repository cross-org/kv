import { tempfile } from "@cross/fs";
import { KV } from "../src/lib/kv.ts";

const DATABASE_FILE_CROSS = await tempfile() + "poo";
const DATABASE_FILE_DENO = await tempfile() + "poo";

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

const crossStore = await setupKV();
const denoStore = await setupDenoKV();
let crossIterTransaction = 0;
let denoIterTransaction = 0;

await Deno.bench("cross_kv_set_100_atomic", async () => {
  await crossStore.beginTransaction();
  for (let i = 0; i < 100; i++) {
    await crossStore.set(["testKey", crossIterTransaction++], {
      data: {
        data: "testData",
        i: crossIterTransaction,
        more: {
          "test": "data",
          "with1": new Date(),
          "with2": new Date(),
          "with3": new Date(),
          "with4": new Date(),
          "with5": new Date(),
          "with6": new Date(),
        },
        ts: new Date(),
      },
    });
  }
  await crossStore.endTransaction();
});

await Deno.bench("deno_kv_set_100_atomic", async () => {
  const at = denoStore.atomic();
  for (let i = 0; i < 100; i++) {
    at.set(["testKey", denoIterTransaction++], {
      data: {
        data: "testData",
        i: denoIterTransaction,
        more: {
          "test": "data",
          "with1": new Date(),
          "with2": new Date(),
          "with3": new Date(),
          "with4": new Date(),
          "with5": new Date(),
          "with6": new Date(),
        },
        ts: new Date(),
      },
    });
  }
  await at.commit();
});

let crossIter = 0;
let denoIter = 0;
await Deno.bench("cross_kv_set", async () => {
  await crossStore.set(["testKey2", crossIter++], {
    data: {
      data: "testData",
      i: crossIter,
      more: {
        "test": "data",
        "with1": new Date(),
        "with2": new Date(),
        "with3": new Date(),
        "with4": new Date(),
        "with5": new Date(),
        "with6": new Date(),
      },
      ts: new Date(),
    },
  });
});

await Deno.bench("deno_kv_set", async () => {
  await denoStore.set(["testKey2", denoIter++], {
    data: {
      data: "testData",
      i: denoIter,
      more: {
        "test": "data",
        "with1": new Date(),
        "with2": new Date(),
        "with3": new Date(),
        "with4": new Date(),
        "with5": new Date(),
        "with6": new Date(),
      },
      ts: new Date(),
    },
  });
});

await Deno.bench("cross_kv_get", async () => {
  await crossStore.get(["testKey", 3]);
});

await Deno.bench("deno_kv_get", async () => {
  await denoStore.get(["testKey", 3]);
});
