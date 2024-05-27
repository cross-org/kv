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
