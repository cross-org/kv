import {
  ensureMaxParameters,
  ensureOpen,
  type KVDBContainer,
} from "../common.ts";

export async function vacuum(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureOpen(container)) return false;
  if (!ensureMaxParameters(params, 0)) return false;

  console.log("");

  try {
    await container.db?.vacuum();
    console.log("Vacuum done.");
    console.log("");
    return true;
  } catch (e) {
    console.error(`Vacuum failed: ${e.message}`);
    console.log("");
    return false;
  }
}
