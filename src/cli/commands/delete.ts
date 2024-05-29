import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";
import { type KVKey, KVKeyInstance } from "../../lib/key.ts";

export async function del(
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

  try {
    await container.db?.delete(key);
    console.log(""); // Extra newline for separation
    return true;
  } catch (e) {
    console.error(`Error while deleting data: ${e.message}`);
    console.log(""); // Extra newline for separation
    return false;
  }
}
