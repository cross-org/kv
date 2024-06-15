import { readAtPosition } from "./utils/file.ts";
import type { FileHandle } from "node:fs/promises";
import { LEDGER_PREFETCH_BYTES } from "./constants.ts";

export class KVPrefetcher {
  private cache?: Uint8Array;
  private currentChunkStart: number;
  private currentChunkEnd: number;

  constructor() {
    this.currentChunkStart = 0;
    this.currentChunkEnd = 0;
  }

  private async fetchChunk(
    fd: Deno.FsFile | FileHandle,
    startPosition: number,
    length: number,
  ): Promise<void> {
    const chunk = await readAtPosition(
      fd,
      length > LEDGER_PREFETCH_BYTES ? length : LEDGER_PREFETCH_BYTES,
      startPosition,
    );
    this.cache = chunk;
    this.currentChunkStart = startPosition;
    this.currentChunkEnd = startPosition + chunk.length;
  }

  public async read(
    fd: Deno.FsFile | FileHandle,
    length: number,
    position: number,
  ): Promise<Uint8Array> {
    // Ensure we have the required chunk
    if (
      position < this.currentChunkStart ||
      position + length > this.currentChunkEnd
    ) {
      await this.fetchChunk(fd, position, length);
    }

    if (!this.cache) {
      throw new Error("Failed to fetch data");
    }

    // Use slice to always return a fresh Uint8Array without an internal offset
    // to the underlying buffer
    return this.cache.slice(
      position - this.currentChunkStart,
      position - this.currentChunkStart + length,
    );
  }

  public clear() {
    this.cache = undefined;
  }
}
