import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
  userInput,
} from "../common.ts";
import { KVKeyInstance, type KVQuery } from "../../lib/key.ts";

export async function count(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let key;
  if (hasParameter(params, 0)) {
    key = new KVKeyInstance(KVKeyInstance.parse(params[0], true));
  } else {
    key = new KVKeyInstance([{}], true);
  }

  console.log("");

  // Iterate over matching entries
  console.log(container.db!.count(key.get()));

  console.log(""); // Extra newline for separation
  return true;
}
