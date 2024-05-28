import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { KVKeyInstance, type KVQuery } from "../../lib/key.ts";
import { printTransaction } from "../common.ts";

export async function list(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let query: KVQuery;
  if (hasParameter(params, 0)) {
    // Validate query
    try {
      const parsedKey = KVKeyInstance.parse(params[0], true);
      query = new KVKeyInstance(parsedKey, true).get();
    } catch (e) {
      console.error(`Could not parse query: ${e.message}`);
      return false;
    }
  } else {
    console.error("No query supplied.");
    return false;
  }

  console.log("");

  // Iterate over matching entries (max 1000)
  for await (const entry of container.db!.iterate(query, 1000)) {
    printTransaction(entry);
  }

  console.log(""); // Extra newline for separation
  return true;
}
