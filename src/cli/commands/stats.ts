import type { KVDBContainer } from "../common.ts";
import { memoryUsage, systemMemoryInfo } from "@cross/utils";
import { Colors } from "@cross/utils";
import type { KV } from "../../lib/kv.ts";
import { stat } from "@cross/fs";
import { KVOperation } from "../../lib/transaction.ts";

async function stats(
  container: KVDBContainer,
  _params: string[],
): Promise<boolean> {
  console.log("");
  const procMemory = memoryUsage();
  const sysMemory = systemMemoryInfo();
  const kvStore = container.db as KV;

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
  console.log(
    Colors.dim(`  Used:       `),
    `${
      Math.round(
        (1 - (sysMemory.available || 0) / (sysMemory.total || 1)) * 100,
      )
    }%`,
  ); // Calculate and log system memory usage percentage

  console.log("\n" + Colors.bold(Colors.blue("Database Statistics:")));

  // Ledger row count
  let ledgerSetCount = 0;
  let ledgerDeleteCount = 0;
  let ledgerInvalidCount = 0;
  if (kvStore) {
    try {
      for await (const entry of kvStore.scan([], true)) {
        if (entry.operation === KVOperation.SET) {
          ledgerSetCount++;
        } else if (entry.operation === KVOperation.DELETE) {
          ledgerDeleteCount++;
        }
      }
    } catch (_e) {
      ledgerInvalidCount++;
    }
    console.log(
      Colors.dim(`  Ledger Entries: `),
      ledgerSetCount + ledgerDeleteCount,
    );
    console.log(Colors.dim(`    Set Ops:      `), ledgerSetCount);
    console.log(Colors.dim(`    Delete Ops:   `), ledgerDeleteCount);
    if (ledgerInvalidCount) {
      console.log(Colors.red(`    Invalid Ops:  `), ledgerInvalidCount);
      console.error("    Counting aborted due to invalid operations");
    }

    console.log("");
    try {
      console.log(Colors.dim(`  Index Entries:  `), kvStore.count([{}]));
    } catch (_e) {
      console.log(Colors.dim(`  Index Entries:  N/A`));
    }
  } else {
    console.log(Colors.dim(`  Ledger Entries:  No database open`));
    console.log(Colors.dim(`  Index Entries:   No database open`));
  }
  console.log("");
  // Disk usage
  const dbPath = kvStore?.getLedgerPath();
  if (dbPath) {
    try {
      const fileStats = await stat(dbPath);
      console.log(
        Colors.dim(`  Disk Usage:     `),
        formatBytes(fileStats.size),
      );
    } catch (e) {
      console.error("Error getting database size:", e);
    }
  } else {
    console.log(Colors.dim(`  Disk Usage:      No database open`));
  }
  console.log("");
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

export { stats };
