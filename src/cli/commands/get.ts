import { Colors } from "@cross/utils";
import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { type KVKey, KVKeyInstance } from "../../lib/key.ts";
import { printTransaction } from "../common.ts";

export async function get(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let key: KVKey;
  if (hasParameter(params, 0)) {
    // Validate query
    try {
      const parsedKey = KVKeyInstance.parse(params[0], false);
      key = new KVKeyInstance(parsedKey).get() as KVKey;
    } catch (e) {
      console.error(`Could not parse key: ${e.message}`);
      return false;
    }
  } else {
    console.error("No key supplied.");
    return false;
  }

  const transaction = await container.db?.get(key);

  if (transaction) {
    printTransaction(transaction);
    console.log("");
    return true;
  } else {
    console.log(Colors.red("Key not found."));
    console.log("");
    return false;
  }
}
