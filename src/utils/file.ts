import { type FileHandle, open, writeFile } from "node:fs/promises";
import { CurrentRuntime, Runtime } from "@cross/runtime";
import { cwd, isDir, isFile, mkdir } from "@cross/fs";
import { dirname, isAbsolute, join, resolve } from "@std/path";

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
