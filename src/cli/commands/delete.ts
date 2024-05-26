import { Colors } from "@cross/utils";
import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
  userInput,
} from "../common.ts";
import { type KVKey, KVKeyInstance } from "../../lib/key.ts";

export async function del(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let key;
  if (hasParameter(params, 0)) {
    key = params[0];
  } else {
    key = userInput("Enter key to delete (dot separated):") || "";
    if (!key) {
      console.error(Colors.red("Key not specified.\n"));
      return false;
    }
  }

  const keySplit = KVKeyInstance.parse(key, false) as KVKey;
  await container.db?.delete(keySplit);
  return true;
}
