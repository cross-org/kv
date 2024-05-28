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

  await container.db?.vacuum();

  console.log("Vacuum done.");

  return true;
}
