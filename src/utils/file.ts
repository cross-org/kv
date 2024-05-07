import { open, writeFile } from "node:fs/promises";
import { CurrentRuntime, Runtime } from "@cross/runtime";
import { cwd, isDir, isFile, mkdir, stat, unlink } from "@cross/fs";
import { dirname, isAbsolute, join, resolve } from "@std/path";

export async function writeAtPosition(
  filename: string,
  data: Uint8Array,
  position: number,
) {
  // Deno
  if (CurrentRuntime === Runtime.Deno) {
    const file = await Deno.open(filename, { read: true, write: true });
    await file.seek(position, Deno.SeekMode.Start);
    await file.write(data);
    file.close();

    // Node or Bun
  } else if (CurrentRuntime) { // Node or Bun
    const fd = await open(filename, "r+");
    await fd.write(data, 0, data.length, position);
    await fd.close();
  }
}

export async function readAtPosition(
  filename: string,
  length: number,
  position: number,
): Promise<Uint8Array> {
  // Deno
  if (CurrentRuntime === Runtime.Deno) {
    const file = await Deno.open(filename, { read: true });
    await file.seek(position, Deno.SeekMode.Start);
    const buffer = new Uint8Array(length);
    await file.read(buffer);
    file.close();
    return buffer;

    // Node or Bun
  } else {
    const fd = await open(filename, "r");
    // @ts-ignore cross-runtime
    const buffer = Buffer.alloc(length);
    await fd.read(buffer, 0, length, position);
    await fd.close();
    return buffer;
  }
}

/**
 * Creates a file if it doesn't already exist
 * @param filename The file to create if it doesnt already exist
 * @returns True if created, False if it already existed
 * @throws If the file can not be accessed or created
 */
export async function ensureFile(filename: string): Promise<boolean> {
  // Resolve path
  let filePath;
  if (isAbsolute(filename)) {
    filePath = resolve(filename);
  } else {
    filePath = resolve(join(cwd(), filename));
  }
  const dirPath = dirname(filePath);

  // First ensure dir
  if (!await isDir(filePath)) {
    await mkdir(dirPath, { recursive: true });
  }

  // Then ensure file
  if (await isFile(filename)) {
    // Existed since before
    return false;
  } else {
    if (CurrentRuntime === Runtime.Deno) {
      const file = await Deno.create(filename);
      file.close();
    } else { // Runtime.Node
      await writeFile(filename, "");
    }
    // Created
    return true;
  }
}

/**
 * Locks a file
 * @param filename The file to create if it doesnt already exist
 * @returns True if created, False if it already existed
 * @throws If the file can not be accessed or created
 */
export async function lock(filename: string): Promise<boolean> {
  let filePath;
  if (isAbsolute(filename)) {
    filePath = resolve(filename);
  } else {
    filePath = resolve(join(cwd(), filename));
  }

  const maxRetries = 50; // Adjust as needed
  const retryInterval = 100; // Wait 100ms between attempts
  const staleTimeout = maxRetries * retryInterval + 10000;
  const lockFile = filePath + ".lock";

  // Remove stale lockfile
  try {
    const statResult = await stat(lockFile);
    if (
      statResult?.mtime &&
      Date.now() - statResult.mtime.getTime() > staleTimeout
    ) {
      await unlink(lockFile);
    }
  } catch (_e) { /* Ignore */ }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Attempt to create the lock file (will fail if it exists)
      if (CurrentRuntime === Runtime.Deno) {
        const file = await Deno.open(lockFile, {
          createNew: true,
          write: true,
        });
        file.close();
      } else { // Runtime.Node
        await writeFile(lockFile, "", { flag: "wx" }); // 'wx' for exclusive creation
      }

      // Lock acquired!
      return true;
    } catch (error) {
      if (error.code === "EEXIST" || error.code === "EPERM") {
        // File is locked, wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      } else {
        // Unexpected error, re-throw
        throw error;
      }
    }
  }

  // Could not acquire the lock after retries
  throw new Error("Could not acquire database lock");
}

/**
 * Unlocks a file
 * @param filename The file to create if it doesnt already exist
 * @returns True if unlocked, false if there was no lockfile
 * @throws If the file can not be accessed or created
 */
export async function unlock(filename: string): Promise<boolean> {
  let filePath;
  if (isAbsolute(filename)) {
    filePath = resolve(filename);
  } else {
    filePath = resolve(join(cwd(), filename));
  }

  const lockFile = filePath + ".lock";

  try {
    await unlink(lockFile);
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    } else {
      // Unexpected error, re-throw
      throw error;
    }
  }

  // Could not acquire the lock after retries
  return true;
}
