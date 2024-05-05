// deno-lint-ignore-file no-explicit-any
import { exists, mkdir } from "@cross/fs";
import { KVIndex } from "./index.ts";

import { dirname, resolve } from "@std/path";
import { KVKey, type KVKeyRepresentation } from "./key.ts";
import { decode, encode } from "cbor-x";
export interface KVStore {
  set(key: KVKeyRepresentation, value: any): Promise<void>;
  get(key: KVKeyRepresentation): Promise<any | null>;
  delete(key: KVKeyRepresentation): Promise<void>;
}

export class CrossKV implements KVStore {
  private index?: KVIndex;
  private dataPath?: string;

  constructor() {
  }

  public async open(filePath: string) {
    const indexPath = filePath + ".idx";
    await this.ensurePath(indexPath);
    this.index = new KVIndex(indexPath);

    // Initial load
    await this.index.loadIndex();

    this.dataPath = filePath + ".data";
    await this.ensurePath(this.dataPath);
  }

  public async sync() {
    // Save index if needed
    await this.index?.saveIndex();
  }

  public async close() {
    await this.sync();
  }

  private async ensurePath(filePath: string): Promise<void> {
    if (!await exists(filePath)) {
      await mkdir(dirname(resolve(filePath)), { recursive: true });
    }
  }

  private ensureOpen(): void {
    if (!this.index || !this.dataPath) {
      throw new Error("Database not open");
    }
  }

  async get(key: KVKeyRepresentation): Promise<any | null> {
    const result = await this.getMany(key, 1);
    if (result.length) {
      return result[0];
    } else {
      return null;
    }
  }

  async getMany(key: KVKeyRepresentation, limit?: number): Promise<any[]> {
    // Ensure the database is open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key, true);

    const offsets = this.index!.get(validatedKey)!;

    if (offsets === null || offsets.length === 0) {
      return [];
    }

    const results: any[] = [];
    let count = 0;

    for (const offset of offsets) {
      count++;

      const fd = await Deno.open(this.dataPath!, { read: true, write: false });
      await fd.seek(offset, Deno.SeekMode.Start);

      // Read length prefix
      const lengthPrefixBuffer = new Uint8Array(2);
      await fd.read(lengthPrefixBuffer);
      const dataLength = new DataView(lengthPrefixBuffer.buffer).getUint16(
        0,
        false,
      ); // Big endian

      // Read the data
      const dataBuffer = new Uint8Array(dataLength);
      await fd.read(dataBuffer);

      // Read and validate null terminator
      const nullTerminatorBuffer = new Uint8Array(1);
      await fd.read(nullTerminatorBuffer);

      if (nullTerminatorBuffer[0] !== 0x00) {
        await fd.close();
        throw new Error("Invalid data format: Missing null terminator");
      }

      await fd.close();
      results.push(await this.decodeValue(dataBuffer));

      if (limit && count >= limit) return results;
    }
    return results;
  }

  async writeData(encodedData: Uint8Array): Promise<number> { // Return the row number
    // Throw if database isn't open
    this.ensureOpen();

    const fd = await Deno.open(this.dataPath!, {
      write: true,
      read: true,
      create: true,
    });

    // Get current offset
    const offset = await fd.seek(0, Deno.SeekMode.End);

    // Add length prefix (2 bytes)
    const lengthPrefix = new Uint8Array(2);
    new DataView(lengthPrefix.buffer).setUint16(0, encodedData.length, false); // Big endian
    await fd.write(lengthPrefix);
    await fd.write(encodedData);
    await fd.write(new Uint8Array([0x00])); // Add a null terminator
    await fd.close();

    return offset; // Return the offset
  }

  async set(
    key: KVKeyRepresentation,
    value: any,
    overwrite: boolean = false,
  ): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key);

    const encodedData = await this.encodeValue(value);
    const rowNumber = await this.writeData(encodedData);
    this.index!.add(validatedKey, rowNumber, overwrite); // Update KVIndex
  }

  async delete(key: KVKeyRepresentation): Promise<void> {
    // Throw if database isn't open
    this.ensureOpen();

    // Ensure the key is ok
    const validatedKey = new KVKey(key);

    if (this.index!.delete(validatedKey) !== undefined) {
      await this.index!.saveIndex();
    } else {
      throw new Error(`Key not found: ${validatedKey.getKeyRepresentation()}`);
    }
    // ToDo: logic to free up space in the data file if needed
  }

  private encodeValue(value: any): Uint8Array {
    const rawData = encode(value);
    const buffer = new Uint8Array(rawData.length + 2);
    buffer[0] = rawData.length;
    buffer.set(rawData, 2); // Copy compressed data after the type id
    return buffer;
  }

  private decodeValue(data: Uint8Array): any {
    const view = new DataView(data.buffer);
    const dataLength = view.getUint16(0);
    return decode(data.slice(2, dataLength));
  }
}
