import {
  ensureMaxParameters,
  ensureOpen,
  type KVDBContainer,
} from "../common.ts";

export async function repair(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 0)) return false;

  console.log("");

  try {
    await container.db?.vacuum(true);
    console.log("Repair done.");
    console.log("");
    return true;
  } catch (e) {
    console.log(e);
    console.error(`Repair failed: ${e.message}`);
    console.log("");
    return false;
  }
}
