import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
  userInput,
} from "../common.ts";
import { KVKeyInstance, type KVQuery } from "../../lib/key.ts";
import { KVOperation } from "../../lib/transaction.ts";
import { Colors } from "@cross/utils";
import { toHexString } from "../common.ts";

export async function scan(
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
  let results = 0;
  for await (const value of container.db!.scan(query)) {
    const operationName = KVOperation[value.operation as KVOperation] ??
      "Unknown";
    console.log(
      Colors.magenta(new Date(value.timestamp).toISOString()),
      JSON.stringify(value.key),
      `${operationName} (${Colors.yellow(value.operation.toString())})`,
      JSON.stringify(value.data).slice(0, 30),
    );
    results++;
  }
  if (results === 0) {
    console.log(Colors.red("Key not found."));
    return false;
  }

  console.log(""); // Extra newline for separation
  return true;
}
