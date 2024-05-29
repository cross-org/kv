import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { KVKeyInstance } from "../../lib/key.ts";

// deno-lint-ignore require-await
export async function count(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let key;
  if (hasParameter(params, 0)) {
    try {
      key = new KVKeyInstance(KVKeyInstance.parse(params[0], true));
    } catch (e) {
      console.error(`Could not parse query: ${e.message}`);
      return false;
    }
  } else {
    key = new KVKeyInstance([{}], true);
  }

  console.log("");

  // Iterate over matching entries
  try {
    console.log(container.db!.count(key.get()));
    console.log(""); // Extra newline for separation
    return true;
  } catch (e) {
    console.error(`Error while counting transactions: ${e.message}`);
    console.log(""); // Extra newline for separation
    return false;
  }
}
