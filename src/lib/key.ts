import { decode, encode } from "cbor-x";
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
  constructor(
    key: KVQuery | KVKey | Uint8Array,
    isQuery: boolean = false,
    validate: boolean = true,
  ) {
    if (key instanceof Uint8Array) {
      this.key = this.fromUint8Array(key);
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
    const data = encode(this.key);
    return new Uint8Array(data, 0, data.byteLength);
  }

  /**
   * Decodes a key from a byte array.
   *
   * @param data - The byte array containing the encoded key.
   * @throws {Error} If the key cannot be decoded.
   */
  private fromUint8Array(data: Uint8Array): KVKey {
    this.key = decode(data);
    return this.key as KVKey;
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

        // Check for not mixing number from with string to and vice versa
        if (
          (typeof element.from === "number" &&
            typeof element.to === "string") ||
          (typeof element.from === "string" && typeof element.to === "number")
        ) {
          throw new TypeError("Cannot mix string and number in ranges");
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

    const instance = new KVKeyInstance(result, isQuery, false);
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

    // Shortcut for []
    if (thisKey.length === 0 && recursive) {
      return true;
    }

    // Shortcut for [{}]
    if (
      thisKey.length === 1 && typeof thisKey[0] === "object" &&
      (thisKey[0] as KVQueryRange).from === undefined &&
      (thisKey[0] as KVQueryRange).to === undefined
    ) {
      return true;
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
          !new KVKeyInstance(subkey, true, false).matchesQuery(
            subquery,
            recursive,
          )
        ) {
          return false;
        }
      }
    }

    return true; // All elements match
  }
}
