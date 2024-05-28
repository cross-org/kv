import { Colors } from "@cross/utils";
import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { KVKeyInstance, type KVQuery } from "../../lib/key.ts";

// deno-lint-ignore require-await
export async function listKeys(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let query: KVQuery | null;
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
    query = null;
  }

  const childKeys = container.db?.listKeys(query);

  console.log("");

  if (childKeys && childKeys.length > 0) {
    if (query === null) {
      console.log(Colors.bold("Root Keys:"));
    } else {
      console.log(Colors.bold("Child Keys:"));
    }
    for (const childKey of childKeys) {
      console.log(`  ${childKey}`);
    }
  } else {
    if (query === null) {
      console.log(Colors.yellow("No root keys found."));
    } else {
      console.log(Colors.yellow("No child keys found for the specified key."));
    }
  }
  console.log("");
  return true;
}
