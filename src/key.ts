export const KV_KEY_ALLOWED_CHARS = /^[a-zA-Z0-9\-_]+$/;

export interface KVKeyRange {
  from?: string;
  to?: string;
}

export type KVKeyRepresentation = (string | number | KVKeyRange)[];

export class KVKey {
  constructor(
    private key: KVKeyRepresentation,
    allowRange: boolean = false,
  ) {
    this.validateKey(allowRange);
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
        if (!element.from || !element.to) {
          throw new TypeError(
            'Ranges must have both "from" and "to" properties',
          );
        }
      }

      if (typeof element !== "string" && typeof element !== "number") {
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
