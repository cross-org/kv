import { readAtPosition } from "./utils/file.ts";
import type { FileHandle } from "node:fs/promises";

/**
 * Manages prefetching data from files for efficient sequential reading.
 *
 * This class optimizes reading by fetching chunks of data larger than the requested amount,
 * reducing the number of file reads needed for sequential access.
 */
export class KVPrefetcher {
  private cache?: Uint8Array;
  private currentChunkStart: number;
  private currentChunkEnd: number;
  private prefetchBytes: number;

  constructor(prefetchBytes: number) {
    this.currentChunkStart = 0;
    this.currentChunkEnd = 0;
    this.prefetchBytes = prefetchBytes;
  }

  /**
   * Fetches a chunk of data from the file.
   *
   * @param fd The file descriptor or handle.
   * @param startPosition The position to start reading from.
   * @param length The desired length of the chunk.
   */
  private async fetchChunk(
    fd: Deno.FsFile | FileHandle,
    startPosition: number,
    length: number,
  ): Promise<void> {
    const chunk = await readAtPosition(
      fd,
      length > this.prefetchBytes ? length : this.prefetchBytes,
      startPosition,
    );
    this.cache = chunk;
    this.currentChunkStart = startPosition;
    this.currentChunkEnd = startPosition + chunk.length;
  }

  /**
   * Reads data from the file, using the cache if possible.
   *
   * @param fd The file descriptor or handle.
   * @param length The amount of data to read.
   * @param position The position to start reading from.
   * @returns The requested data.
   * @throws {Error} If data fetching fails.
   */
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

  /**
   * Clears the cached data.
   */
  public clear() {
    this.cache = undefined;
  }
}
