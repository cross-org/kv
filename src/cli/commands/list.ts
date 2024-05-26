import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
  userInput,
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
    query = KVKeyInstance.parse(params[0], true); // Query parsing
  } else {
    const queryInput = userInput("Enter query (dot separated): ");
    if (!queryInput) return false; // Exit if no query provided
    query = KVKeyInstance.parse(queryInput, true);
  }

  console.log("");

  // Iterate over matching entries
  for await (const entry of container.db!.iterate(query)) {
    // Display key information
    const key = new KVKeyInstance(entry.key).stringify();
    console.log(key, entry.data);
  }

  console.log(""); // Extra newline for separation
  return true;
}
