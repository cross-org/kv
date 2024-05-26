import { Colors } from "@cross/utils";
import type { KV } from "../../mod.ts";

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
export function userInput(t: string): string {
  return prompt(t) || "";
}
export function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
