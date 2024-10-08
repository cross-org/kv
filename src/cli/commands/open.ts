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
    const openResult = await container.db.open(dbPath, true, true);
    // Operation succeeded
    if (openResult?.errors.length > 0) {
      // Print errors in a user-friendly way
      console.error(`Errors occurred during database opening:`);
      for (const error of openResult.errors) {
        if (error) {
          if (error.cause) {
            console.error(`\t  ${error.cause}`);
          } else if (error.message) {
            console.error(`\t- ${error.message}`);
          } else {
            console.error(`\t- ${error}`);
          }
        } else {
          console.error(`\t- An unknown error occurred.`);
        }
      }
    }
    return true;
  } catch (e) {
    await container.db.close();
    container.db = undefined;
    console.error(`Could not open database: ${e.message}`);
    if (e.cause) console.error(`\t${e.cause}`);
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
    const openResult = await container.db.open(dbPath, true, true);
    // Operation succeeded
    if (openResult?.errors) {
      // Print errors in a user-friendly way
      console.error(`Errors occurred during database opening:`);
      for (const error of openResult.errors) {
        if (error) {
          if (error.cause) {
            console.error(`\t  ${error.cause}`);
          } else if (error.message) {
            console.error(`\t- ${error.message}`);
          } else {
            console.error(`\t- ${error}`);
          }
        } else {
          console.error(`\t- An unknown error occurred.`);
        }
      }
    }
    return true;
  } catch (e) {
    console.error(`Could not open database: ${e.message}`);
    return false;
  }
}
