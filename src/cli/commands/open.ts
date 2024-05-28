import { Colors } from "@cross/utils";
import { KV } from "../../../mod.ts";
import {
  ensureMaxParameters,
  hasParameter,
  type KVDBContainer,
} from "../common.ts";

/**
 * @private
 */
function ensureClosed(container: KVDBContainer): boolean {
  if (container.db?.isOpen()) {
    console.log(Colors.red("A database is already open."));
    return false;
  } else {
    return true;
  }
}

export async function open(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureClosed(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;
  let dbPath;
  if (hasParameter(params, 0)) {
    dbPath = params[0];
  } else {
    console.error(Colors.red("No database specified."));
    return false;
  }
  container.db = new KV();
  try {
    await container.db.open(dbPath, true);
    return true;
  } catch (e) {
    console.error(`Could not open database: ${e.message}`);
    return false;
  }
}

export async function openNoIndex(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  if (!ensureClosed(container)) return false;
  if (!ensureMaxParameters(params, 1)) return false;
  let dbPath;
  if (hasParameter(params, 0)) {
    dbPath = params[0];
  } else {
    console.error(Colors.red("No database specified."));
    return false;
  }
  container.db = new KV({ disableIndex: true });
  try {
    await container.db.open(dbPath, true);
    return true;
  } catch (e) {
    console.error(`Could not open database: ${e.message}`);
    return false;
  }
}
