import { KV } from "../mod.ts";
import { getEnv } from "jsr:@cross/env";

import { PupTelemetry } from "jsr:@pup/telemetry";
new PupTelemetry(); // Initializes telemetry

const db = "./mydatabase18/";
const kvStore = new KV();
await kvStore.open(db); // Path where data files will be stored
const inst = getEnv("PUP_CLUSTER_INSTANCE");
console.log(`Instance ${inst} starting...`);
const recurser = async () => {
  const randomValue = Math.ceil(Math.random() * 1000);
  console.log(
    `Instance ${inst} writing ${randomValue} to ["values",${randomValue}]`,
  );
  await kvStore.set(["values", randomValue], randomValue);
  console.log(
    `Instance ${inst} reading ${
      (await kvStore.get(["values", randomValue]))?.data
    } from ["values",${randomValue}]`,
  );
  setTimeout(() => recurser(), Math.random() * 10000);
};
recurser();
kvStore.on("sync", (d) => {
  console.log(`Instance ${inst} synced with result ${d.error}`);
});
