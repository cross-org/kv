/**
 * node:crypto is used instead of global crypto.subtle to get Node/Bun-support without polyfilling
 */
import { subtle } from "node:crypto";

export async function sha1(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest("SHA-1", data));
}

export function compareHash(arr1: Uint8Array, arr2: Uint8Array): boolean {
  if (arr1.length !== arr2.length) return false; // Length mismatch

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false; // Value mismatch
  }
  return true;
}
