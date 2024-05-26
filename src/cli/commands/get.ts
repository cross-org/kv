import { Colors } from "@cross/utils";
import {
  ensureMaxParameters,
  ensureOpen,
  hasParameter,
  type KVDBContainer,
  toHexString,
} from "../common.ts";
import { type KVKey, KVKeyInstance } from "../../lib/key.ts";
import { KVOperation } from "../../lib/transaction.ts";

export async function get(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;

  let key;
  if (hasParameter(params, 0)) {
    key = params[0];
  } else {
    console.error(Colors.red("No key specified."));
    return false;
  }

  const keyParsed = KVKeyInstance.parse(key, false) as KVKey;
  const value = await container.db?.get(keyParsed);

  if (value) {
    const operationName = KVOperation[value.operation as KVOperation] ??
      "Unknown";
    console.log("");
    console.log(Colors.bold("Key:\t\t"), JSON.stringify(keyParsed));
    console.log(
      Colors.bold("Operation:\t"),
      `${operationName} (${Colors.yellow(value.operation.toString())})`,
    );
    console.log(
      Colors.bold("Timestamp:\t"),
      Colors.magenta(new Date(value.timestamp).toISOString()),
    );
    console.log(
      Colors.bold("Hash:\t\t"),
      value.hash ? toHexString(value.hash) : null,
    );
    console.log("");
    console.dir(value.data, { depth: 3, colors: true });
    return true;
  } else {
    console.log(Colors.red("Key not found."));
    return false;
  }
}
