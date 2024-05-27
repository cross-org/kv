import { Colors } from "@cross/utils";
import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { type KVKey, KVKeyInstance, type KVQuery } from "../../lib/key.ts";

// deno-lint-ignore require-await
export async function listKeys(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let key: KVKey | KVQuery | null = null;
  if (hasParameter(params, 0)) {
    key = KVKeyInstance.parse(params[0], true); // Allow range
  } else {
    key = null;
  }

  const childKeys = container.db?.listKeys(key);

  if (childKeys && childKeys.length > 0) {
    console.log(Colors.bold("Child Keys:"));
    for (const childKey of childKeys) {
      console.log(`  ${childKey}`);
    }
  } else {
    if (key === null) {
      console.log(Colors.yellow("No root keys found."));
    } else {
      console.log(Colors.yellow("No child keys found for the specified key."));
    }
  }
  return true;
}
