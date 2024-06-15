import { Colors } from "@cross/utils";
import type { KV, KVTransactionResult } from "../../mod.ts";
import { KVOperation } from "../lib/transaction.ts";

export interface KVDBContainer {
  db?: KV;
}

export type KVCliHandler = (
  container: KVDBContainer,
  params: string[],
) => Promise<boolean>;

export function ensureOpen(container: KVDBContainer): boolean {
  if (!container.db || !container.db.isOpen()) {
    console.log(Colors.yellow("A database is not open."));
    return false;
  } else {
    return true;
  }
}
export function ensureMaxParameters(p: string[], n: number): boolean {
  if (p.length > n) {
    console.log(Colors.red("Wrong number of parameters"));
    return false;
  } else {
    return true;
  }
}
export function hasParameter(p: string[], n: number): boolean {
  if (p.length < n + 1) {
    return false;
  } else {
    return true;
  }
}
export function toHexString(bytes: number): string {
  // Ensure the input is a valid number
  if (typeof bytes !== "number" || isNaN(bytes)) {
    throw new Error("Input must be a valid number");
  }

  // Convert the number to an unsigned 32-bit integer
  const unsignedNumber = bytes >>> 0;

  // Use toString(16) for hexadecimal conversion
  const hexString = unsignedNumber.toString(16);

  // Pad with zeros if needed
  return hexString.padStart(2, "0");
}
export function printTransaction(
  transaction: KVTransactionResult<unknown>,
): void {
  const operationName = KVOperation[transaction.operation as KVOperation] ??
    "Unknown";

  console.log("");
  console.log(Colors.dim("---"));
  console.log("");
  console.log(Colors.bold("Key:\t\t"), JSON.stringify(transaction.key));
  console.log(
    Colors.bold("Operation:\t"),
    `${operationName} (${Colors.yellow(transaction.operation.toString())})`,
  );
  console.log(
    Colors.bold("Timestamp:\t"),
    Colors.magenta(new Date(transaction.timestamp).toISOString()),
  );
  console.log(
    Colors.bold("Hash:\t\t"),
    transaction.hash ? toHexString(transaction.hash) : null,
  );
  console.log("");
  console.dir(transaction.data, { depth: 3, colors: true });
}
