import { KV_KEY_ALLOWED_CHARS } from "./constants.ts";

// Helper function to stringify range values correctly
function stringifyRangeValue(value: string | number): string {
  if (typeof value === "string") {
    return value; // No changes needed for string values
  } else { // Number
    return `#${value}`;
  }
}

// Parse value
function parseValue(v: string): string | number {
  if (v.substring(0, 1) === "#") {
    const parsed = parseInt(v.substring(1), 10);
    if (isNaN(parsed)) {
      throw new TypeError(`Invalid numeric key element: ${parsed}`);
    } else {
      return parsed;
    }
  } else {
    return v;
  }
}

/**
 * Represents a range within a query.
 */
export interface KVQueryRange {
  /**
   * Start key (inclusive) - Optional
   */
  from?: string | number;
  /**
   * End key (inclusive) - Optional
   */
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
 *     - `KVQueryRange`
 */
export type KVQuery = (string | number | KVQueryRange)[];

/**
 * A class to validate and manage key representations.
 */
export class KVKeyInstance {
  private key: KVQuery | KVKey;
  private isQuery: boolean;
  public byteLength?: number;
  hasData: boolean = false;
  constructor(
    key: KVQuery | KVKey | Uint8Array | DataView,
    isQuery: boolean = false,
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

    this.isQuery = isQuery;

    if (validate) this.validate();
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
        // This should never happen if validate() is working correctly
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
   * @throws {TypeError} If the key is invalid.
   */
  private validate(): void {
    if (!Array.isArray(this.key)) {
      throw new TypeError("Key must be an array");
    }

    if (this.key.length === 0) {
      throw new TypeError("Key cannot be empty");
    }

    if (typeof this.key[0] !== "string" && !this.isQuery) {
      throw new TypeError("First index of the key must be a string");
    }

    for (const element of this.key) {
      if (typeof element === "object" && !this.isQuery) {
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
          "String elements in the key can only contain unicode letters, numbers, '@',  '-', and '_'",
        );
      }
    }
  }

  public stringify(): string {
    return this.key.map((element) => {
      if (typeof element === "string") {
        if (element.startsWith("#")) {
          throw new Error("String key elements cannot start with '#'");
        }
        return element;
      } else if (typeof element === "number") {
        return `#${element}`;
      } else if (typeof element === "object") { // Range
        const from = element.from !== undefined
          ? `>=${stringifyRangeValue(element.from)}`
          : "";
        const to = element.to !== undefined
          ? `<=${stringifyRangeValue(element.to)}`
          : "";
        return `${from}${to}`;
      } else {
        throw new Error("Unsupported key element type");
      }
    }).join(".");
  }

  public static parse(queryString: string, isQuery: boolean): KVKey | KVQuery {
    const elements = queryString.split(".");
    const result: KVQuery = [];

    const rangeRegex = /^(>=(#?[\w@-]+))?(<=(#?[\w@-]+))?$/;

    for (const element of elements) {
      if (element === "") { // Handle empty elements as empty objects
        result.push({});
      } else {
        const rangeMatch = element.match(rangeRegex);
        if (rangeMatch) {
          if (!isQuery) {
            throw new TypeError("Ranges are not allowed in keys.");
          }
          result.push({
            from: rangeMatch[2] ? parseValue(rangeMatch[2]) : undefined,
            to: rangeMatch[4] ? parseValue(rangeMatch[4]) : undefined,
          });
        } else {
          const parsed = parseValue(element);
          if (
            typeof parsed === "string" && !KV_KEY_ALLOWED_CHARS.test(parsed)
          ) {
            throw new TypeError(
              `Invalid characters in string key element: ${parsed}`,
            );
          }
          result.push(parsed);
        }
      }
    }

    const instance = new KVKeyInstance(result, isQuery);
    instance.validate();

    return isQuery ? result : result as KVKey;
  }

  /**
   * Checks if this key instance matches a given query, optionally including descendants.
   *
   * This implementation performs strict type matching, ensuring that number elements in the query only match number elements in the key, and likewise for strings.
   *
   * @param query The query to match against.
   * @param recursive If true, the match includes descendant keys; if false, only the exact key matches.
   * @returns `true` if the key matches the query (and optionally its descendants), `false` otherwise.
   */
  public matchesQuery(query: KVQuery, recursive: boolean = false): boolean {
    const thisKey = this.get() as KVKey;

    if (!recursive && thisKey.length < query.length) {
      return false;
    }

    if (thisKey.length > query.length && !recursive) {
      return false;
    }

    for (let i = 0; i < query.length; i++) {
      const queryElement = query[i];
      const keyElement = thisKey[i];
      if (typeof queryElement === "string") {
        if (typeof keyElement !== "string" || queryElement !== keyElement) {
          return false;
        }
      } else if (typeof queryElement === "number") {
        if (typeof keyElement !== "number" || queryElement !== keyElement) {
          return false;
        }
      } else if (typeof queryElement === "object") {
        if (
          // String comparison
          (typeof keyElement === "string" &&
            (queryElement.from === undefined ||
              keyElement >= (queryElement.from as string)) &&
            (queryElement.to === undefined ||
              keyElement <= (queryElement.to as string))) ||
          // Number comparison
          (typeof keyElement === "number" &&
            (queryElement.from === undefined ||
              keyElement >= (queryElement.from as number)) &&
            (queryElement.to === undefined ||
              keyElement <= (queryElement.to as number)))
        ) {
          /* Ok */
        } else {
          return false;
        }
      } else {
        throw new Error(`Invalid query element type at index ${i}`);
      }

      // Recursively check descendants if needed
      if (recursive && thisKey.length > i + 1) {
        const subquery = query.slice(i + 1);
        const subkey = thisKey.slice(i + 1);
        if (
          !new KVKeyInstance(subkey, true).matchesQuery(subquery, recursive)
        ) {
          return false;
        }
      }
    }

    return true; // All elements match
  }
}
