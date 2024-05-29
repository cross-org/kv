import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { Colors } from "@cross/utils";
import { printTransaction } from "../common.ts";
import { type KVKey, KVKeyInstance } from "../../lib/key.ts";

export async function scan(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let keyParsed;
  if (hasParameter(params, 0)) {
    try {
      keyParsed = KVKeyInstance.parse(params[0], false) as KVKey;
    } catch (e) {
      console.error(`Could not parse query: ${e.message}`);
      return false;
    }
  } else {
    console.error(Colors.red("No key specified."));
    return false;
  }

  // Iterate over matching entries
  let results = 0;
  for await (const transaction of container.db!.scan(keyParsed)) {
    printTransaction(transaction);
    results++;
  }

  if (results === 0) {
    console.log(Colors.red("Key not found."));
    return false;
  }

  console.log(""); // Extra newline for separation
  return true;
}
