import type { KVDBContainer } from "../common.ts";
import { memoryUsage, systemMemoryInfo } from "@cross/utils";

// Explicit return type for clarity
// deno-lint-ignore require-await
async function sysinfo(
  _container: KVDBContainer,
  _params: string[],
): Promise<boolean> {
  console.dir(memoryUsage());
  console.dir(systemMemoryInfo());
  return true; // Indicate successful command execution
}

export { sysinfo };
