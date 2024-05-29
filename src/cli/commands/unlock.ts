import { ensureOpen, type KVDBContainer } from "../common.ts";
import { Colors } from "@cross/utils";

export async function unlock(
  container: KVDBContainer,
  _params: string[], // No additional parameters needed
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  const kvStore = container.db;

  console.log("");

  try {
    if (kvStore) {
      await kvStore.forceUnlockLedger();
      console.log(Colors.green("Ledger unlocked successfully."));
    } else {
      console.error(Colors.red("No database is currently open."));
      return false;
    }
  } catch (e) {
    console.error(Colors.red(`Unlock failed: ${e.message}`));
    return false;
  }

  console.log("");
  return true;
}
