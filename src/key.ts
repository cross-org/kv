import { KV_KEY_ALLOWED_CHARS } from "./constants.ts";

/**
 * Represents a range within a key.
 */
export interface KVKeyRange {
  from?: string | number;
  to?: string | number;
}

/**
 * A representation of a KV key.
 *
 * A key is an array where:
 *   - The first element MUST be a string.
 *   - Subsequent elements can be:
 *     - Strings (matching `KV_KEY_ALLOWED_CHARS`)
 *     - Numbers
 */
export type KVKey = (string | number)[];

/**
 * A representation of a KV query.
 *
 * A query is an array where:
 *   - The first element MUST be a string.
 *   - Subsequent elements can be:
 *     - Strings (matching `KV_KEY_ALLOWED_CHARS`)
 *     - Numbers
 *     - `KVKeyRange`
 */
export type KVQuery = (string | number | KVKeyRange)[];

/**
 * A class to validate and manage key representations.
 */
export class KVKeyInstance {
  private key: KVQuery | KVKey;
  public byteLength?: number;
  hasData: boolean = false;
  constructor(
    key: KVQuery | KVKey | Uint8Array | DataView,
    allowRange: boolean = false,
    validate: boolean = true,
  ) {
    if (key instanceof Uint8Array) {
      this.key = this.fromUint8Array(
        new DataView(key.buffer, key.byteOffset, key.byteLength),
      );
      this.hasData = true;
    } else if (key instanceof DataView) {
      this.key = this.fromUint8Array(key);
      this.hasData = true;
    } else {
      this.key = key;
    }

    if (validate) this.validateKey(allowRange);
  }

  /**
   * Encodes the key elements into a byte array suitable for storage in a transaction header.
   */
  public toUint8Array(): Uint8Array {
    const keyBytesArray = [];
    for (const element of this.key) {
      if (typeof element === "string") {
        keyBytesArray.push(new Uint8Array([0])); // Type: String
        const strBytes = new TextEncoder().encode(element);
        const strLengthBytes = new Uint8Array(4);
        new DataView(strLengthBytes.buffer).setUint32(
          0,
          strBytes.length,
          false,
        );
        keyBytesArray.push(strLengthBytes);
        keyBytesArray.push(strBytes);
      } else if (typeof element === "number") {
        keyBytesArray.push(new Uint8Array([1])); // Type: Number
        const numBytes = new Uint8Array(8);
        new DataView(numBytes.buffer).setFloat64(0, element, false);
        keyBytesArray.push(numBytes);
      } else {
        // This should never happen if validateKey() is working correctly
        throw new TypeError("Invalid key element type");
      }
    }

    // Encode the number of key elements
    const numKeyElementsBytes = new Uint8Array(1);
    new DataView(numKeyElementsBytes.buffer).setUint8(
      0,
      this.key.length,
    );
    keyBytesArray.unshift(numKeyElementsBytes); // Add to the beginning

    const keyArray = new Uint8Array(
      keyBytesArray.reduce((a, b) => a + b.length, 0),
    );
    let keyOffset = 0;
    for (const bytes of keyBytesArray) {
      keyArray.set(bytes, keyOffset);
      keyOffset += bytes.length;
    }
    return keyArray;
  }

  /**
   * Decodes a key from a byte array.
   *
   * @param data - The byte array containing the encoded key.
   * @throws {Error} If the key cannot be decoded.
   */
  private fromUint8Array(dataView: DataView): KVKey {
    let offset = 0;

    // 1. Decode Number of Key Elements (uint32)
    const numKeyElements = dataView.getUint8(offset);
    offset += 1;

    const keyToBe: KVKey = [];

    for (let i = 0; i < numKeyElements; i++) {
      // 2. Decode Element Type (uint8): 0 for string, 1 for number
      const elementType = dataView.getUint8(offset);
      offset += 1;

      if (elementType === 0) { // String
        // 3a. Decode String Length (uint32)
        const strLength = dataView.getUint32(offset, false);
        offset += 4;

        // 3b. Decode String Bytes
        const strBytes = new DataView(
          dataView.buffer,
          dataView.byteOffset + offset,
          strLength,
        );
        keyToBe.push(new TextDecoder().decode(strBytes));
        offset += strLength;
      } else if (elementType === 1) { // Number
        // 3c. Decode Number (float64)
        const numValue = dataView.getFloat64(offset, false);
        keyToBe.push(numValue);
        offset += 8;
      } else {
        throw new Error(`Invalid key element type ${elementType}`);
      }
    }
    this.byteLength = offset;
    return keyToBe;
  }

  get(): KVQuery | KVKey {
    return this.key;
  }

  /**
   * Validates the key representation against the defined rules.
   *
   * @param query - Whether to allow key ranges within the representation.
   * @throws {TypeError} If the key is invalid.
   */
  private validateKey(query: boolean): void {
    if (!Array.isArray(this.key)) {
      throw new TypeError("Key must be an array");
    }

    if (this.key.length === 0) {
      throw new TypeError("Key cannot be empty");
    }

    if (typeof this.key[0] !== "string") {
      throw new TypeError("First index of the key must be a string");
    }

    for (const element of this.key) {
      if (typeof element === "object" && !query) {
        throw new TypeError("Key ranges are only allowed in queries");
      }

      if (typeof element === "object") {
        const allowedKeys = ["from", "to"];
        const elementKeys = Object.keys(element);

        // Check for empty object
        if (elementKeys.length === 0) {
          return; // Allow an empty object
        }

        // Check for additional keys
        if (!elementKeys.every((key) => allowedKeys.includes(key))) {
          throw new TypeError(
            'Ranges must have only "from" and/or "to" keys',
          );
        }
      }

      if (
        typeof element !== "string" && typeof element !== "number" &&
        !(element.from !== undefined || element.to != undefined)
      ) {
        throw new TypeError("Key elements must be strings or numbers");
      }

      if (typeof element === "string" && !KV_KEY_ALLOWED_CHARS.test(element)) {
        throw new TypeError(
          "String elements in the key can only contain a-zA-Z, 0-9, '-', and '_'",
        );
      }
    }
  }

  /**
   * Gets a string representation of the key (without ranges).
   *
   * @throws {Error} If the key contains ranges.
   */
  public getKeyRepresentation(): string {
    if (this.key.some((element) => typeof element === "object")) {
      throw new Error("getKeyRepresentation does not support keys with ranges");
    }

    return this.key.join(".");
  }
}
