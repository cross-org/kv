import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { KVKeyInstance, type KVQuery } from "../../lib/key.ts";

export async function list(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let query: KVQuery;
  if (hasParameter(params, 0)) {
    // Validate query
    query = new KVKeyInstance(KVKeyInstance.parse(params[0], true)).get();
  } else {
    console.error("No query supplied.");
    return false;
  }

  console.log("");

  // Iterate over matching entries
  for await (const entry of container.db!.iterate(query, 100)) {
    // Display key information
    const key = new KVKeyInstance(entry.key).stringify();
    console.log(key, entry.data);
  }

  console.log(""); // Extra newline for separation
  return true;
}
