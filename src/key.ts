export const KV_KEY_ALLOWED_CHARS = /^[a-zA-Z0-9\-_@]+$/;

export interface KVKeyRange {
  from?: string | number;
  to?: string | number;
}

export type KVKeyRepresentation = (string | number | KVKeyRange)[];

export class KVKey {
  constructor(
    private key: KVKeyRepresentation,
    allowRange: boolean = false,
    validate: boolean = true,
  ) {
    if (validate) this.validateKey(allowRange);
    this.key = key;
  }

  get(): KVKeyRepresentation {
    return this.key;
  }

  private validateKey(allowRange: boolean): void {
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
      if (typeof element === "object" && !allowRange) {
        throw new TypeError("Key ranges are not allowed in this context");
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

  public getKeyRepresentation(): string {
    if (this.key.some((element) => typeof element === "object")) {
      throw new Error("getKeyRepresentation does not support keys with ranges");
    }

    return this.key.join(".");
  }
}
