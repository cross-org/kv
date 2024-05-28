import type { KVDBContainer } from "../common.ts";
import { memoryUsage, systemMemoryInfo } from "@cross/utils";
import { Colors } from "@cross/utils";

// deno-lint-ignore require-await
async function sysinfo(
  _container: KVDBContainer,
  _params: string[],
): Promise<boolean> {
  const procMemory = memoryUsage();
  const sysMemory = systemMemoryInfo();

  console.log(Colors.bold(Colors.blue("Process Memory:")));
  console.log(
    Colors.dim(`  External:   `),
    formatBytes(procMemory.external || 0),
  );
  console.log(
    Colors.dim(`  Heap Total: `),
    formatBytes(procMemory.heapTotal || 0),
  );
  console.log(
    Colors.dim(`  Heap Used:  `),
    formatBytes(procMemory.heapUsed || 0),
  );
  console.log(Colors.dim(`  RSS:        `), formatBytes(procMemory.rss || 0));
  console.log(""); // Add an empty line for better readability

  console.log(Colors.bold(Colors.blue("System Memory:")));
  console.log(Colors.dim(`  Total:      `), formatBytes(sysMemory.total || 0));
  console.log(Colors.dim(`  Free:       `), formatBytes(sysMemory.free || 0));
  console.log(
    Colors.dim(`  Available:  `),
    formatBytes(sysMemory.available || 0),
  );
  console.log(
    Colors.dim(`  Buffers:    `),
    formatBytes(sysMemory.buffers || 0),
  );
  console.log(Colors.dim(`  Cached:     `), formatBytes(sysMemory.cached || 0));
  console.log(
    Colors.dim(`  Swap Total: `),
    formatBytes(sysMemory.swapTotal || 0),
  );
  console.log(
    Colors.dim(`  Swap Free:  `),
    formatBytes(sysMemory.swapFree || 0),
  );

  return true;
}

// Helper function to format bytes into a human-readable string
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(2)} ${units[i]}`;
}

export { sysinfo };
