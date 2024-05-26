import type { KVKeyInstance, KVQueryRange } from "./key.ts";

/**
 * Represents content of a node within the KVIndex tree.
 */
export interface KVIndexContent {
  /**
   * Holds references to child nodes in the index.
   */
  children: KVIndexNodes;
  /**
   * Optional reference to a data offset. Present for leaf nodes.
   */
  reference?: number;
}

/**
 * A Map containing child keys and their corresponding Node within the tree.
 */
type KVIndexNodes = Map<string | number, KVIndexContent>;

/**
 * In-memory representation of a Key-Value index enabling efficient key-based lookups.
 * It uses a tree-like structure for fast prefix and range-based searches.
 */
export class KVIndex {
  public index!: KVIndexContent;
  constructor() {
    this.clear(); // sets this.index
  }

  /**
   * Fully reset the index
   */
  clear() {
    this.index = {
      children: new Map(),
    };
  }

  /**
   * Adds an entry to the index.
   * @throws {Error} If 'overwrite' is false and a duplicate key is found.
   */
  add(key: KVKeyInstance, offset: number) {
    let current = this.index;
    const keyParts = key.get(); // Get key parts once to avoid repeated calls

    for (const part of keyParts) {
      let currentPart = current.children.get(part as string | number);
      if (!currentPart) {
        currentPart = { children: new Map() };
        current.children.set(part as string | number, currentPart);
      }
      current = currentPart;
    }

    current.reference = offset; // Direct assignment
  }

  /**
   * Removes an entry from the index based on a provided key.
   * @param transaction - The transaction to remove.
   * @returns The removed data row reference, or undefined if the key was not found.
   */
  delete(key: KVKeyInstance): number | undefined {
    let current = this.index;
    for (const part of key.get()) {
      const currentPart = current.children.get(part as (string | number));
      if (!currentPart || !currentPart.children) { // Key path not found
        return undefined;
      }
      current = currentPart;
    }

    // If we reach here, we've found the leaf node
    const oldReference = current.reference;
    delete current.reference;

    // No need to cleanup as leftover nodes will be lost at next rebuild
    return oldReference;
  }

  /**
   * Retrieves a list of data row references associated with a given key.
   * Supports prefix and range-based searches.
   * @param key - The key to search for (can include ranges)
   * @returns An array of data row references.
   */
  get(key: KVKeyInstance, limit?: number): number[] {
    const resultSet: number[] = [];
    const keyLength = key.get().length;

    function recurse(node: KVIndexContent, keyIndex: number): void {
      if (limit !== undefined && resultSet.length >= limit) return; // Stop recursion early if limit reached

      if (keyIndex >= keyLength) {
        // We've reached the end of the key
        if (node.reference !== undefined) {
          resultSet.push(node.reference);
        }
        // Recurse into all children
        for (const childNode of node.children.values()) {
          recurse(childNode, keyIndex);
        }
        return;
      }

      const keyPart = key.get()[keyIndex];

      if (typeof keyPart === "string" || typeof keyPart === "number") {
        // Standard string/number part
        const childNode = node.children.get(keyPart);
        if (childNode) {
          recurse(childNode, keyIndex + 1);
        }
      } else if (
        typeof keyPart === "object"
      ) {
        const range = keyPart as KVQueryRange;

        // Key range
        for (const [index, childNode] of node.children.entries()) {
          // Iterate over children, comparing the index to the range
          if (
            // Shortcut for empty key = all
            (range.from === undefined && range.to === undefined) ||
            // String comparison
            (typeof index === "string" &&
              (range.from === undefined || index >= (range.from as string)) &&
              (range.to === undefined || index <= (range.to as string))) ||
            // Number comparison
            (typeof index === "number" &&
              (range.from === undefined || index >= (range.from as number)) &&
              (range.to === undefined || index <= (range.to as number)))
          ) {
            recurse(childNode, keyIndex + 1);
          }
        }
      }
    }

    // Start recursion from the root of the tree
    recurse(this.index, 0);

    return resultSet;
  }

  /**
   * Retrieves the child keys of a given key.
   *
   * @param key - The key (or null for root level).
   * @returns An array of child keys at the next level.
   */
  public getChildKeys(key: KVKeyInstance | null): string[] {
    let currentNode: KVIndexContent | undefined = this.index;

    // Navigate to the node of the provided key (or root)
    if (key !== null) {
      const keyParts = key.get();
      for (const part of keyParts) {
        currentNode = currentNode.children.get(part as (string | number));
        if (!currentNode) {
          return []; // Key not found, no children
        }
      }
    }

    // Return the keys at the next level
    return Array.from(currentNode.children.keys()).map(String);
  }
}