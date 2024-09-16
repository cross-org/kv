import {
  ensureMaxParameters,
  ensureOpen,
  type KVDBContainer,
} from "../common.ts";

export async function sync(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 0)) return false;
  console.log("");
  try {
    const syncResult = await container.db?.sync();
    if (syncResult) {
      if (syncResult.errors.length > 0) {
        console.error(
          `Sync failed, status: ${syncResult.result}, error: ${syncResult.errors}`,
        );
        console.log("");
        return false;
      } else {
        console.log(`Sync done, status: ${syncResult.result}.`);
        console.log("");
        return true;
      }
    } else {
      console.error(`Sync failed: No result`);
      console.log("");
      return false;
    }
  } catch (e) {
    console.error(`Sync failed: ${e.message}`);
    console.log("");
    return false;
  }
}
