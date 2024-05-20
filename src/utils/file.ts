import { type FileHandle, open, writeFile } from "node:fs/promises";
import { CurrentRuntime, Runtime } from "@cross/runtime";
import { cwd, isDir, isFile, mkdir, stat, unlink } from "@cross/fs";
import { dirname, isAbsolute, join, resolve } from "@std/path";
import {
  LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS,
  LOCK_DEFAULT_MAX_RETRIES,
  LOCK_STALE_TIMEOUT_MS,
} from "../constants.ts";

export function toAbsolutePath(filename: string): string {
  let filePath;
  if (isAbsolute(filename)) {
    filePath = resolve(filename);
  } else {
    filePath = resolve(join(cwd(), filename));
  }
  return filePath;
}

export async function writeAtPosition(
  fd: Deno.FsFile | FileHandle,
  data: Uint8Array,
  position: number,
) {
  // Deno
  if (CurrentRuntime === Runtime.Deno) {
    await (fd as Deno.FsFile).seek(position, Deno.SeekMode.Start);
    await fd.write(data);

    // Node or Bun
  } else if (CurrentRuntime) { // Node or Bun
    await fd.write(data, 0, data.length, position);
  }
}

export async function rawOpen(
  filename: string,
  write: boolean = true,
): Promise<Deno.FsFile | FileHandle> {
  // Deno
  if (CurrentRuntime === Runtime.Deno) {
    return await Deno.open(filename, { read: true, write: write });
  } else {
    const mode = write ? "r+" : "r";
    return await open(filename, mode);
  }
}

export async function readAtPosition(
  fd: Deno.FsFile | FileHandle,
  length: number,
  position: number,
): Promise<Uint8Array> {
  // Deno
  if (CurrentRuntime === Runtime.Deno) {
    await (fd as Deno.FsFile).seek(position, Deno.SeekMode.Start);
    const buffer = new Uint8Array(length);
    await fd.read(buffer);
    return buffer;

    // Node or Bun
  } else {
    // @ts-ignore cross-runtime
    const buffer = Buffer.alloc(length);
    await fd.read(buffer, 0, length, position);
    return buffer;
  }
}

/**
 * Locks a file
 * @param filename The file to create if it doesnt already exist
 * @returns True if created, False if it already existed
 * @throws If the file can not be accessed or created
 */
export async function lock(filePath: string): Promise<boolean> {
  const retryInterval = LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS;
  const lockFile = filePath + "-lock";

  // Remove stale lockfile
  try {
    const statResult = await stat(lockFile);
    if (
      statResult?.mtime &&
      Date.now() - statResult.mtime.getTime() > LOCK_STALE_TIMEOUT_MS
    ) {
      await unlink(lockFile);
    }
  } catch (_e) { /* */ }

  for (let attempt = 0; attempt < LOCK_DEFAULT_MAX_RETRIES; attempt++) {
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
        await new Promise((resolve) =>
          setTimeout(resolve, retryInterval + attempt * retryInterval)
        );
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
export async function unlock(filePath: string): Promise<boolean> {
  const lockFile = filePath + "-lock";

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

/**
 * Creates a file if it doesn't already exist
 * @param filename The file to create if it doesnt already exist
 * @returns True if created, False if it already existed
 * @throws If the file can not be accessed or created
 */
export async function ensureFile(filePath: string): Promise<boolean> {
  const dirPath = dirname(filePath);

  // First ensure dir
  if (!await isDir(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  // Then ensure file
  if (await isFile(filePath)) {
    // Existed since before
    return true;
  } else {
    // Create new file
    if (CurrentRuntime === Runtime.Deno) {
      const file = await Deno.create(filePath);
      file.close();
    } else { // Runtime.Node
      await writeFile(filePath, "");
    }

    // Created
    return false;
  }
}
