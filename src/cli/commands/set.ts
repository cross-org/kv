import { Colors } from "@cross/utils";
import type { KVDBContainer } from "../common.ts";
import { type KVKey, KVKeyInstance } from "../../lib/key.ts";
// Type for Set Handlers
export interface SetHandler {
  execute(
    container: KVDBContainer,
    key: KVKey,
    data: unknown,
  ): Promise<boolean>;
}

async function handleSetCommand(
  container: KVDBContainer,
  params: string[],
  dataType: string,
  parseData: (dataString: string) => unknown,
): Promise<boolean> {
  if (!params[0]) {
    console.error(Colors.red("Key not specified."));
    return false;
  }
  let key: KVKey;
  try {
    key = KVKeyInstance.parse(params[0], false) as KVKey;
  } catch (e) {
    console.error(`Could not parse key: ${e.message}`);
    return false;
  }

  if (!params[1]) {
    console.error(Colors.red(`Data not specified, should be ${dataType}.`));
    return false;
  }

  let value;
  try {
    value = parseData(params[1]);
  } catch (e) {
    console.error(Colors.red(e.message + ".\n"));
    return false;
  }
  try {
    await container.db?.set(key, value);
  } catch (e) {
    console.error(Colors.red(e.message + ".\n"));
    return false;
  }
  return true;
}

export async function setString(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(container, params, "string", (s) => s);
}

export async function setNumber(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(container, params, "number", (s) => {
    const num = parseFloat(s);
    if (isNaN(num)) throw new Error("Invalid number");
    return num;
  });
}

export async function setJson(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(container, params, "JSON", (s) => {
    try {
      return JSON.parse(s);
    } catch (_e) {
      throw new Error("Invalid JSON");
    }
  });
}

export async function setDate(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(
    container,
    params,
    "date (ISO 8601 format)",
    (s) => {
      const date = new Date(s);
      if (isNaN(date.getTime())) {
        throw new Error(
          "Invalid date format. Use ISO 8601 (e.g., 2024-05-24T12:34:56Z)",
        );
      }
      return date;
    },
  );
}

export async function setBoolean(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(
    container,
    params,
    "boolean (true/false)",
    (s) => s.toLowerCase() === "true",
  );
}

export async function setBigint(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(
    container,
    params,
    "bigint (e.g., 12345678901234567890n)",
    (s) => {
      try {
        return BigInt(s);
      } catch (_e) {
        throw new Error("Invalid BigInt format");
      }
    },
  );
}

export async function setArray(
  container: KVDBContainer,
  params: string[],
): Promise<boolean> {
  return await handleSetCommand(
    container,
    params,
    "array (comma-separated)",
    (s) => s.split(",").map((v) => v.trim()),
  );
}
